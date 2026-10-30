import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const port = 9334
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=/tmp/chrome-nb-check`,
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' })

function die(error) {
  chrome.kill('SIGKILL')
  console.error(error)
  process.exit(1)
}

async function version() {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return response.json()
    } catch {}
    await delay(100)
  }
  throw new Error('chrome did not open a debugging port')
}

const browser = await version()
const ws = new WebSocket(browser.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
let seq = 0
const pending = new Map()
const sessions = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
})
function send(method, params = {}, sessionId) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    ws.send(JSON.stringify(payload))
  })
}

async function openPage(url, width, height) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, sessionId)
  await send('Page.navigate', { url }, sessionId)
  return sessionId
}

async function evaluate(sessionId, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId)
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800))
  return result.result.value
}

async function waitFor(sessionId, expression, timeout = 4000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeout) {
    try {
      const value = await evaluate(sessionId, expression)
      if (value) return value
      last = value
    } catch (error) {
      last = String(error).slice(0, 180)
    }
    await delay(40)
  }
  throw new Error('timeout waiting for ' + expression.slice(0, 120) + ' last=' + last)
}

function contrast(fg, bg) {
  const lin = (channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
  const a = L(fg)
  const b = L(bg)
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  return Math.round(ratio * 100) / 100
}

const report = { scenes: {}, contrast: {}, a11y: {}, leaks: {} }
process.on('uncaughtException', (error) => {
  report.failure = String(error && error.stack || error)
  console.log(JSON.stringify(report, null, 2))
  chrome.kill('SIGKILL')
  process.exit(1)
})

const ready = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=1&scene=ready', 1440, 900)
await waitFor(ready, `document.querySelectorAll('.dsh-nb-source').length >= 4`)
report.scenes.ready = await evaluate(ready, `window.__nbProbe()`)
report.scenes.select = await evaluate(ready, `(() => {
  const node = document.querySelector('select.dsh-nb-field')
  const style = getComputedStyle(node)
  const option = node.selectedOptions[0]
  return {
    value: node.value,
    text: option ? option.textContent : '',
    color: style.color,
    background: style.backgroundColor,
    height: style.height,
    appearance: style.appearance,
  }
})()`)

const sampleExpr = (selector, pseudo = '') => `(() => {
  const node = document.querySelector(${JSON.stringify(selector)})
  const style = getComputedStyle(node${pseudo ? `, ${JSON.stringify(pseudo)}` : ''})
  const parse = (value) => value.match(/\\d+/g).slice(0, 3).map(Number)
  return { color: parse(style.color), background: parse(style.backgroundColor), outline: style.outline, font: style.fontFamily }
})()`

report.contrast.primary = await evaluate(ready, sampleExpr('button.dsh-nb-chip.primary'))
report.contrast.muted = await evaluate(ready, sampleExpr('.dsh-nb-meta'))
report.contrast.hero = await evaluate(ready, sampleExpr('.dsh-nb-hero h2'))
report.contrast.body = await evaluate(ready, sampleExpr('.dsh-nb'))
report.contrast.accent = await evaluate(ready, sampleExpr('.dsh-nb-idx'))
report.contrast.sendDisabled = await evaluate(ready, sampleExpr('button.dsh-nb-send'))
report.contrast.caption = await evaluate(ready, sampleExpr('.dsh-nb-caption'))
report.contrast.cardDesc = await evaluate(ready, sampleExpr('.dsh-nb-card-copy span'))
report.leaks.hostButton = await evaluate(ready, sampleExpr('button.host-button'))
report.leaks.stylesheet = await evaluate(ready, `(() => {
  const css = document.getElementById('dsh-notebook-style').textContent
  const bad = []
  for (const block of css.split('}')) {
    const head = block.split('{')[0]
    if (!head || !head.trim()) continue
    const selectors = head.split(',').map((item) => item.trim()).filter(Boolean)
    for (const selector of selectors) {
      if (selector.startsWith('@')) continue
      if (selector.startsWith('from') || selector.startsWith('to') || /^\\d/.test(selector)) continue
      if (!selector.includes('.dsh-nb')) bad.push(selector)
    }
  }
  return { bad, bytes: css.length, ids: document.querySelectorAll('#dsh-notebook-style').length }
})()`)

await evaluate(ready, `document.querySelector('button.dsh-nb-chip.primary').focus()`)
report.a11y.primaryFocus = await evaluate(ready, `(() => {
  const style = getComputedStyle(document.activeElement)
  return { active: document.activeElement.className, outline: style.outlineStyle + ' ' + style.outlineWidth + ' ' + style.outlineColor }
})()`)

const reduced = await openPage('about:blank', 1440, 900)
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, reduced)
await send('Page.navigate', { url: 'http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready' }, reduced)
await waitFor(reduced, `document.querySelector('.dsh-nb-cloud') && matchMedia('(prefers-reduced-motion: reduce)').matches`)
report.a11y.reducedMotion = await evaluate(reduced, `({
  match: matchMedia('(prefers-reduced-motion: reduce)').matches,
  animation: getComputedStyle(document.querySelector('.dsh-nb-cloud')).animationName,
})`)

const ask = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready&act=ask', 1440, 900)
await waitFor(ask, `document.querySelector('.dsh-nb-bubble.assistant')`)
report.scenes.ask = await evaluate(ask, `window.__nbProbe()`)
const askShot = await send('Page.captureScreenshot', { format: 'png' }, ask)
writeFileSync('/tmp/nb-shots/after_thread.png', Buffer.from(askShot.data, 'base64'))

const typed = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 1440, 900)
await waitFor(typed, `document.querySelector('.dsh-nb-composer textarea')`)
await evaluate(typed, `(() => {
  const area = document.querySelector('.dsh-nb-composer textarea')
  area.focus()
  area.value = '插件如何替换'
  area.dispatchEvent(new Event('input', { bubbles: true }))
  return area.value
})()`)
report.scenes.typed = await evaluate(typed, `(() => {
  const area = document.querySelector('.dsh-nb-composer textarea')
  const button = document.querySelector('.dsh-nb-send')
  return { value: area.value, disabled: button.disabled, sendBg: getComputedStyle(button).backgroundColor, sendFg: getComputedStyle(button).color }
})()`)
await evaluate(typed, `document.querySelector('.dsh-nb-composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
await waitFor(typed, `document.querySelector('.dsh-nb-bubble.user')`)
report.scenes.enter = await evaluate(typed, `window.__nbProbe()`)

const shift = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 1440, 900)
await waitFor(shift, `document.querySelector('.dsh-nb-composer textarea')`)
report.scenes.shiftEnter = await evaluate(shift, `(() => {
  const area = document.querySelector('.dsh-nb-composer textarea')
  area.focus()
  area.value = '第一行'
  area.dispatchEvent(new Event('input', { bubbles: true }))
  const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
  const notCanceled = area.dispatchEvent(event)
  return { bubbles: document.querySelectorAll('.dsh-nb-bubble').length, defaultPrevented: !notCanceled, value: area.value }
})()`)

