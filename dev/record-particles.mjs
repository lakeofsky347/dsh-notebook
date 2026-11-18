import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createPreviewServer } from './serve.mjs'

// Records the current plugin's native whale indicator in the local fixture UI. No image synthesis,
// clock overrides, external fetches, or model requests are used.
// Run: npm run preview:motion (preview:particles remains a compatible alias).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, process.env.DSH_NOTEBOOK_MOTION_OUTPUT || 'output/motion')
const chromeBinary = process.env.CHROME_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync)
const ffmpegBinary = process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg'
if (!chromeBinary) throw new Error('未找到 Chrome；可通过 CHROME_BIN 指定浏览器。')
if (!existsSync(ffmpegBinary)) throw new Error('未找到 ffmpeg；可通过 FFMPEG_BIN 指定现有安装。')

const width = 1440
const height = 960
const durationSeconds = 6
const captureFps = 12
const gifMaxBytes = 8 * 1024 * 1024
await mkdir(outputDir, { recursive: true })
const temporaryDir = await mkdtemp(join(tmpdir(), 'nb-motion-'))
const userData = join(temporaryDir, 'chrome')
const framesDir = join(temporaryDir, 'frames')
await mkdir(framesDir)
const server = createPreviewServer()
let chrome
let socket
let sequence = 0
let chromeStderr = ''
const pending = new Map()
const report = {
  fixtureOnly: true, actualDom: true, motionKind: 'native-apng-mask', viewport: { width, height },
  durationSeconds, captureFps, capturedFrames: 0, timestamps: [],
  exceptions: [], files: {},
}

async function poll(read, timeoutMs = 20000) {
  const deadline = performance.now() + timeoutMs
  let lastError
  while (performance.now() < deadline) {
    try { const result = await read(); if (result) return result } catch (error) { lastError = error }
    await delay(50)
  }
  throw lastError || new Error('等待当前客户端的轻量运行提示超时，请检查 src/client.js 的活动状态。')
}

function send(method, params = {}, sessionId, timeoutMs = 15000) {
  const id = ++sequence
  return new Promise((resolveRequest, rejectRequest) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      rejectRequest(new Error('CDP timeout: ' + method))
    }, timeoutMs)
    pending.set(id, {
      resolve(value) { clearTimeout(timer); resolveRequest(value) },
      reject(error) { clearTimeout(timer); rejectRequest(error) },
    })
    try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) }
    catch (error) { pending.get(id)?.reject(error); pending.delete(id) }
  })
}

async function evaluate(sessionId, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

async function screenshot(sessionId, path, format = 'png') {
  const result = await send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 94 } : {}), fromSurface: true }, sessionId)
  await writeFile(path, Buffer.from(result.data, 'base64'))
}

async function ffmpeg(args) {
  const child = spawn(ffmpegBinary, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000) })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 45000)
  try {
    const [code] = await once(child, 'close')
    if (code !== 0) throw new Error(timedOut ? 'ffmpeg 编码超过 45 秒，已停止本次编码进程。' : 'ffmpeg failed: ' + stderr)
  } finally { clearTimeout(timer) }
}

function even(value) { return Math.max(2, Math.floor(value / 2) * 2) }

async function stopChrome() {
  if (!chrome || chrome.exitCode !== null || chrome.signalCode !== null) return
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close', {}, undefined, 1000) } catch {}
  }
  if (chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM')
    await Promise.race([once(chrome, 'exit'), delay(1500)])
  }
  if (chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGKILL')
    await Promise.race([once(chrome, 'exit'), delay(1000)])
  }
}

