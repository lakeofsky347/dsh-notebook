import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createPreviewServer } from './serve.mjs'

// Records the current plugin canvas in the local fixture UI. No image synthesis,
// clock overrides, external fetches, or model requests are used.
// Run: node dev/record-particles.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'output/particles')
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
const temporaryDir = await mkdtemp(join(tmpdir(), 'nb-particles-'))
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
  fixtureOnly: true, actualCanvas: true, viewport: { width, height },
  durationSeconds, captureFps, capturedFrames: 0, timestamps: [],
  pointerEvents: [], exceptions: [], files: {},
}

async function poll(read, timeoutMs = 20000) {
  const deadline = performance.now() + timeoutMs
  let lastError
  while (performance.now() < deadline) {
    try { const result = await read(); if (result) return result } catch (error) { lastError = error }
    await delay(50)
  }
  throw lastError || new Error('等待当前客户端粒子画布超时，请先完成 src/client.js 的粒子实现。')
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId)
  await send('Page.navigate', { url: base + '/dev/preview.html?scene=ready&chrome=0' }, sessionId)
  await poll(() => evaluate(sessionId, `window.__nbDev && document.querySelector('.dsh-nb-workspaces')?.value && !document.querySelector('.dsh-nb-message')`))
  await poll(() => evaluate(sessionId, `(() => { const canvas = document.querySelector('canvas.dsh-nb-particles'); if (!canvas) return false; const rect = canvas.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(canvas).visibility !== 'hidden' && canvas.dataset.motion === 'running'; })()`))
  await delay(450)
  const geometry = await evaluate(sessionId, `(() => { const main = document.querySelector('.dsh-nb-col.is-main').getBoundingClientRect(); const canvas = document.querySelector('canvas.dsh-nb-particles').getBoundingClientRect(); const rect = value => ({ x: value.x, y: value.y, width: value.width, height: value.height }); return { main: rect(main), canvas: rect(canvas), attributes: {...document.querySelector('canvas.dsh-nb-particles').dataset} }; })()`)
  const x = even(Math.max(0, geometry.main.x - 116))
  const crop = { x, y: 0, width: even(Math.min(width - x, geometry.main.width + 232)), height: even(height) }
  report.canvas = geometry
  report.crop = crop
  console.log('录制真实粒子画布：6 秒，12 fps 目标采样，含指针局部扰动。')
  const captured = []
  const startedAt = performance.now()
  let frameIndex = 0
  while (frameIndex < durationSeconds * captureFps && performance.now() - startedAt < durationSeconds * 1000) {
    const elapsed = performance.now() - startedAt
    const phase = elapsed / (durationSeconds * 1000)
    if (phase >= 0.1 && phase <= 0.92) {
      const angle = (phase - 0.1) / 0.82 * Math.PI * 2
      const pointer = {
        x: geometry.canvas.x + geometry.canvas.width * (0.5 + Math.cos(angle) * 0.29),
        y: geometry.canvas.y + geometry.canvas.height * (0.5 + Math.sin(angle * 1.35) * 0.23),
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'none', buttons: 0, ...pointer }, sessionId)
      report.pointerEvents.push({ at: Number((elapsed / 1000).toFixed(4)), ...pointer })
    }
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
  if (captured.length < 12) throw new Error('浏览器实际采样不足，无法生成可审阅的粒子动画。')
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
  const mp4 = join(outputDir, 'particle-preview.mp4')
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatPath, '-t', String(durationSeconds), '-vf', cropFilter + ',fps=12', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
  const gif = join(outputDir, 'particle-preview.gif')
  let gifEncoding
  for (const encoding of [{ fps: 12, colors: 96 }, { fps: 10, colors: 64 }, { fps: 10, colors: 32 }]) {
    const filter = `${cropFilter},fps=${encoding.fps},scale=900:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${encoding.colors}:reserve_transparent=0:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatPath, '-t', String(durationSeconds), '-filter_complex', filter, '-loop', '0', gif])
    gifEncoding = encoding
    if ((await stat(gif)).size <= gifMaxBytes) break
  }
  if ((await stat(gif)).size > gifMaxBytes) throw new Error('900px 粒子 GIF 仍超过 8MB，请检查画面或编码设置。')
  report.gifEncoding = gifEncoding
  // A fixed running task is fixture data, not a real model run. It gives a second
  // still of the same live canvas without adding fabricated animation frames.
  await evaluate(sessionId, `(() => { const id = document.querySelector('.dsh-nb-workspaces').value; window.__nbDev.store.messages[id] = []; window.__nbDev.store.tasks[id] = { id: 'particle-recording-fixture', workspaceId: id, status: 'running', phase: 'tool:web_search', provider: 'dev-local', model: 'fixture-research', startedAt: Date.now() }; })()`)
  await poll(() => evaluate(sessionId, `document.querySelector('[data-action="stop"]') && document.querySelector('canvas.dsh-nb-particles')?.dataset.motion === 'running'`))
  await delay(350)
  const runningRaw = join(temporaryDir, 'research-running.png')
  await screenshot(sessionId, runningRaw)
  const running = join(outputDir, 'research-running.png')
  await ffmpeg(['-i', runningRaw, '-vf', cropFilter + ',scale=900:-2:flags=lanczos', '-frames:v', '1', running])
  for (const path of [mp4, gif, poster, running]) report.files[path.slice(outputDir.length + 1)] = { path, bytes: (await stat(path)).size }
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