const added = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready&act=add', 1280, 900)
await waitFor(added, `document.querySelector('.dsh-nb-tabs button.on')`)
report.scenes.add = await evaluate(added, `window.__nbProbe()`)
await evaluate(added, `(() => {
  const area = document.querySelector('.dsh-nb-area')
  area.focus()
  area.value = '一段可检索的资料'
  area.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('.dsh-nb-add .dsh-nb-chip').click()
})()`)
await delay(80)
await waitFor(added, `document.querySelectorAll('.dsh-nb-source').length >= 5`)
report.scenes.added = await evaluate(added, `({ sources: document.querySelectorAll('.dsh-nb-source').length, adding: !!document.querySelector('.dsh-nb-tabs') })`)
const addShot = await send('Page.captureScreenshot', { format: 'png' }, added)
writeFileSync('/tmp/nb-shots/after_add.png', Buffer.from(addShot.data, 'base64'))

const artifact = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready&act=artifact', 1440, 900)
await waitFor(artifact, `document.querySelector('.dsh-nb-preview')`)
report.scenes.artifact = await evaluate(artifact, `window.__nbProbe()`)
const artShot = await send('Page.captureScreenshot', { format: 'png' }, artifact)
writeFileSync('/tmp/nb-shots/after_artifact.png', Buffer.from(artShot.data, 'base64'))

