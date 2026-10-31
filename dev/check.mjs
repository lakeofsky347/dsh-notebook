import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createPreviewServer } from './serve.mjs'

// Browser smoke uses only the fixture API in boot.js. It never calls a real model.
const binary = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
if (!binary) throw new Error('未找到 Chrome。可用 CHROME_BIN 指定 Chrome 或 Chromium 可执行文件。')
const userData = await mkdtemp(join(tmpdir(), 'nb-smoke-'))
const outputDir = resolve('output/dev-smoke')
await mkdir(outputDir, { recursive: true })
const server = createPreviewServer()
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = 'http://127.0.0.1:' + server.address().port
const chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + userData, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let stderr = ''
chrome.stderr.on('data', chunk => { stderr += chunk })
let ws
const pending = new Map()
let seq = 0
const report = { fixtureOnly: true, checks: [], exceptions: [], screenshots: [] }
const sessions = new Set()
function check(name, value = true) { assert.ok(value, name); report.checks.push(name) }
async function poll(fn, timeout = 6000) { const start = Date.now(); let last; while (Date.now() - start < timeout) { try { const result = await fn(); if (result) return result } catch (error) { last = error } await delay(35) }; throw last || new Error('等待条件超时') }
function send(method, params = {}, sessionId) {
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
}
async function evaluate(session, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session)
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function waitFor(session, expression, timeout) { return poll(() => evaluate(session, expression), timeout) }
async function open(scene, width = 1440, height = 960) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  sessions.add(sessionId)
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId)
  await send('Page.navigate', { url: base + '/dev/preview.html?scene=' + scene + '&chrome=0' }, sessionId)
  await waitFor(sessionId, `window.__nbDev && document.querySelector('.dsh-nb-workspaces')?.value && !document.querySelector('.dsh-nb-workspaces').textContent.includes('正在读取')`)
  return sessionId
}
async function input(session, selector, value) { await evaluate(session, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('missing input'); node.focus(); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); })()`); await delay(20) }
async function click(session, selector) { await evaluate(session, `document.querySelector(${JSON.stringify(selector)}).click()`); await delay(30) }
async function select(session, selector, value) { await evaluate(session, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('change', { bubbles: true })); })()`); await delay(50) }
async function shot(session, name) { const result = await send('Page.captureScreenshot', { format: 'png' }, session); const path = join(outputDir, name + '.png'); await writeFile(path, Buffer.from(result.data, 'base64')); report.screenshots.push(path) }
try {
  const endpoint = await poll(() => stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1])
  ws = new WebSocket(endpoint)
  await once(ws, 'open')
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''))
  })
  const ready = await open('ready')
  check('工作台加载来源与模型目录', await evaluate(ready, `document.querySelectorAll('.dsh-nb-source').length === 4 && document.querySelector('[aria-label="对话模型"]').value === 'fixture-research'`))
  await select(ready, '[aria-label="对话模型"]', 'fixture-compact')
  check('模型选择持久化到工作台', await evaluate(ready, `window.__nbDev.store.workspaces[0].model === 'fixture-compact'`))
  await click(ready, '.dsh-nb-source-open')
  await waitFor(ready, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('来源引用')`)
  check('来源原文可查看')
  await input(ready, '[aria-label="来源名称"]', '核验后的来源名称')
  await evaluate(ready, `document.querySelector('.dsh-nb-source-tools').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`)
  await waitFor(ready, `document.querySelector('.dsh-nb-source .dsh-nb-title')?.textContent === '核验后的来源名称'`)
  check('来源改名刷新列表')
  await click(ready, '.dsh-nb-head .dsh-nb-chip')
  await input(ready, '[aria-label="来源内容"]', '用于验证添加和删除的开发资料。')
  await click(ready, '[data-action="add-source"]')
  await waitFor(ready, `document.querySelectorAll('.dsh-nb-source').length === 5`)
  check('来源添加刷新列表')
  await evaluate(ready, `document.querySelectorAll('.dsh-nb-source-open')[4].click()`)
  await waitFor(ready, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('验证添加')`)
  await click(ready, '.dsh-nb-chip.danger'); await click(ready, '.dsh-nb-chip.danger')
  await waitFor(ready, `document.querySelectorAll('.dsh-nb-source').length === 4`)
  check('来源删除刷新列表')
  await input(ready, '[aria-label="发送给模型的消息"]', '搜集插件架构资料')
  await evaluate(ready, `document.querySelector('.dsh-nb-composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))`)
  check('输入法组合状态 Enter 不发送', await evaluate(ready, `window.__nbDev.store.messages.ws1.length === 0`))
  await click(ready, '.dsh-nb-send')
  await waitFor(ready, `document.querySelector('.dsh-nb-message.assistant')`)
  check('纯工具调用的空助手行隐藏', await evaluate(ready, `document.querySelectorAll('.dsh-nb-message.assistant').length === 1 && window.__nbDev.store.messages.ws1.filter(item => item.role === 'assistant').length === 2`))
  check('真实消息与工具进度来自服务状态', await evaluate(ready, `document.querySelectorAll('.dsh-nb-message.tool').length === 2 && !document.querySelector('.dsh-nb-thread').textContent.includes('已发送到当前对话')`))
  check('模型搜集后来源自动刷新', await evaluate(ready, `document.querySelectorAll('.dsh-nb-source').length === 5`))
  await click(ready, '[data-mode="sources"]')
  check('工作模式持久化', await evaluate(ready, `window.__nbDev.store.workspaces[0].mode === 'sources'`))
  await click(ready, '.is-studio .dsh-nb-tabs button')
  await click(ready, '.dsh-nb-card')
  await waitFor(ready, `document.querySelector('canvas.dsh-nb-particles')?.dataset.particleMode === 'writing'`)
  check('Studio 整理期间显示生成粒子状态')
  await waitFor(ready, `document.querySelector('.dsh-nb-preview')?.textContent.includes('后台任务完成后自动刷新')`)
  check('Studio 后台完成后自动刷新正文')
  await shot(ready, 'workbench-desktop')
  await click(ready, '.dsh-nb-source-open')
  await waitFor(ready, `document.querySelector('.dsh-nb-source-body')`)
  await evaluate(ready, `window.__nbDev.store.workspaces[0].notebookId = 'nb2'`)
  await waitFor(ready, `document.querySelector('[aria-label="当前笔记本"]').value === 'nb2' && !document.querySelector('.dsh-nb-source-body') && !document.querySelector('.dsh-nb-preview')`)
  check('同会话外部切换笔记本清详情并保留消息', await evaluate(ready, `document.querySelectorAll('.dsh-nb-message').length >= 4`))
  await select(ready, '[aria-label="工作台会话"]', 'ws2')
  await waitFor(ready, `document.querySelector('.is-main .dsh-nb-head')?.textContent.includes('插件架构笔记')`)
  check('工作台切换隔离消息与来源', await evaluate(ready, `!document.querySelector('.dsh-nb-message') && !document.querySelector('.dsh-nb-source')`))
  // Hold an old workspace response to ensure it cannot replace the newly selected workspace.
  await evaluate(ready, `(() => { const original = window.fetch; window.fetch = async (url, options) => { const body = JSON.parse(options.body); const result = await original(url, options); if (body.op === 'state' && body.workspaceId === 'ws2') { window.__oldStateDelayed = true; await new Promise(resolve => setTimeout(resolve, 300)); } return result }; })()`)
  await click(ready, '[data-mode="research"]')
  await waitFor(ready, `window.__oldStateDelayed === true`)
  await select(ready, '[aria-label="工作台会话"]', 'ws1')
  await delay(400)
  check('延迟响应不会覆盖当前工作台', await evaluate(ready, `document.querySelector('[aria-label="工作台会话"]').value === 'ws1' && document.querySelectorAll('.dsh-nb-message').length >= 4`))
  const noSession = await open('nosession')
  check('无宿主会话也可使用工作台', await evaluate(noSession, `document.querySelector('[data-action="bind-session"]').disabled && !document.querySelector('[data-action="new-workspace"]').disabled`))
  await click(noSession, '[data-action="new-workspace"]')
  await waitFor(noSession, `document.querySelector('[aria-label="工作台会话"]').value !== 'ws1' && document.querySelector('[aria-label="对话模型"]').value`)
  await input(noSession, '[aria-label="发送给模型的消息"]', '为我建立一个研究笔记本')
  await click(noSession, '.dsh-nb-send')
  await waitFor(noSession, `document.querySelector('.dsh-nb-message.assistant')`)
  check('独立会话可由模型建笔记本并添加来源', await evaluate(noSession, `document.querySelectorAll('.dsh-nb-source').length === 1 && document.querySelector('[aria-label="当前笔记本"]').value`))
  const slow = await open('slow')
  await input(slow, '[aria-label="发送给模型的消息"]', '测试可停止的研究任务')
  await click(slow, '.dsh-nb-send')
  await waitFor(slow, `document.querySelector('[data-action="stop"]')`)
  await waitFor(slow, `document.querySelector('.dsh-nb-task')?.textContent.includes('正在搜索网页')`)
  check('工具阶段显示中文进度')
  check('搜集资料时粒子场切换为紧凑搜集状态', await evaluate(slow, `document.querySelector('.dsh-nb-sea').classList.contains('is-compact') && document.querySelector('canvas.dsh-nb-particles').dataset.particleMode === 'collecting'`))
  await evaluate(slow, `window.__nbDev.store.tasks.ws1.phase = 'thinking'`)
  await waitFor(slow, `document.querySelector('canvas.dsh-nb-particles').dataset.particleMode === 'thinking'`)
  check('模型思考驱动粒子状态')
  await evaluate(slow, `window.__nbDev.store.tasks.ws1.phase = 'answering'`)
  await waitFor(slow, `document.querySelector('canvas.dsh-nb-particles').dataset.particleMode === 'writing'`)
  check('模型回答驱动粒子状态')
  await click(slow, '[data-action="stop"]')
  await waitFor(slow, `document.querySelector('.dsh-nb-task')?.textContent.includes('停止')`)
  check('停止运行保留消息且释放发送状态', await evaluate(slow, `!document.querySelector('[data-action="stop"]') && document.querySelector('.dsh-nb-message.user')`))
  check('停止运行后粒子恢复巡游状态', await evaluate(slow, `document.querySelector('canvas.dsh-nb-particles').dataset.particleMode === 'idle'`))
  const emptyModels = await open('empty-models')
  check('空模型目录明确提示并禁用发送', await evaluate(emptyModels, `document.querySelector('.dsh-nb-notice')?.textContent.includes('没有可用模型') && document.querySelector('.dsh-nb-send').disabled`))
  const noSearch = await open('no-search')
  check('未启用网页搜索时提示可提供网址或路径', await evaluate(noSearch, `[...document.querySelectorAll('.dsh-nb-notice')].some(node => node.textContent.includes('当前未启用网页搜索，可提供网址或本地路径'))`))
  const failed = await open('chat-error')
  await input(failed, '[aria-label="发送给模型的消息"]', '模拟失败')
  await click(failed, '.dsh-nb-send')
  await waitFor(failed, `document.querySelector('.dsh-nb-error')?.textContent.includes('模拟模型请求失败')`)
  check('模型失败显示服务端错误')
  const fresh = await open('fresh')
  check('首次使用自动创建独立工作台', await evaluate(fresh, `window.__nbDev.store.workspaces.length === 1 && document.querySelector('.dsh-nb-workspaces').value`))
  const narrow = await open('ready', 420, 900)
  check('窄屏不横向溢出', await evaluate(narrow, `document.documentElement.scrollWidth <= innerWidth + 1`))
  await shot(narrow, 'workbench-mobile')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, narrow)
  check('减少动态效果生效', await evaluate(narrow, `getComputedStyle(document.querySelector('.dsh-nb-cloud')).animationName === 'none'`))

  const particles = await open('ready')
  await waitFor(particles, `document.querySelector('canvas.dsh-nb-particles')?.dataset.motion === 'running'`)
  const stage = await evaluate(particles, `(() => {
    const canvas = document.querySelector('canvas.dsh-nb-particles')
    window.__particleSnapshot = () => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      let hash = 2166136261, lit = 0
      for (let i = 0; i < data.length; i += 16) { hash = Math.imul(hash ^ data[i] ^ data[i + 1] ^ data[i + 2] ^ data[i + 3], 16777619); if (data[i] + data[i + 1] + data[i + 2] > 80 && data[i + 3]) lit++ }
      return { hash: hash >>> 0, lit }
    }
    const rect = canvas.getBoundingClientRect()
    return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, hidden: canvas.getAttribute('aria-hidden'), pointerEvents: getComputedStyle(canvas).pointerEvents }
  })()`)
  await delay(180)
  const beforeMotion = await evaluate(particles, `window.__particleSnapshot()`)
  await delay(320)
  const afterMotion = await evaluate(particles, `window.__particleSnapshot()`)
  check('空态画布绘制可见粒子并持续运动', stage.width > 0 && stage.height > 0 && beforeMotion.lit > 30 && beforeMotion.hash !== afterMotion.hash)
  check('粒子装饰不拦截表单或辅助技术', stage.hidden === 'true' && stage.pointerEvents === 'none')
  check('画布按设备像素比设限', stage.width / stage.cssWidth <= 2.01 && stage.height / stage.cssHeight <= 2.01)
  await input(particles, '[aria-label="发送给模型的消息"]', '粒子不会抢走输入焦点')
  const pointer = await evaluate(particles, `(() => { const rect = document.querySelector('canvas.dsh-nb-particles').getBoundingClientRect(); return { x: rect.x + rect.width * .6, y: rect.y + rect.height * .55 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pointer }, particles)
  check('指针扰动不改变输入焦点或草稿', await evaluate(particles, `document.activeElement === document.querySelector('[aria-label="发送给模型的消息"]') && document.activeElement.value === '粒子不会抢走输入焦点'`))
  await shot(particles, 'particles-idle')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, particles)
  await waitFor(particles, `document.querySelector('canvas.dsh-nb-particles').dataset.motion === 'reduced'`)
  await delay(180)
  const reducedFrame = await evaluate(particles, `window.__particleSnapshot()`)
  await delay(320)
  check('减少动态效果时保留静态粒子且停止逐帧运动', reducedFrame.lit > 30 && reducedFrame.hash === (await evaluate(particles, `window.__particleSnapshot()`)).hash)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, particles)
  await waitFor(particles, `document.querySelector('canvas.dsh-nb-particles').dataset.motion === 'running'`)
  check('动态效果设置恢复后继续播放')
  await evaluate(particles, `document.querySelector('.dsh-nb-sea').style.display = 'none'`)
  await waitFor(particles, `document.querySelector('canvas.dsh-nb-particles').dataset.motion === 'paused'`)
  check('不可见粒子场暂停绘制')
  await evaluate(particles, `document.querySelector('.dsh-nb-sea').style.removeProperty('display')`)
  await waitFor(particles, `document.querySelector('canvas.dsh-nb-particles').dataset.motion === 'running'`)
  await evaluate(particles, `(() => { const ctx = document.querySelector('canvas.dsh-nb-particles').getContext('2d'), clear = ctx.clearRect.bind(ctx); window.__particlePaints = 0; ctx.clearRect = (...args) => { window.__particlePaints++; return clear(...args) } })()`)
  await delay(700)
  const paints = await evaluate(particles, `window.__particlePaints`)
  check('持续绘制保持约 30fps 帧率上限', paints > 0 && paints <= 25)
  await evaluate(particles, `(() => { const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window); window.__particleRafs = new Set(); window.requestAnimationFrame = fn => { const id = request(time => { window.__particleRafs.delete(id); fn(time) }); window.__particleRafs.add(id); return id }; window.cancelAnimationFrame = id => { window.__particleRafs.delete(id); cancel(id) } })()`)
  await delay(180)
  await evaluate(particles, `window.ReactDOM.render(null, document.getElementById('app'))`)
  await delay(180)
  check('离开工作台清理粒子动画调度', await evaluate(particles, `!document.querySelector('canvas.dsh-nb-particles') && window.__particleRafs.size === 0`))

  check('无未处理浏览器异常', report.exceptions.length === 0)
  report.passed = report.checks.length
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.failure = error.stack || String(error)
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.error(JSON.stringify(report, null, 2))
  process.exitCode = 1
} finally {
  if (ws) { try { await send('Browser.close') } catch {} ws.close() }
  chrome.kill('SIGKILL')
  server.close()
  await delay(100)
  await rm(userData, { recursive: true, force: true }).catch(() => {})
}
