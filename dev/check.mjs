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
const outputDir = resolve(process.env.DSH_NOTEBOOK_UI_OUTPUT || 'output/dev-smoke')
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
function check(name, value = true) { assert.ok(value, name); report.checks.push(name); console.log('[pass] ' + name) }
async function poll(fn, timeout = 6000) { const start = Date.now(); let last; while (Date.now() - start < timeout) { try { const result = await fn(); if (result) return result } catch (error) { last = error } await delay(35) }; throw last || new Error('等待条件超时') }
function send(method, params = {}, sessionId, timeoutMs = 15000) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + ' session=' + (sessionId || 'browser') + ' after=' + (report.checks.at(-1) || 'startup'))) }, timeoutMs)
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value) }, reject(error) { clearTimeout(timer); reject(error) } })
    try { ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) }
    catch (error) { pending.get(id)?.reject(error); pending.delete(id) }
  })
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
  // Observe scheduling from the first client render without changing the clock.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const request = window.requestAnimationFrame.bind(window); window.__nbRafRequests = 0; window.requestAnimationFrame = callback => { window.__nbRafRequests++; return request(callback) }; })()` }, sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId)
  await send('Page.navigate', { url: base + '/dev/preview.html?scene=' + scene + '&chrome=0' }, sessionId)
  await waitFor(sessionId, scene === 'unauthenticated' ? `window.__nbDev && document.querySelector('.dsh-nb-status')?.textContent.includes('需要先登录桌面端')` : `window.__nbDev && document.querySelector('.dsh-nb-workbench')?.dataset.workspaceId`)
  return sessionId
}
async function input(session, selector, value) { await evaluate(session, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('missing input'); node.focus(); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); })()`); await delay(20) }
async function click(session, selector) { await evaluate(session, `document.querySelector(${JSON.stringify(selector)}).click()`); await delay(30) }
async function select(session, selector, value) { await evaluate(session, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('change', { bubbles: true })); })()`); await delay(50) }
async function selectModel(session, label, provider, model) {
  const trigger = '[aria-label="' + label + '"]'
  await click(session, trigger)
  const selector = '.dsh-nb-model-list:popover-open [role="option"][data-provider="' + provider + '"][data-model="' + model + '"]'
  await waitFor(session, 'document.querySelector(' + JSON.stringify(selector) + ')')
  await click(session, selector)
  await waitFor(session, `(() => { const trigger = document.querySelector(${JSON.stringify(trigger)}); return !trigger.disabled && trigger.getAttribute('aria-expanded') === 'false' && trigger.dataset.provider === ${JSON.stringify(provider)} && trigger.dataset.model === ${JSON.stringify(model)} })()`)
}
async function shot(session, name) { const result = await send('Page.captureScreenshot', { format: 'png' }, session); const path = join(outputDir, name + '.png'); await writeFile(path, Buffer.from(result.data, 'base64')); report.screenshots.push(path) }
// Use each whale's own pixels so unrelated focus, typing and other motion
// cannot affect the frame comparisons.
async function visualFrame(session, selector) {
  const clip = await evaluate(session, `(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }; })()`)
  return (await send('Page.captureScreenshot', { format: 'png', clip }, session)).data
}
const activityFrame = session => visualFrame(session, '.dsh-nb-activity[data-activity="running"]')
async function fixtureRefresh(session, expression) {
  const before = await evaluate(session, `window.__nbDev.requests.filter(item => item.op === 'state').length`)
  await evaluate(session, expression)
  // Observe two normal state reads so assertions run after the changed fixture
  // has traversed the same polling/rendering path as a service response.
  await waitFor(session, `window.__nbDev.requests.filter(item => item.op === 'state').length >= ${before + 2}`)
}
async function beginActivity(session) {
  await evaluate(session, `(() => { const id = document.querySelector('.dsh-nb-workbench').dataset.workspaceId; window.__nbDev.store.tasks[id] = { id: 'motion-fixture', status: 'running', phase: 'tool:web_search', provider: 'dev-local', model: 'fixture-research' }; })()`)
  await waitFor(session, `document.querySelector('.dsh-nb-activity[data-activity="running"]') && document.querySelector('[data-action="stop"]')`)
  await waitFor(session, `document.querySelector('.dsh-nb-activity').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')`)
}
async function enterPractice(session) {
  await waitFor(session, `document.querySelector('[data-action="study-start"], [data-study-item], [data-study-result]')`)
  if (await evaluate(session, `!!document.querySelector('[data-action="study-start"]')`)) await click(session, '[data-action="study-start"]')
  await waitFor(session, `document.querySelector('[data-study-item], [data-study-result]')`)
}
async function openPractice(session, artifactId) { await click(session, '[data-artifact-id="' + artifactId + '"]'); await enterPractice(session) }
async function retryMistakes(session) {
  const previous = await evaluate(session, `document.querySelector('[data-study-session]').dataset.studySession`)
  await click(session, '[data-action="study-mistakes"]')
  await waitFor(session, `document.querySelector('[data-study-session]')?.dataset.studySession && document.querySelector('[data-study-session]').dataset.studySession !== ${JSON.stringify(previous)}`)
  await enterPractice(session)
}
async function doubleClick(session, selector) { await evaluate(session, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.click(); node.click(); })()`); await delay(40) }
try {
  const endpoint = await poll(() => stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1])
  ws = new WebSocket(endpoint)
  await once(ws, 'open')
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''))
  })
  ws.addEventListener('close', () => { for (const request of pending.values()) request.reject(new Error('Browser connection closed')); pending.clear() })
  const ready = await open('ready')
  check('工作台通过宿主 RPC 通道加载资料与模型', await evaluate(ready, `window.__nbDev.requests.some(item => item.op === 'state') && window.__nbDev.requests.some(item => item.op === 'catalog') && window.__nbDev.requests.every(item => item.rpc && item.url === 'api/dsh-notebook/api' && item.method === 'dsh-notebook/api')`))
  check('工作台加载来源与模型目录', await evaluate(ready, `document.querySelectorAll('.dsh-nb-source').length === 4 && document.querySelector('[aria-label="对话模型"]').dataset.model === 'fixture-research'`))
  const chatModel = '[aria-label="对话模型"]'
  const openModelList = '.dsh-nb-model-list:popover-open'
  await click(ready, chatModel)
  await waitFor(ready, `document.querySelector('${openModelList} [aria-selected=true]') === document.activeElement`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }, ready)
  check('模型菜单按提供方分组并允许键盘跨组定位', await evaluate(ready, `document.querySelector('${openModelList}').querySelectorAll('[role=group]').length === 2 && document.activeElement.dataset.model === 'fixture-other'`))
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, ready)
  await waitFor(ready, `!document.querySelector('${openModelList}') && document.activeElement.matches('${chatModel}')`)
  check('Escape 返回模型触发器并保留原选择', await evaluate(ready, `document.activeElement.dataset.model === 'fixture-research'`))
  await click(ready, chatModel)
  const outsideModelMenu = await evaluate(ready, `(() => { const box = document.querySelector('[aria-label="查找来源"]').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...outsideModelMenu }, ready)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...outsideModelMenu }, ready)
  await waitFor(ready, `!document.querySelector('${openModelList}')`)
  check('点击菜单外保持焦点在新目标', await evaluate(ready, `document.activeElement.matches('[aria-label="查找来源"]')`))
  await click(ready, chatModel)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, ready)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, ready)
  await waitFor(ready, `document.activeElement.matches('${chatModel}') && document.activeElement.dataset.model === 'fixture-compact'`)
  check('模型选择持久化到工作台', await evaluate(ready, `window.__nbDev.store.workspaces[0].model === 'fixture-compact'`))
  await click(ready, '.dsh-nb-source-open')
  await waitFor(ready, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('来源引用')`)
  check('来源原文可查看')
  await input(ready, '[aria-label="来源名称"]', '核验后的来源名称')
  await evaluate(ready, `document.querySelector('.dsh-nb-source-tools').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`)
  await waitFor(ready, `document.querySelector('.dsh-nb-source .dsh-nb-title')?.textContent === '核验后的来源名称'`)
  check('来源改名刷新列表')
  await click(ready, '[aria-label="关闭详情"]')
  await click(ready, '[data-action="open-add-source"]')
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
  check('显示真实问答并将工具记录留在服务状态', await evaluate(ready, `window.__nbDev.store.messages.ws1.filter(item => item.role === 'tool').length === 2 && !document.querySelector('.dsh-nb-message.tool, .dsh-nb-message.system') && document.querySelector('.dsh-nb-message.user').textContent.includes('搜集插件架构资料') && document.querySelector('.dsh-nb-message.assistant').textContent.includes('已围绕你的目标整理资料') && !document.querySelector('.dsh-nb-thread').textContent.includes('已发送到当前对话')`))
  check('模型搜集后来源自动刷新', await evaluate(ready, `document.querySelectorAll('.dsh-nb-source').length === 5`))
  await click(ready, '[data-mode="sources"]')
  check('工作模式持久化', await evaluate(ready, `window.__nbDev.store.workspaces[0].mode === 'sources'`))
  await click(ready, '.dsh-nb-card')
  await waitFor(ready, `document.querySelector('.dsh-nb-activity[data-activity="running"]')`)
  check('Studio 整理期间只有一个可访问的轻量运行提示', await evaluate(ready, `document.querySelectorAll('.dsh-nb-activity[data-activity="running"]').length === 1 && document.querySelector('.dsh-nb-activity').getAttribute('role') === 'status' && document.querySelector('.dsh-nb-activity').getAttribute('aria-label') === '正在处理' && !document.querySelector('canvas, .dsh-nb-task')`))
  await waitFor(ready, `document.querySelector('.dsh-nb-preview')?.textContent.includes('后台任务完成后自动刷新')`)
  check('Studio 后台完成后自动刷新正文')
  await shot(ready, 'studio-detail')
  await click(ready, '[aria-label="关闭详情"]')
  await shot(ready, 'workbench-desktop')
  await click(ready, '.dsh-nb-source-open')
  await waitFor(ready, `document.querySelector('.dsh-nb-source-body')`)
  await evaluate(ready, `window.__nbDev.store.workspaces[0].notebookId = 'nb2'`)
  await waitFor(ready, `document.querySelector('.dsh-nb-workbench').dataset.notebookId === 'nb2' && !document.querySelector('.dsh-nb-source-body') && !document.querySelector('.dsh-nb-preview')`)
  check('同会话外部切换笔记本清详情并保留消息', await evaluate(ready, `document.querySelectorAll('.dsh-nb-message.user').length === 1 && document.querySelectorAll('.dsh-nb-message.assistant').length === 1 && window.__nbDev.store.messages.ws1.filter(item => item.role === 'tool').length === 2`))
  await click(ready, '[data-action="history"]')
  await select(ready, '[aria-label="工作台会话"]', 'ws2')
  await waitFor(ready, `document.querySelector('.is-main .dsh-nb-head')?.textContent.includes('插件架构笔记')`)
  check('工作台切换隔离消息与来源', await evaluate(ready, `!document.querySelector('.dsh-nb-message') && !document.querySelector('.dsh-nb-source')`))
  // Hold an old workspace response to ensure it cannot replace the newly selected workspace.
  await evaluate(ready, `(() => { const original = window.fetch; window.fetch = async (url, options) => { const envelope = JSON.parse(options.body), body = envelope.payload || envelope; const result = await original(url, options); if (body.op === 'state' && body.workspaceId === 'ws2') { window.__oldStateDelayed = true; await new Promise(resolve => setTimeout(resolve, 300)); } return result }; })()`)
  await click(ready, '[data-mode="research"]')
  await waitFor(ready, `window.__oldStateDelayed === true`)
  await click(ready, '[data-action="history"]')
  await select(ready, '[aria-label="工作台会话"]', 'ws1')
  await delay(400)
  check('延迟响应不会覆盖当前工作台', await evaluate(ready, `document.querySelector('.dsh-nb-workbench').dataset.workspaceId === 'ws1' && document.querySelector('.dsh-nb-message.user').textContent.includes('搜集插件架构资料') && document.querySelector('.dsh-nb-message.assistant').textContent.includes('已围绕你的目标整理资料')`))
  const noSession = await open('nosession')
  await click(noSession, '[data-action="more"]')
  check('无宿主会话也可使用工作台', await evaluate(noSession, `document.querySelector('[data-action="bind-session"]').disabled && !document.querySelector('[data-action="new-workspace"]').disabled`))
  await click(noSession, '[aria-label="关闭详情"]')
  await click(noSession, '[data-action="new-workspace"]')
  await waitFor(noSession, `document.querySelector('.dsh-nb-workbench').dataset.workspaceId !== 'ws1' && !document.querySelector('[aria-label="对话模型"]').disabled`)
  await input(noSession, '[aria-label="发送给模型的消息"]', '为我建立一个研究笔记本')
  await click(noSession, '.dsh-nb-send')
  await waitFor(noSession, `document.querySelector('.dsh-nb-message.assistant')`)
  check('独立会话可由模型建笔记本并添加来源', await evaluate(noSession, `document.querySelectorAll('.dsh-nb-source').length === 1 && document.querySelector('.dsh-nb-workbench').dataset.notebookId`))
  const slow = await open('slow')
  await input(slow, '[aria-label="发送给模型的消息"]', '测试可停止的研究任务')
  await click(slow, '.dsh-nb-send')
  await waitFor(slow, `document.querySelector('[data-action="stop"]')`)
  await waitFor(slow, `document.querySelector('.dsh-nb-activity[data-activity="running"]')`)
  check('工具执行期间用单个稳定运行提示代替阶段文字', await evaluate(slow, `document.querySelectorAll('.dsh-nb-activity[data-activity="running"]').length === 1 && document.querySelector('.dsh-nb-activity').getAttribute('aria-label') === '正在处理' && !document.querySelector('.dsh-nb-task, .dsh-nb-message.tool') && !/正在搜索网页|正在思考|tool:web_search/.test(document.querySelector('.dsh-nb-thread').textContent)`))
  const activityBounds = await evaluate(slow, `(() => { const rect = document.querySelector('.dsh-nb-activity').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })()`)
  check('运行提示只占用小型固定槽位', activityBounds.width > 0 && activityBounds.width <= 32 && activityBounds.height > 0 && activityBounds.height <= 32)
  await fixtureRefresh(slow, `window.__nbDev.store.tasks.ws1.phase = 'thinking'; window.__nbDev.store.messages.ws1.push({ id: 'raw-tool-fixture', role: 'tool', text: '{"query":"DO_NOT_RENDER_TOOL_JSON","phase":"thinking"}', status: 'done' })`)
  check('模型内部阶段变化不暴露过程与原始工具 JSON', await evaluate(slow, `document.querySelectorAll('.dsh-nb-activity[data-activity="running"]').length === 1 && !document.querySelector('.dsh-nb-task, .dsh-nb-message.tool') && !/DO_NOT_RENDER_TOOL_JSON|正在思考|thinking/.test(document.querySelector('.dsh-nb-thread').textContent)`))
  await fixtureRefresh(slow, `window.__nbDev.store.tasks.ws1.phase = 'answering'`)
  check('回答阶段沿用同一个稳定提示且保持停止操作', await evaluate(slow, `document.querySelectorAll('.dsh-nb-activity[data-activity="running"]').length === 1 && document.querySelector('.dsh-nb-activity').getAttribute('aria-label') === '正在处理' && document.querySelector('[data-action="stop"]') && !/正在回答|answering/.test(document.querySelector('.dsh-nb-thread').textContent)`))
  await click(slow, '[data-action="stop"]')
  await waitFor(slow, `!document.querySelector('[data-action="stop"]') && !document.querySelector('.dsh-nb-activity[data-activity="running"]')`)
  check('停止运行保留消息且释放发送状态', await evaluate(slow, `!document.querySelector('[data-action="stop"]') && document.querySelector('.dsh-nb-message.user')`))
  check('停止后撤去运行提示并保留取消结果', await evaluate(slow, `window.__nbDev.store.tasks.ws1.status === 'cancelled' && !document.querySelector('.dsh-nb-activity[data-activity="running"], canvas')`))
  const emptyModels = await open('empty-models')
  check('空模型目录明确提示并禁用发送', await evaluate(emptyModels, `document.querySelector('.dsh-nb-notice')?.textContent.includes('没有可用模型') && document.querySelector('.dsh-nb-send').disabled`))
  const noSearch = await open('no-search')
  check('未启用网页搜索时提示可提供网址或路径', await evaluate(noSearch, `[...document.querySelectorAll('.dsh-nb-notice')].some(node => node.textContent.includes('当前未启用网页搜索，可提供网址或本地路径'))`))
  await click(noSearch, '[data-action="open-research"]')
  await input(noSearch, '[aria-label="自动构建研究目标"]', '搜索一手资料')
  check('自动构建明确说明宿主缺少搜索并禁用启动', await evaluate(noSearch, `document.querySelector('[data-research-capability="unavailable"]').textContent.includes('DSH 当前未接入网页搜索') && document.querySelector('[data-action="start-research"]').disabled`))
  await click(noSearch, '[aria-label="关闭详情"]')

  const autoResearch = await open('ready')
  await input(autoResearch, '[aria-label="发送给模型的消息"]', '自动研究海洋碳汇')
  await click(autoResearch, '[data-action="open-research"]')
  check('自动构建复用草稿且默认新建笔记本和五个来源', await evaluate(autoResearch, `document.querySelector('[aria-label="自动构建研究目标"]').value === '自动研究海洋碳汇' && document.querySelector('[aria-label="创建新的笔记本"]').checked && document.querySelector('[aria-label="目标来源数"]').value === '5'`))
  await select(autoResearch, '[aria-label="目标来源数"]', '3')
  await selectModel(autoResearch, '自动构建模型', 'dev-local', 'fixture-compact')
  await input(autoResearch, '[aria-label="自动构建笔记本标题"]', '海洋碳汇自动研究')
  await click(autoResearch, '[data-action="start-research"]')
  await waitFor(autoResearch, `document.querySelector('[data-research-status="running"]') && !document.querySelector('.dsh-nb-dialog')`)
  check('独立研究状态禁用冲突操作并提供停止', await evaluate(autoResearch, `!window.__nbDev.store.tasks.ws1 && document.querySelector('[data-action="stop"]') && document.querySelector('[aria-label="对话模型"]').disabled && document.querySelector('[data-mode="sources"]').disabled && document.querySelector('[data-action="open-add-source"]').disabled && document.querySelector('.dsh-nb-card').disabled`))
  check('构建期间保留研究目标但不展示阶段计数与运行明细', await evaluate(autoResearch, `(() => { const research = document.querySelector('[data-research-status="running"]'); return research.textContent.includes('自动研究海洋碳汇') && !/已保存|目标 3|正在搜索|正在导入|搜索词|planning|searching|synthesizing/.test(research.textContent) && !research.querySelector('progress, details, .dsh-nb-research-queries, .dsh-nb-research-imported') && document.querySelectorAll('.dsh-nb-activity[data-activity="running"]').length === 1 })()`))
  await waitFor(autoResearch, `document.querySelector('[data-research-status="done"]')`, 8000)
  check('自动构建按目标新建真实状态中的来源和学习指南', await evaluate(autoResearch, `(() => { const store = window.__nbDev.store, workspace = store.workspaces[0], research = store.research.ws1; return workspace.notebookId !== 'nb1' && workspace.model === 'fixture-compact' && store.notebooks.find(item => item.id === workspace.notebookId).title === '海洋碳汇自动研究' && store.sources[workspace.notebookId].length === 3 && store.sources.nb1.length === 4 && research.artifactId && document.querySelector('.dsh-nb-research').textContent.includes('已收录 3 份资料') })()`))
  await click(autoResearch, '.dsh-nb-research summary')
  check('构建结果可打开所有保存来源并在服务历史保留检索词', await evaluate(autoResearch, `window.__nbDev.store.research.ws1.queries.length === 2 && document.querySelectorAll('.dsh-nb-research-imported button:not(:disabled)').length === 3 && !document.querySelector('.dsh-nb-research-queries')`))
  await click(autoResearch, '.dsh-nb-research-imported button')
  await waitFor(autoResearch, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('模拟网页正文')`)
  check('自动研究来源可检查已保存正文')
  check('来源详情显示获取时间原始网址和截取说明', await evaluate(autoResearch, `document.querySelector('[data-source-provenance="fetched-at"]').textContent.includes('正文获取时间') && document.querySelector('[data-source-provenance="requested-url"]').textContent.includes('https://example.org/auto-research/1') && document.querySelector('[data-source-provenance="truncated"]').textContent.includes('正文经过截取')`))
  await click(autoResearch, '[aria-label="关闭详情"]')
  await click(autoResearch, '[data-action="research-guide"]')
  await waitFor(autoResearch, `document.querySelector('.dsh-nb-preview')?.textContent.includes('自动研究学习指南')`)
  check('自动构建结果可直接打开学习指南')
  await click(autoResearch, '.dsh-nb-preview [data-citation-source]')
  await waitFor(autoResearch, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('模拟网页正文')`)
  check('学习指南真实来源引用可直接跳转保存正文')
  await click(autoResearch, '[aria-label="关闭详情"]')
  await click(autoResearch, '[data-action="research-ask"]')
  check('自动构建后可继续资料问答', await evaluate(autoResearch, `window.__nbDev.store.workspaces[0].mode === 'sources'`))
  await evaluate(autoResearch, `(() => { const research = window.__nbDev.store.research.ws1; research.reused.push(research.imported.pop()) })()`)
  await waitFor(autoResearch, `document.querySelector('.dsh-nb-research-imported')?.textContent.includes('复用已有来源')`)
  check('复用来源合并计数且不会遗漏', await evaluate(autoResearch, `document.querySelector('.dsh-nb-research').textContent.includes('已收录 3 份资料') && document.querySelectorAll('.dsh-nb-research-imported li').length === 3`))
  await shot(autoResearch, 'automatic-research-complete')
  await click(autoResearch, '[data-action="notebooks"]')
  await select(autoResearch, '[aria-label="当前笔记本"]', 'nb1')
  await waitFor(autoResearch, `document.querySelector('[data-action="research-notebook"]')`)
  check('切换笔记本后研究结果不误导到当前无关资料', await evaluate(autoResearch, `!document.querySelector('[data-action="research-ask"]') && !document.querySelector('[data-action="research-guide"]')`))
  await click(autoResearch, '[data-action="research-notebook"]')
  await waitFor(autoResearch, `document.querySelector('[data-action="research-guide"]')`)
  check('可从研究记录返回所属笔记本', await evaluate(autoResearch, `document.querySelector('.dsh-nb-workbench').dataset.notebookId === window.__nbDev.store.research.ws1.notebookId`))

  const partialResearch = await open('research-partial')
  await click(partialResearch, '[data-action="hero-research"]')
  await input(partialResearch, '[aria-label="自动构建研究目标"]', '检查部分网页失败')
  await click(partialResearch, '[aria-label="创建新的笔记本"]')
  await click(partialResearch, '[data-action="start-research"]')
  await waitFor(partialResearch, `document.querySelector('[data-research-status="partial"]')`, 8000)
  await click(partialResearch, '.dsh-nb-research summary')
  check('部分失败保留旧资料并展示真实缺口和错误', await evaluate(partialResearch, `window.__nbDev.store.workspaces[0].notebookId === 'nb1' && window.__nbDev.store.sources.nb1.length === 6 && document.querySelector('.dsh-nb-research-heading').dataset.researchCompleted === '2' && document.querySelector('.dsh-nb-research-heading').dataset.researchTarget === '5' && document.querySelector('.dsh-nb-research').textContent.includes('已收录 2 / 5 份资料') && document.querySelectorAll('.dsh-nb-research-failures li').length === 3 && document.querySelector('.dsh-nb-research-failures').textContent.includes('网页无法读取')`))

  const stoppedResearch = await open('research-slow')
  await click(stoppedResearch, '[data-action="open-research"]')
  await input(stoppedResearch, '[aria-label="自动构建研究目标"]', '检查构建停止后保留来源')
  await click(stoppedResearch, '[data-action="start-research"]')
  await waitFor(stoppedResearch, `window.__nbDev.store.research.ws1?.completedSources === 1 && document.querySelector('.dsh-nb-activity[data-activity="running"]')`)
  check('构建中已入库资料不会变成实时计数面板', await evaluate(stoppedResearch, `document.querySelector('[data-research-status="running"]').textContent.includes('检查构建停止后保留来源') && !/已保存|正在导入|importing/.test(document.querySelector('[data-research-status="running"]').textContent) && !document.querySelector('[data-research-status="running"]').textContent.includes('1 / 5') && !document.querySelector('[data-research-status="running"] details')`))
  await click(stoppedResearch, '[data-action="stop"]')
  await waitFor(stoppedResearch, `document.querySelector('[data-research-status="cancelled"]')`)
  check('停止自动构建保留已保存来源并释放运行状态', await evaluate(stoppedResearch, `document.querySelectorAll('.dsh-nb-source').length === 1 && !document.querySelector('[data-action="stop"]') && !document.querySelector('[data-action="open-research"]').disabled && document.querySelector('.dsh-nb-research').textContent.includes('已保存的资料仍可使用')`))

  const failedResearch = await open('research-failed')
  await click(failedResearch, '[data-action="open-research"]')
  await input(failedResearch, '[aria-label="自动构建研究目标"]', '检查搜索提供方不可用')
  await click(failedResearch, '[data-action="start-research"]')
  await waitFor(failedResearch, `document.querySelector('[data-research-status="failed"]')`)
  check('注册搜索工具仍可能调用失败且错误清晰显示', await evaluate(failedResearch, `document.querySelector('.dsh-nb-research-error').textContent.includes('搜索服务调用失败') && !document.querySelector('[data-action="stop"]') && !document.querySelector('[data-action="open-research"]').disabled`))
  const failed = await open('chat-error')
  await input(failed, '[aria-label="发送给模型的消息"]', '模拟失败')
  await click(failed, '.dsh-nb-send')
  await waitFor(failed, `document.querySelector('.dsh-nb-error')?.textContent.includes('模拟模型请求失败')`)
  check('模型失败显示服务端错误')
  const fresh = await open('fresh')
  check('首次使用自动创建独立工作台', await evaluate(fresh, `window.__nbDev.store.workspaces.length === 1 && document.querySelector('.dsh-nb-workbench').dataset.workspaceId`))
  const narrow = await open('ready', 420, 900)
  // Hold the first save in flight so a second click really reverses a
  // pending choice. Both the visible control and persisted mode must agree.
  await evaluate(narrow, `(() => {
    const fetch = window.fetch
    window.__restoreModeFetch = () => { window.fetch = fetch }
    window.__modeRequests = []
    window.fetch = async (url, options) => {
      const body = JSON.parse(options.body).payload
      if (body.op === 'workspaceUpdate' && body.mode) {
        window.__modeRequests.push(body.mode)
        if (window.__modeRequests.length === 1) await new Promise(resolve => { window.__releaseMode = resolve })
        if (window.__modeRequests.length === 3) throw Error('模拟模式保存失败')
      }
      return fetch(url, options)
    }
  })()`)
  await click(narrow, '[data-mode="sources"]')
  await waitFor(narrow, `window.__releaseMode && document.querySelector('[data-mode="sources"]').getAttribute('aria-pressed') === 'true'`)
  await click(narrow, '[data-mode="research"]')
  check('服务返回前可立即反向选择模式', await evaluate(narrow, `window.__modeRequests.join() === 'sources' && document.querySelector('[data-mode="research"]').getAttribute('aria-pressed') === 'true'`))
  await evaluate(narrow, 'window.__releaseMode()')
  await waitFor(narrow, `window.__modeRequests.join() === 'sources,research' && window.__nbDev.store.workspaces[0].mode === 'research'`)
  await click(narrow, '[data-mode="sources"]')
  await waitFor(narrow, `document.querySelector('.dsh-nb-error')?.textContent.includes('模拟模式保存失败')`)
  check('模式保存失败恢复已保存选择并保留错误提示', await evaluate(narrow, `window.__nbDev.store.workspaces[0].mode === 'research' && document.querySelector('[data-mode="research"]').getAttribute('aria-pressed') === 'true'`))
  await evaluate(narrow, 'window.__restoreModeFetch()')
  await click(narrow, '[data-action="retry"]')
  await waitFor(narrow, `!document.querySelector('.dsh-nb-error')`)
  check('窄屏不横向溢出', await evaluate(narrow, `document.documentElement.scrollWidth <= innerWidth + 1`))
  check('窄屏页签以正确的按下状态和颜色区分当前视图', await evaluate(narrow, `(() => {
    const tabs = document.querySelector('.dsh-nb-pane-tabs')
    const active = tabs.querySelectorAll('[aria-pressed="true"]'), others = tabs.querySelectorAll('[aria-pressed="false"]')
    const thumb = tabs.querySelector('.dsh-nb-switch-thumb'), shape = thumb.getBoundingClientRect()
    const target = active[0].getBoundingClientRect()
    return active.length === 1 && active[0].dataset.paneTarget === 'chat' && others.length === 2 &&
      Math.abs((shape.left + shape.right - target.left - target.right) / 2) < 2 &&
      shape.width > target.width * .95 && shape.width < target.width * 1.05 &&
      getComputedStyle(active[0]).color !== getComputedStyle(others[0]).color
  })()`))
  await shot(narrow, 'workbench-mobile')
  await beginActivity(narrow)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, narrow)
  check('窄屏减少动态效果保留可访问的静态运行提示', await evaluate(narrow, `(() => { const activity = document.querySelector('.dsh-nb-activity[data-activity="running"]'); return activity?.getAttribute('aria-label') === '正在处理' && getComputedStyle(activity.querySelector('.dsh-nb-whale-animated')).display === 'none' && getComputedStyle(activity.querySelector('.dsh-nb-whale-still')).display !== 'none' })()`))
  for (const pane of ['sources', 'studio', 'chat']) {
    await click(narrow, '[data-pane-target="' + pane + '"]')
    check('窄屏 ' + pane + ' 区域保留唯一运行提示', await evaluate(narrow, `(() => { const items = document.querySelectorAll('.dsh-nb-activity[data-activity="running"]'); if (items.length !== 1) return false; const rect = items[0].getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 })()`))
  }

  const motion = await open('ready')
  await send('Page.bringToFront', {}, motion)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'dark' }] }, motion)
  check('空闲工作台没有粒子画布或持续逐帧调度', await evaluate(motion, `!document.querySelector('canvas, .dsh-nb-activity[data-activity="running"]') && window.__nbRafRequests === 0`))
  const particle = '.dsh-nb-particle-whale'
  await waitFor(motion, `document.querySelector('button.dsh-nb-particle-whale[data-playing="false"]')`)
  // The nearby rotated hairlines overlap this crop. Chrome rasterizes their
  // antialiasing slightly differently after the sprite's layer is retired.
  // Hide only the stationary waterlines for this exact whale-pixel test.
  await evaluate(motion, `(() => {
    const style = document.createElement('style')
    style.id = 'test-isolate-particle'
    style.textContent = '.dsh-nb-hero-mark::before, .dsh-nb-hero-mark::after { visibility: hidden !important; }'
    document.head.appendChild(style)
  })()`)
  const poster = await visualFrame(motion, particle)
  await delay(180)
  check('空态粒子鲸在点击前保持静止', poster === await visualFrame(motion, particle))
  await click(motion, particle)
  await waitFor(motion, `document.querySelector('.dsh-nb-particle-whale[data-playing="true"]')`)
  const particleFrames = []
  for (let i = 0; i < 5; i++) { particleFrames.push(await visualFrame(motion, particle)); await delay(160) }
  check('点按粒子鲸后图集产生不同真实画面', new Set(particleFrames).size > 1)
  await waitFor(motion, `document.querySelector('.dsh-nb-particle-whale[data-playing="false"]')`)
  check('粒子鲸播放一次后恢复原海报且未调用 RAF', poster === await visualFrame(motion, particle) && await evaluate(motion, `window.__nbRafRequests === 0`))
  await evaluate(motion, `document.getElementById('test-isolate-particle').remove()`)
  const idleToolbar = await evaluate(motion, `(() => { const rect = document.querySelector('.dsh-nb-toolbar').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })()`)
  await beginActivity(motion)
  const frames = []
  for (let index = 0; index < 6; index++) { frames.push(await activityFrame(motion)); await delay(220) }
  report.motion = { sampledFrames: frames.length, distinctRunningFrames: new Set(frames).size }
  check('运行提示播放真实鲸尾动效且不建立 JavaScript 逐帧循环', new Set(frames).size > 1 && await evaluate(motion, `!document.querySelector('canvas') && window.__nbRafRequests === 0`))
  check('运行装饰不拦截操作，辅助技术只读取稳定状态', await evaluate(motion, `(() => { const activity = document.querySelector('.dsh-nb-activity[data-activity="running"]'), animated = activity.querySelector('.dsh-nb-whale-animated'), still = activity.querySelector('.dsh-nb-whale-still'); return activity.getAttribute('role') === 'status' && activity.getAttribute('aria-label') === '正在处理' && animated.closest('[aria-hidden="true"]') && still.closest('[aria-hidden="true"]') && getComputedStyle(activity).pointerEvents === 'none' && !activity.querySelector('button, input, [tabindex]') })()`))
  check('运行提示固定槽位不改变顶栏布局', JSON.stringify(idleToolbar) === JSON.stringify(await evaluate(motion, `(() => { const rect = document.querySelector('.dsh-nb-toolbar').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })()`)))
  await input(motion, '[aria-label="发送给模型的消息"]', '动效不会抢走输入焦点')
  const pointer = await evaluate(motion, `(() => { const rect = document.querySelector('.dsh-nb-activity[data-activity="running"]').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pointer }, motion)
  check('指针经过运行提示不改变输入焦点或草稿', await evaluate(motion, `document.activeElement === document.querySelector('[aria-label="发送给模型的消息"]') && document.activeElement.value === '动效不会抢走输入焦点'`))
  await shot(motion, 'motion-running-dark')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'dark' }] }, motion)
  await waitFor(motion, `getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).display === 'none'`)
  // Media queries update CSS before delivering the change event that replaces
  // the optional playback button with the decorative poster.
  await waitFor(motion, `document.querySelector('span.dsh-nb-particle-whale')`)
  check('减少动态时粒子鲸保留静态海报并移除播放按钮', await evaluate(motion, `!!document.querySelector('span.dsh-nb-particle-whale[aria-hidden="true"][data-playing="false"]') && !document.querySelector('button.dsh-nb-particle-whale')`))
  const reducedFrame = await activityFrame(motion)
  await delay(450)
  check('系统减少动态时显示静态鲸尾且裁剪帧保持不变', reducedFrame === await activityFrame(motion) && await evaluate(motion, `(() => { const still = document.querySelector('.dsh-nb-whale-still'); return getComputedStyle(still).display !== 'none' && still.getBoundingClientRect().width > 0 && getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).maskImage === 'none' && window.__nbRafRequests === 0 })()`))
  await shot(motion, 'motion-reduced')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'dark' }] }, motion)
  await waitFor(motion, `getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).display !== 'none' && getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).maskImage !== 'none'`)
  const restoredFrames = []
  for (let index = 0; index < 4; index++) { restoredFrames.push(await activityFrame(motion)); await delay(250) }
  report.motion.distinctRestoredFrames = new Set(restoredFrames).size
  check('系统动态偏好恢复后继续播放真实鲸尾帧', new Set(restoredFrames).size > 1)
  const darkPalette = await evaluate(motion, `(() => { const panel = getComputedStyle(document.querySelector('.dsh-nb')); return { background: panel.backgroundColor, foreground: panel.color, accent: getComputedStyle(document.querySelector('.dsh-nb-activity')).color } })()`)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'light' }] }, motion)
  // Theme transitions finish before reading enabled controls or taking the
  // acceptance screenshot; a captured intermediate white label is misleading.
  await waitFor(motion, `document.querySelector('.dsh-nb').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')`)
  const lightPalette = await evaluate(motion, `(() => { const panel = getComputedStyle(document.querySelector('.dsh-nb')); return { background: panel.backgroundColor, foreground: panel.color, accent: getComputedStyle(document.querySelector('.dsh-nb-activity')).color } })()`)
  report.themes = { dark: darkPalette, light: lightPalette }
  check('浅色和深色主题分别适配背景文字与鲸尾颜色', darkPalette.background !== lightPalette.background && darkPalette.foreground !== lightPalette.foreground && darkPalette.foreground !== darkPalette.background && lightPalette.foreground !== lightPalette.background && lightPalette.accent !== lightPalette.background && darkPalette.accent !== darkPalette.background)
  report.themes.lightControls = await evaluate(motion, `(() => {
    const luminance = color => { const values = color.match(/[0-9.]+/g).slice(0, 3).map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722 }
    const background = getComputedStyle(document.querySelector('.dsh-nb')).backgroundColor, bg = luminance(background)
    return ['.dsh-nb-source-open', '.dsh-nb-notebook-trigger', '.dsh-nb-art', '[data-action="history"]', '[data-action="new-workspace"]', '[data-action="stop"]'].map(selector => { const node = document.querySelector(selector), style = getComputedStyle(node), fg = luminance(style.color); return { selector, disabled: node.disabled, color: style.color, background, contrast: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) } })
  })()`)
  check('浅色主题可用来源标题与关键操作文字对比度至少 4.5', report.themes.lightControls.every(control => control.disabled === false && control.contrast >= 4.5))
  await shot(motion, 'motion-running-light')
  await evaluate(motion, `document.documentElement.style.setProperty('--dsw-alias-bg-base', 'rgb(246, 247, 249)'); document.documentElement.style.setProperty('--dsw-alias-label-primary', 'rgb(22, 31, 46)')`)
  check('宿主主题变量优先于插件默认配色', await evaluate(motion, `getComputedStyle(document.querySelector('.dsh-nb')).backgroundColor === 'rgb(246, 247, 249)' && getComputedStyle(document.querySelector('.dsh-nb')).color === 'rgb(22, 31, 46)'`))
  await evaluate(motion, `document.documentElement.style.removeProperty('--dsw-alias-bg-base'); document.documentElement.style.removeProperty('--dsw-alias-label-primary')`)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] }, motion)
  await waitFor(motion, `getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).display === 'none'`)
  await waitFor(motion, `document.querySelector('span.dsh-nb-particle-whale')`)
  const forcedFrame = await activityFrame(motion)
  check('强制配色下粒子鲸使用可见静态图形', await evaluate(motion, `(() => {
    const whale = document.querySelector('span.dsh-nb-particle-whale[data-playing="false"]')
    if (!whale) return false
    const style = getComputedStyle(whale, '::before')
    return style.maskImage !== 'none' && style.backgroundColor !== getComputedStyle(document.querySelector('.dsh-nb')).backgroundColor
  })()`))
  await delay(450)
  check('强制配色使用可见静态鲸尾且不依赖动画遮罩', forcedFrame === await activityFrame(motion) && await evaluate(motion, `(() => { const activity = document.querySelector('.dsh-nb-activity'), still = activity.querySelector('.dsh-nb-whale-still'); return matchMedia('(forced-colors: active)').matches && getComputedStyle(still).display !== 'none' && still.getBoundingClientRect().width > 0 && getComputedStyle(activity.querySelector('.dsh-nb-whale-animated')).maskImage === 'none' && getComputedStyle(activity).color !== getComputedStyle(document.querySelector('.dsh-nb')).backgroundColor })()`))
  await evaluate(motion, `document.querySelector('[data-action="more"]').focus()`)
  check('强制配色保留键盘操作的可见焦点轮廓', await evaluate(motion, `(() => { const control = document.querySelector('[data-action="more"]'), style = getComputedStyle(control); return document.activeElement === control && control.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 })()`))
  await shot(motion, 'motion-forced-colors')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }, motion)
  check('减少透明度时阅读区与控件使用实底并保留运行状态', await evaluate(motion, `(() => {
    const surfaces = ['.dsh-nb-toolbar', '.dsh-nb-composer', '.dsh-nb-col.is-sources', '.dsh-nb-col.is-studio']
    return matchMedia('(prefers-reduced-transparency: reduce)').matches &&
      surfaces.every(selector => {
        const style = getComputedStyle(document.querySelector(selector))
        return style.backdropFilter === 'none' && style.backgroundColor.startsWith('rgb(')
      }) &&
      getComputedStyle(document.querySelector('.dsh-nb')).backgroundImage === 'none' &&
      document.querySelector('.dsh-nb-activity[data-activity="running"]')?.getAttribute('role') === 'status'
  })()`))
  await send('Emulation.setEmulatedMedia', { features: [] }, motion)
  await click(motion, '[data-action="stop"]')
  await waitFor(motion, `!document.querySelector('.dsh-nb-activity[data-activity="running"]')`)
  check('空闲时没有隐藏的播放遮罩或逐帧任务', await evaluate(motion, `!document.querySelector('.dsh-nb-whale-animated') && !document.querySelector('canvas') && window.__nbRafRequests === 0`))
  report.motion.rafRequests = await evaluate(motion, `window.__nbRafRequests`)
  await shot(motion, 'motion-idle')
  await evaluate(motion, `window.ReactDOM.render(null, document.getElementById('app'))`)
  await delay(180)
  check('离开工作台清理状态提示且无遗留动画调度', await evaluate(motion, `!document.querySelector('.dsh-nb-activity, canvas') && window.__nbRafRequests === 0`))

  const layout = await open('ready', 1100, 800)
  check('常态顶栏只有一行且模型选择位于输入框', await evaluate(layout, `document.querySelector('.dsh-nb-toolbar').getBoundingClientRect().height <= 64 && !!document.querySelector('.dsh-nb-composer .dsh-nb-model-select') && !document.querySelector('.dsh-nb-toolbar select')`))
  check('Studio 侧栏突出学习指南，六项工具分成三列', await evaluate(layout, `document.querySelectorAll('.dsh-nb-card:not(.dsh-nb-guide-card)').length === 6 && document.querySelector('.dsh-nb-guide-card')?.dataset.studioKind === 'study-guide' && getComputedStyle(document.querySelector('.dsh-nb-studio-grid')).gridTemplateColumns.split(' ').length === 3`))
  await selectModel(layout, '对话模型', 'dev-secondary', 'fixture-other')
  check('分组模型菜单同时更新提供方和模型', await evaluate(layout, `window.__nbDev.store.workspaces[0].provider === 'dev-secondary' && window.__nbDev.store.workspaces[0].model === 'fixture-other'`))
  await click(layout, '[data-action="notebooks"]')
  await click(layout, '[data-action="rename-notebook"]')
  await input(layout, '[aria-label="笔记本名称"]', '已重命名的研究笔记本')
  await click(layout, '.dsh-nb-dialog button[type="submit"]')
  await waitFor(layout, `document.querySelector('.dsh-nb-notebook-trigger').textContent.includes('已重命名')`)
  check('笔记本重命名保留会话名称', await evaluate(layout, `window.__nbDev.store.notebooks[0].title === '已重命名的研究笔记本' && window.__nbDev.store.workspaces[0].title === '海洋资料研究'`))
  await click(layout, '[data-action="new-note"]')
  await input(layout, '[aria-label="来源标题"]', '人工笔记')
  await input(layout, '[aria-label="来源内容"]', '这是一份通过真实 saveNote 操作保存的笔记。')
  await click(layout, '[data-action="add-source"]')
  await waitFor(layout, `document.querySelectorAll('.dsh-nb-source').length === 5`)
  check('创建笔记使用 note 类型并保存正文', await evaluate(layout, `window.__nbDev.store.sources.nb1.at(-1).kind === 'note' && window.__nbDev.store.sources.nb1.at(-1).body.includes('saveNote')`))
  await click(layout, '[data-mode="sources"]')
  await input(layout, '[aria-label="发送给模型的消息"]', '根据所选来源总结重点')
  await click(layout, '[aria-label="选择所有可用来源"]')
  await waitFor(layout, `window.__nbDev.store.sources.nb1.every(source => source.enabled) && !document.querySelector('[aria-label="选择所有可用来源"]').disabled`)
  check('勾选来源后允许发送资料问题', await evaluate(layout, `!document.querySelector('.dsh-nb-send').disabled`))
  await click(layout, '[aria-label="选择所有可用来源"]')
  await waitFor(layout, `window.__nbDev.store.sources.nb1.every(source => !source.enabled) && !document.querySelector('[aria-label="选择所有可用来源"]').disabled`)
  check('取消全选后资料问答与 Studio 均不可发送', await evaluate(layout, `document.querySelector('.dsh-nb-send').disabled && [...document.querySelectorAll('.dsh-nb-card')].every(node => node.disabled)`))
  await click(layout, '[aria-label="选择所有可用来源"]')
  await waitFor(layout, `window.__nbDev.store.sources.nb1.every(source => source.enabled) && !document.querySelector('[aria-label="选择所有可用来源"]').disabled`)
  await evaluate(layout, `window.__nbDev.store.messages.ws1.push({id:'citation-test',role:'assistant',status:'done',text:'核对来源 [s1]。未知引用 [outside-source]。<script>window.__unsafe=true</script>'})`)
  await waitFor(layout, `document.querySelector('[data-citation-source="s1"]')`)
  check('仅真实来源成为引用且模型文字不执行 HTML', await evaluate(layout, `document.querySelectorAll('.dsh-nb-citation').length === 1 && document.querySelector('.dsh-nb-message-body').textContent.includes('[outside-source]') && !window.__unsafe`))
  await evaluate(layout, `document.querySelector('[data-citation-source="s1"]').focus()`)
  await click(layout, '[data-citation-source="s1"]')
  await waitFor(layout, `document.querySelector('.dsh-nb-source-body')`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, layout)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, layout)
  await waitFor(layout, `!document.querySelector('.dsh-nb-dialog')`)
  check('详情支持 Esc 关闭且焦点回到引用', await evaluate(layout, `document.activeElement?.dataset.citationSource === 's1'`))
  await click(layout, '[data-action="save-answer"]')
  await waitFor(layout, `window.__nbDev.store.sources.nb1.length === 6`)
  check('保存回答绑定当前笔记本', await evaluate(layout, `window.__nbDev.store.sources.nb1.at(-1).kind === 'note' && window.__nbDev.store.sources.nb1.at(-1).body.includes('[s1]') && window.__nbDev.store.sources.nb2.length === 0`))
  const legacyCitation = await open('ready')
  await evaluate(legacyCitation, `(() => {
    const known = '12345678-1234-4234-8234-123456789abc';
    const other = '87654321-4321-4321-8321-cba987654321';
    window.__nbDev.store.sources.nb1[0].id = known;
    window.__nbDev.store.sources.nb2.push({id:other,title:'另一笔记本来源',body:'不应跨笔记本打开'});
    window.__nbDev.store.messages.ws1.push({id:'legacy-citation-test',role:'assistant',status:'done',text:
      '规范 [' + known + ']。已生成回答 (sourceId=' + known + '，chunk114)。' +
      '其他笔记本 sourceId=' + other + '。缩短 sourceId=12345678；[12345678]。' +
      '扩展 sourceId=' + known + '-extra。<script>window.__unsafe=true</script>'});
  })()`)
  await waitFor(legacyCitation, `document.querySelectorAll('.dsh-nb-citation').length === 2`)
  check('完整已知 sourceId=UUID 引用可点击且不推断短 ID 或跨笔记本来源', await evaluate(legacyCitation, `
    document.querySelectorAll('[data-citation-source="12345678-1234-4234-8234-123456789abc"]').length === 2 &&
    document.querySelector('.dsh-nb-message-body').textContent.includes('sourceId=87654321-4321-4321-8321-cba987654321') &&
    document.querySelector('.dsh-nb-message-body').textContent.includes('sourceId=12345678；[12345678]') &&
    document.querySelector('.dsh-nb-message-body').textContent.includes('sourceId=12345678-1234-4234-8234-123456789abc-extra') && !window.__unsafe`))
  await evaluate(legacyCitation, `document.querySelectorAll('.dsh-nb-citation')[1].click()`)
  await waitFor(legacyCitation, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('来源引用')`)
  check('历史 QA 的完整 sourceId 引用打开当前笔记本真实正文')
  const studioCitation = await open('ready')
  for (const kind of ['briefing', 'report']) {
    await evaluate(studioCitation, `Object.assign(window.__nbDev.store.artifacts.nb1[0], {kind:${JSON.stringify(kind)},body:'已保存的证据 [s1]。未知来源 [outside-source]。<script>window.__unsafe=true</script>'})`)
    await click(studioCitation, '.dsh-nb-art')
    await waitFor(studioCitation, `document.querySelector('.dsh-nb-preview [data-citation-source="s1"]')`)
    check((kind === 'briefing' ? '简报' : '报告') + '引用只解析真实来源并可打开保存正文', await evaluate(studioCitation, `document.querySelectorAll('.dsh-nb-preview .dsh-nb-citation').length === 1 && document.querySelector('.dsh-nb-preview').textContent.includes('[outside-source]') && !window.__unsafe`))
    await click(studioCitation, '.dsh-nb-preview [data-citation-source="s1"]')
    await waitFor(studioCitation, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('来源引用')`)
    await click(studioCitation, '[aria-label="关闭详情"]')
  }
  await send('Page.bringToFront', {}, layout)
  await click(layout, '[data-action="collapse-sources"]')
  await click(layout, '[data-action="collapse-studio"]')
  await send('Page.reload', {}, layout)
  await waitFor(layout, `document.querySelector('.dsh-nb-workbench')?.dataset.workspaceId`)
  check('侧栏折叠偏好在重新打开后保留', await evaluate(layout, `document.querySelector('.dsh-nb-workbench').dataset.sourcesCollapsed === 'true' && document.querySelector('.dsh-nb-workbench').dataset.studioCollapsed === 'true'`))
  await click(layout, '[data-action="expand-sources"]'); await click(layout, '[data-action="expand-studio"]')
  await delay(700)
  await shot(layout, 'workbench-new-layout')
  await send('Emulation.setDeviceMetricsOverride', { width: 850, height: 800, deviceScaleFactor: 1, mobile: false }, layout)
  await click(layout, '[data-pane-target="studio"]')
  check('中等宽度可切到 Studio 且来源仍可见', await evaluate(layout, `getComputedStyle(document.querySelector('.is-studio')).display === 'flex' && getComputedStyle(document.querySelector('.is-main')).display === 'none' && getComputedStyle(document.querySelector('.is-sources')).display === 'flex'`))
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false }, layout)
  await click(layout, '[data-pane-target="sources"]')
  check('窄屏只显示当前区域并可添加来源', await evaluate(layout, `getComputedStyle(document.querySelector('.is-sources')).display === 'flex' && getComputedStyle(document.querySelector('.is-studio')).display === 'none' && !document.querySelector('[data-action="open-add-source"]').disabled && document.documentElement.scrollWidth <= innerWidth`))
  await click(layout, '[data-pane-target="chat"]')
  await beginActivity(layout)
  await click(layout, '[data-action="more"]'); await click(layout, '[data-action="motion"]')
  await waitFor(layout, `document.querySelector('.dsh-nb-whale')?.dataset.motion === 'static'`)
  const userStaticFrame = await activityFrame(layout)
  await delay(450)
  check('用户关闭动态后静态提示仍在并保存偏好', userStaticFrame === await activityFrame(layout) && await evaluate(layout, `JSON.parse(localStorage.getItem('dsh-notebook.presentation.v1')).motion === false && getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).maskImage === 'none' && getComputedStyle(document.querySelector('.dsh-nb-whale-still')).display !== 'none'`))
  await send('Page.reload', {}, layout)
  await waitFor(layout, `document.querySelector('.dsh-nb-workbench')?.dataset.workspaceId`)
  await beginActivity(layout)
  check('重新打开工作台仍遵循用户关闭动态的偏好', await evaluate(layout, `document.querySelector('.dsh-nb-whale').dataset.motion === 'static' && getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).display === 'none' && getComputedStyle(document.querySelector('.dsh-nb-whale-still')).display !== 'none'`))
  await click(layout, '[data-action="more"]'); await click(layout, '[data-action="motion"]')
  await waitFor(layout, `document.querySelector('.dsh-nb-whale')?.dataset.motion === 'running'`)
  check('用户重新开启动态后恢复播放与偏好', await evaluate(layout, `JSON.parse(localStorage.getItem('dsh-notebook.presentation.v1')).motion === true && getComputedStyle(document.querySelector('.dsh-nb-whale-animated')).maskImage !== 'none'`))
  await click(layout, '[data-action="stop"]')

  const practice = await open('study')
  await openPractice(practice, 'aq1')
  check('测验先显示题目和选项，提交前不泄露答案或解释', await evaluate(practice, `document.querySelector('[data-study-item="q1"]') && document.querySelectorAll('[data-study-choice]').length === 2 && !document.querySelector('[data-study-feedback]') && !document.querySelector('.dsh-nb-dialog').textContent.includes('来源引用应保留原文与定位')`))
  await click(practice, '[data-study-choice="B"]')
  await doubleClick(practice, '[data-action="study-submit"]')
  await waitFor(practice, `document.querySelector('[data-study-feedback]')?.textContent.includes('来源引用应保留原文与定位')`)
  check('测验选错后保存一次作答并给出引用解释，双击不重复提交', await evaluate(practice, `(() => { const sessions = Object.values(window.__nbDev.store.studySessions); const session = sessions.find(item => item.artifactId === 'aq1'); return session.history.length === 1 && session.history[0].answer === 'B' && session.history[0].correct === false && window.__nbDev.requests.filter(item => item.op === 'studyAnswer').length === 1 && document.querySelector('[data-study-feedback] [data-citation-source="s1"]') && !window.__studyUnsafe })()`))
  await shot(practice, 'quiz-feedback')
  await click(practice, '[data-study-feedback] [data-citation-source="s1"]')
  await waitFor(practice, `document.querySelector('.dsh-nb-source-body')?.textContent.includes('来源引用')`)
  check('练习解释引用可核验当前笔记本保存的来源正文')
  await click(practice, '[aria-label="关闭详情"]')
  await enterPractice(practice)
  check('查看引用后重开测验仍保留已提交反馈', await evaluate(practice, `document.querySelector('[data-study-item="q1"]') && document.querySelector('[data-study-feedback]')`))
  await doubleClick(practice, '[data-action="study-next"]')
  await waitFor(practice, `document.querySelector('[data-study-item="q2"]') && !document.querySelector('[data-study-feedback]')`)
  await click(practice, '[aria-label="关闭详情"]')
  await openPractice(practice, 'aq1')
  check('下一题进度持久化，关闭重开不回到第一题或跳过题目', await evaluate(practice, `document.querySelector('[data-study-item="q2"]') && Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'aq1').position === 1`))
  await click(practice, '[data-study-choice="B"]')
  await click(practice, '[data-action="study-submit"]')
  await waitFor(practice, `document.querySelector('[data-study-feedback]')`)
  await click(practice, '[data-action="study-next"]')
  await waitFor(practice, `document.querySelector('[data-study-result]')`)
  check('测验完成后保留得分与一条错题', await evaluate(practice, `(() => { const session = Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'aq1'); return session.completed && session.history.length === 2 && session.history.filter(item => item.correct).length === 1 && !document.querySelector('[data-action="study-mistakes"]').disabled })()`))
  await retryMistakes(practice)
  await waitFor(practice, `document.querySelector('[data-study-item="q1"]') && !document.querySelector('[data-study-feedback]')`)
  check('错题重练只包含最近答错的题', await evaluate(practice, `Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'aq1' && item.mode === 'mistakes').items.length === 1 && !document.querySelector('[data-study-item="q2"]')`))
  await click(practice, '[data-study-choice="A"]')
  await click(practice, '[data-action="study-submit"]')
  await waitFor(practice, `document.querySelector('[data-study-feedback]')`)
  await click(practice, '[data-action="study-next"]')
  await waitFor(practice, `document.querySelector('[data-study-result]')`)
  check('错题答对后移出待练队列，并保留原有错误历史', await evaluate(practice, `(() => { const session = Object.values(window.__nbDev.store.studySessions).filter(item => item.artifactId === 'aq1').at(-1), result = window.__nbDev.handle({op:'studyGet',workspaceId:'ws1',studySessionId:session.id}).study; return result.mistakeCount === 0 && result.history.length === 3 && result.history.some(item => item.correct === false) && result.history.at(-1).correct === true })()`))
  await click(practice, '[data-action="study-history"]')
  check('作答历史展示错误与重练记录且文本不执行 HTML', await evaluate(practice, `document.querySelector('[data-action="study-history"]').parentElement.textContent.includes('来源引用应保留原文与定位') && !window.__studyUnsafe`))
  await click(practice, '[aria-label="关闭详情"]')

  await openPractice(practice, 'af1')
  check('闪卡先回忆，翻面前没有答案或自评按钮', await evaluate(practice, `document.querySelector('[data-study-item="f1"]') && document.querySelector('[aria-label="先写下你的回忆"]') && !document.querySelector('[data-study-feedback]') && !document.querySelector('[data-study-rating]') && !document.querySelector('.dsh-nb-dialog').textContent.includes('便于研究者核验模型给出的结论')`))
  await input(practice, '[aria-label="先写下你的回忆"]', '我记得需要核对证据，但还不确定如何定位。')
  await evaluate(practice, `window.__answersBeforeReveal = window.__nbDev.requests.filter(item => item.op === 'studyAnswer').length`)
  await doubleClick(practice, '[data-action="study-reveal"]')
  await waitFor(practice, `document.querySelector('[data-study-feedback]')?.textContent.includes('便于研究者核验模型给出的结论')`)
  check('闪卡保存回忆再显示答案，双击翻面不会重复写入', await evaluate(practice, `(() => { const session = Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'af1'); return session.history.length === 1 && session.history[0].answer.includes('还不确定') && session.history[0].correct === null && window.__nbDev.requests.filter(item => item.op === 'studyAnswer').length === window.__answersBeforeReveal + 1 && document.querySelector('[data-study-rating="again"]') && (!document.querySelector('[data-action="study-next"]') || document.querySelector('[data-action="study-next"]').disabled) })()`))
  await doubleClick(practice, '[data-study-rating="again"]')
  await waitFor(practice, `document.querySelector('[data-action="study-next"]') && !document.querySelector('[data-action="study-next"]').disabled`)
  check('闪卡自评再练只记录一次，区分自评与自动评分', await evaluate(practice, `(() => { const session = Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'af1'); return session.history[0].rating === 'again' && session.history[0].grading === 'self-assessment' && session.history[0].correct === false && window.__nbDev.requests.filter(item => item.op === 'studyRate').length === 1 && document.querySelector('.dsh-nb-dialog').textContent.includes('自评') })()`))
  await click(practice, '[data-action="study-next"]')
  await waitFor(practice, `document.querySelector('[data-study-item="f2"]')`)
  await input(practice, '[aria-label="先写下你的回忆"]', '取消后保留已收到的内容。')
  await click(practice, '[data-action="study-reveal"]')
  await waitFor(practice, `document.querySelector('[data-study-rating="remembered"]')`)
  await click(practice, '[data-study-rating="remembered"]')
  await waitFor(practice, `document.querySelector('[data-action="study-next"]') && !document.querySelector('[data-action="study-next"]').disabled`)
  await click(practice, '[data-action="study-next"]')
  await waitFor(practice, `document.querySelector('[data-study-result]')`)
  await click(practice, '[aria-label="关闭详情"]')
  await openPractice(practice, 'af1')
  check('闪卡完成状态与两次自评在重新打开后恢复', await evaluate(practice, `document.querySelector('[data-study-result]') && Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'af1').history.length === 2`))
  await retryMistakes(practice)
  await waitFor(practice, `document.querySelector('[data-study-item="f1"]')`)
  await input(practice, '[aria-label="先写下你的回忆"]', '通过保存的原文与定位核验结论。')
  await click(practice, '[data-action="study-reveal"]')
  await waitFor(practice, `document.querySelector('[data-study-rating="remembered"]')`)
  await click(practice, '[data-study-rating="remembered"]')
  await waitFor(practice, `document.querySelector('[data-action="study-next"]') && !document.querySelector('[data-action="study-next"]').disabled`)
  await click(practice, '[data-action="study-next"]')
  await waitFor(practice, `document.querySelector('[data-study-result]')`)
  await click(practice, '[aria-label="关闭详情"]')
  await openPractice(practice, 'af1')
  check('闪卡重练后记住会清空待巩固项，关闭重开保留三次回忆历史', await evaluate(practice, `(() => { const session = Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'af1' && item.mode === 'all'), result = window.__nbDev.handle({op:'studyGet',workspaceId:'ws1',studySessionId:session.id}).study; return result.mistakeCount === 0 && result.history.length === 3 && result.history.at(-1).rating === 'remembered' && document.querySelector('[data-study-result]') })()`))
  await shot(practice, 'flashcards-completed')
  await evaluate(practice, `window.__nbDev.store.workspaces[0].notebookId = 'nb2'`)
  await waitFor(practice, `document.querySelector('.dsh-nb-workbench').dataset.notebookId === 'nb2' && !document.querySelector('[data-study-session]')`)
  check('切换笔记本关闭练习，其他笔记本不能读取练习状态', await evaluate(practice, `(() => { const session = Object.values(window.__nbDev.store.studySessions).find(item => item.artifactId === 'af1'); return !window.__nbDev.handle({op:'studyGet',workspaceId:'ws1',studySessionId:session.id}).ok && !document.querySelector('[data-study-item], [data-study-result], [data-study-feedback]') && !document.querySelector('[data-artifact-id="af1"]') })()`))
  await evaluate(practice, `window.__nbDev.store.workspaces[0].notebookId = 'nb1'`)
  await waitFor(practice, `document.querySelector('[data-artifact-id="abroken"]')`)
  for (const [artifactId, error] of [['abroken', '不是有效 JSON'], ['aunknown', '未知来源']]) {
    await click(practice, '[data-artifact-id="' + artifactId + '"]')
    await waitFor(practice, `document.querySelector('.dsh-nb-dialog')?.textContent.includes(${JSON.stringify(error)})`)
    check((artifactId === 'abroken' ? '旧格式无效 JSON' : '未知来源引用') + '练习明确拒绝且不执行内容或生成可点击外部引用', await evaluate(practice, `document.querySelector('[data-action="study-regenerate"]') && !document.querySelector('[data-action="study-start"], [data-study-choice], [data-study-rating], [data-citation-source="outside-source"]') && !window.__studyUnsafe && !Object.values(window.__nbDev.store.studySessions).some(item => item.artifactId === ${JSON.stringify(artifactId)})`))
    await click(practice, '[aria-label="关闭详情"]')
  }

  const unauthenticated = await open('unauthenticated', 1100, 800)
  await delay(100)
  check('相同登录错误仅保留一条且不假装思考', await evaluate(unauthenticated, `document.querySelectorAll('.dsh-nb-status').length === 1 && !document.querySelector('.dsh-nb-activity[data-activity="running"], canvas') && window.__nbRafRequests === 0`))
  check('宿主认证失败时不降级到旧的直连 HTTP 接口', await evaluate(unauthenticated, `window.__nbDev.requests.length > 0 && window.__nbDev.requests.every(item => item.rpc)`))
  await shot(unauthenticated, 'workbench-login-required')
  await evaluate(unauthenticated, `window.__nbDev.setAuthenticated(true)`)
  await click(unauthenticated, '[data-action="retry"]')
  await waitFor(unauthenticated, `document.querySelector('.dsh-nb-workbench').dataset.workspaceId && !document.querySelector('.dsh-nb-error')`)
  check('登录恢复后可同时重读工作台和模型目录', await evaluate(unauthenticated, `document.querySelectorAll('.dsh-nb-source').length === 4 && !document.querySelector('[aria-label="对话模型"]').disabled`))

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
  if (ws) { try { await send('Browser.close', {}, undefined, 1000) } catch {} ws.close() }
  chrome.kill('SIGKILL')
  server.close()
  await delay(100)
  await rm(userData, { recursive: true, force: true }).catch(() => {})
}