const ground = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 1440, 900)
await waitFor(ground, `document.querySelector('.dsh-nb-chip.is-on')`)
await evaluate(ground, `document.querySelector('.dsh-nb-chip.is-on').click()`)
await waitFor(ground, `[...document.querySelectorAll('.dsh-nb-chip')].some((node) => node.textContent.includes('来源 + 工具'))`)
report.scenes.ground = await evaluate(ground, `window.__nbProbe()`)

const box = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 1440, 900)
await waitFor(box, `document.querySelectorAll('.dsh-nb-check').length >= 4`)
report.scenes.toggle = await evaluate(box, `(() => {
  const input = document.querySelectorAll('.dsh-nb-check')[2]
  const before = input.checked
  input.click()
  return { before, afterClick: input.checked }
})()`)
await delay(60)
report.scenes.toggleAfter = await evaluate(box, `[...document.querySelectorAll('.dsh-nb-check')].map((node) => node.checked)`)

const error = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=error', 1440, 800)
await waitFor(error, `document.querySelector('.dsh-nb-error')`)
report.scenes.error = await evaluate(error, `window.__nbProbe()`)
report.contrast.error = await evaluate(error, sampleExpr('.dsh-nb-error'))
const errorShot = await send('Page.captureScreenshot', { format: 'png' }, error)
writeFileSync('/tmp/nb-shots/after_error.png', Buffer.from(errorShot.data, 'base64'))

const empty = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=empty', 1440, 800)
await waitFor(empty, `document.querySelector('.dsh-nb-empty')`)
report.scenes.empty = await evaluate(empty, `window.__nbProbe()`)

const fresh = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=fresh', 1440, 800)
await waitFor(fresh, `document.querySelector('.dsh-nb-hero h2')`)
report.scenes.fresh = await evaluate(fresh, `window.__nbProbe()`)

const none = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=nosession', 900, 700)
await delay(200)
await evaluate(none, `document.querySelector('button.dsh-nb-chip.primary').click()`)
await waitFor(none, `document.querySelector('.dsh-nb-error')`)
report.scenes.nosession = await evaluate(none, `window.__nbProbe()`)

const narrow = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 420, 900)
await waitFor(narrow, `document.querySelectorAll('.dsh-nb-source').length >= 4`)
report.scenes.narrowColumns = await evaluate(narrow, `getComputedStyle(document.querySelector('.dsh-nb-grid')).gridTemplateColumns || getComputedStyle(document.querySelector('.dsh-nb-grid')).display`)
await evaluate(narrow, `document.querySelector('.dsh-nb-grid').scrollTop = 900`)
await delay(50)
const narrowShot = await send('Page.captureScreenshot', { format: 'png' }, narrow)
writeFileSync('/tmp/nb-shots/after_narrow_scrolled.png', Buffer.from(narrowShot.data, 'base64'))

const desktop = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 1440, 900)
await waitFor(desktop, `document.querySelectorAll('.dsh-nb-source').length >= 4`)
report.scenes.desktopSelect = await evaluate(desktop, `(() => {
  const node = document.querySelector('select')
  if (!node) return null
  return { value: node.value, options: [...node.options].map((option) => option.value + ':' + option.textContent), selected: node.selectedIndex }
})()`)
const deskShot = await send('Page.captureScreenshot', { format: 'png' }, desktop)
writeFileSync('/tmp/nb-shots/after_desktop.png', Buffer.from(deskShot.data, 'base64'))
const narrowFull = await openPage('http://127.0.0.1:8765/dev/preview.html?chrome=0&scene=ready', 420, 900)
await waitFor(narrowFull, `document.querySelectorAll('.dsh-nb-source').length >= 4`)
const narrowFullShot = await send('Page.captureScreenshot', { format: 'png' }, narrowFull)
writeFileSync('/tmp/nb-shots/after_narrow.png', Buffer.from(narrowFullShot.data, 'base64'))

function pair(item) {
  if (!item || !item.color) return null
  return { ...item, ratio: contrast(item.color, item.background) }
}
for (const key of Object.keys(report.contrast)) report.contrast[key] = pair(report.contrast[key])

console.log(JSON.stringify(report, null, 2))
chrome.kill('SIGKILL')
ws.close()
process.exit(0)