try {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port
  chrome = spawn(chromeBinary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-device-scale-factor=1',
    '--remote-debugging-port=0', '--user-data-dir=' + userData, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  chrome.stderr.on('data', chunk => { chromeStderr = (chromeStderr + chunk).slice(-30000) })
  const endpoint = await poll(() => chromeStderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1])
  socket = new WebSocket(endpoint)
  await once(socket, 'open')
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('Browser connection closed'))
    pending.clear()
  })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const request = window.requestAnimationFrame.bind(window); window.__nbRafRequests = 0; window.requestAnimationFrame = callback => { window.__nbRafRequests++; return request(callback) }; })()` }, sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId)
  await send('Page.navigate', { url: base + '/dev/preview.html?scene=ready&chrome=0' }, sessionId)
  await poll(() => evaluate(sessionId, `window.__nbDev && document.querySelector('.dsh-nb-workbench')?.dataset.workspaceId && !document.querySelector('.dsh-nb-message')`))
  // A long-running fixture supplies state only. The client's real APNG renders
  // at its native clock; capture never synthesizes or advances animation frames.
  await evaluate(sessionId, `(() => { const id = document.querySelector('.dsh-nb-workbench').dataset.workspaceId; window.__nbDev.store.tasks[id] = { id: 'motion-recording-fixture', workspaceId: id, status: 'running', phase: 'tool:web_search', provider: 'dev-local', model: 'fixture-research', startedAt: Date.now() }; })()`)
  await poll(() => evaluate(sessionId, `(() => { const activity = document.querySelector('.dsh-nb-activity[data-activity="running"]'); if (!activity) return false; const rect = activity.getBoundingClientRect(); const animated = activity.querySelector('.dsh-nb-whale-animated'); return rect.width > 0 && rect.height > 0 && getComputedStyle(animated).display !== 'none' && getComputedStyle(animated).maskImage !== 'none'; })()`))
  await poll(() => evaluate(sessionId, `document.querySelector('.dsh-nb-activity').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')`))
  const geometry = await evaluate(sessionId, `(() => { const rect = value => ({ x: value.x, y: value.y, width: value.width, height: value.height }); return { main: rect(document.querySelector('.dsh-nb-col.is-main').getBoundingClientRect()), activity: rect(document.querySelector('.dsh-nb-activity[data-activity="running"]').getBoundingClientRect()), attributes: {...document.querySelector('.dsh-nb-activity').dataset} }; })()`)
  // Keep the global toolbar (where the indicator lives), sources and Studio in
  // frame so reviewers can judge the motion's scale in the actual workbench.
  const crop = { x: 0, y: 0, width: even(width), height: even(height) }
  report.geometry = geometry
  report.crop = crop
  report.canvasCount = await evaluate(sessionId, `document.querySelectorAll('canvas').length`)
  if (report.canvasCount) throw new Error('轻量动效不应建立 canvas。')
  console.log('录制真实鲸尾提示：6 秒，12 fps 目标采样，保留实际浏览器时间。')
  const captured = []
  const startedAt = performance.now()
  let frameIndex = 0
  while (frameIndex < durationSeconds * captureFps && performance.now() - startedAt < durationSeconds * 1000) {
    const path = join(framesDir, String(frameIndex).padStart(5, '0') + '.jpg')
    const before = performance.now()
    await screenshot(sessionId, path, 'jpeg')
    const sampledAt = (before + performance.now()) / 2 - startedAt
    captured.push({ path, at: sampledAt / 1000 })
    frameIndex += 1
    const nextSlot = Math.max(frameIndex, Math.ceil((performance.now() - startedAt) / (1000 / captureFps)))
    const wait = nextSlot * (1000 / captureFps) - (performance.now() - startedAt)
    if (wait > 0) await delay(wait)
  }
  if (captured.length < 12) throw new Error('浏览器实际采样不足，无法生成可审阅的轻量动效。')
  report.capturedFrames = captured.length
  const firstAt = captured[0].at
  for (const frame of captured) frame.at -= firstAt
  report.timestamps = captured.map(frame => Number(frame.at.toFixed(5)))
  report.actualCaptureFps = Number(((captured.length - 1) / captured.at(-1).at).toFixed(2))
  report.elapsedCaptureSeconds = Number(((performance.now() - startedAt) / 1000).toFixed(4))
  const concat = ['ffconcat version 1.0']
  for (let index = 0; index < captured.length; index += 1) {
    // Capture timestamps preserve actual wall time even if a screenshot misses a slot.
    const span = Math.max(0.001, (captured[index + 1]?.at ?? durationSeconds) - captured[index].at)
    concat.push('file frames/' + String(index).padStart(5, '0') + '.jpg', 'duration ' + span.toFixed(6))
  }
  concat.push('file frames/' + String(captured.length - 1).padStart(5, '0') + '.jpg')
  const concatPath = join(temporaryDir, 'frames.ffconcat')
  await writeFile(concatPath, concat.join('\n') + '\n')
  const cropFilter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`
  const posterFrame = captured.reduce((best, frame) => Math.abs(frame.at - 3) < Math.abs(best.at - 3) ? frame : best)
  const poster = join(outputDir, 'poster.png')
  await ffmpeg(['-i', posterFrame.path, '-vf', cropFilter + ',scale=900:-2:flags=lanczos', '-frames:v', '1', poster])
  const mp4 = join(outputDir, 'motion-preview.mp4')
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatPath, '-t', String(durationSeconds), '-vf', cropFilter + ',fps=12', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
  const gif = join(outputDir, 'motion-preview.gif')
  let gifEncoding
  for (const encoding of [{ fps: 12, colors: 96 }, { fps: 10, colors: 64 }, { fps: 10, colors: 32 }]) {
    const filter = `${cropFilter},fps=${encoding.fps},scale=900:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${encoding.colors}:reserve_transparent=0:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatPath, '-t', String(durationSeconds), '-filter_complex', filter, '-loop', '0', gif])
    gifEncoding = encoding
    if ((await stat(gif)).size <= gifMaxBytes) break
  }
  if ((await stat(gif)).size > gifMaxBytes) throw new Error('900px 动效 GIF 仍超过 8MB，请检查画面或编码设置。')
  report.gifEncoding = gifEncoding
  const runningRaw = join(temporaryDir, 'research-running.png')
  await screenshot(sessionId, runningRaw)
  const running = join(outputDir, 'research-running.png')
  await ffmpeg(['-i', runningRaw, '-vf', cropFilter + ',scale=900:-2:flags=lanczos', '-frames:v', '1', running])
  // Independently compare only the indicator, so page or pointer changes cannot
  // be mistaken for successful native animation playback.
  const indicatorClip = { ...geometry.activity, scale: 1 }
  const indicatorFrames = []
  for (let index = 0; index < 6; index++) {
    const capture = await send('Page.captureScreenshot', { format: 'png', clip: indicatorClip }, sessionId)
    indicatorFrames.push(capture.data)
    await delay(220)
  }
  report.distinctIndicatorFrames = new Set(indicatorFrames).size
  report.indicatorFrameHashes = indicatorFrames.map(frame => createHash('sha256').update(Buffer.from(frame, 'base64')).digest('hex'))
  if (report.distinctIndicatorFrames < 2) throw new Error('运行提示裁剪帧没有变化，不能确认真实动画播放。')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId)
  await poll(() => evaluate(sessionId, `getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).display === 'none' && getComputedStyle(document.querySelector('.dsh-nb-whale-still')).display !== 'none'`))
  const staticBefore = (await send('Page.captureScreenshot', { format: 'png', clip: indicatorClip }, sessionId)).data
  await delay(450)
  const staticAfter = (await send('Page.captureScreenshot', { format: 'png', clip: indicatorClip }, sessionId)).data
  report.reducedMotionStatic = staticBefore === staticAfter
  if (!report.reducedMotionStatic) throw new Error('减少动态效果后裁剪帧仍在变化。')
  const reducedRaw = join(temporaryDir, 'motion-reduced.png')
  await screenshot(sessionId, reducedRaw)
  const reduced = join(outputDir, 'motion-reduced.png')
  await ffmpeg(['-i', reducedRaw, '-vf', cropFilter + ',scale=900:-2:flags=lanczos', '-frames:v', '1', reduced])
  await evaluate(sessionId, `window.__nbDev.store.tasks.ws1.status = 'done'`)
  await poll(() => evaluate(sessionId, `!document.querySelector('.dsh-nb-activity[data-activity="running"]')`))
  const idleRaw = join(temporaryDir, 'motion-idle.png')
  await screenshot(sessionId, idleRaw)
  const idle = join(outputDir, 'motion-idle.png')
  await ffmpeg(['-i', idleRaw, '-vf', cropFilter + ',scale=900:-2:flags=lanczos', '-frames:v', '1', idle])
  report.rafRequests = await evaluate(sessionId, `window.__nbRafRequests`)
  if (report.rafRequests !== 0) throw new Error('动效仍创建了 JavaScript 逐帧调度。')
  for (const path of [mp4, gif, poster, running, reduced, idle]) report.files[path.slice(outputDir.length + 1)] = { path, bytes: (await stat(path)).size }
  if (report.exceptions.length) throw new Error('录制期间出现浏览器异常；请查看 recording.json。')
  console.log(JSON.stringify({ capturedFrames: report.capturedFrames, actualCaptureFps: report.actualCaptureFps, files: report.files }, null, 2))
} catch (error) {
  report.failure = error.stack || String(error)
  console.error(report.failure)
  process.exitCode = 1
} finally {
  await writeFile(join(outputDir, 'recording.json'), JSON.stringify(report, null, 2) + '\n').catch(() => {})
  await stopChrome().catch(() => {})
  socket?.close()
  server.closeAllConnections()
  await new Promise(resolveClose => server.close(resolveClose))
  await rm(temporaryDir, { recursive: true, force: true }).catch(() => {})
}
