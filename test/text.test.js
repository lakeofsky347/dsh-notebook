import assert from 'node:assert/strict'
import test from 'node:test'
import { renderContext } from '../src/text.js'

test('source citation rules precede optional notebook instructions and remain within the context budget', () => {
  const notebook = { title: 'Evidence', style: 'learning', grounding: 'sources-only', instructions: 'Custom guidance '.repeat(200) }
  const budget = 550
  const rendered = renderContext(notebook, [], budget)
  assert.ok(rendered.length <= budget)
  assert.ok(rendered.indexOf('Grounding:') < rendered.indexOf('引用：'))
  assert.ok(rendered.indexOf('引用：') < rendered.indexOf('Style:'))
  assert.match(rendered, /每项有依据的事实后写 \[sourceId\]/)
  assert.match(rendered, /真实完整 ID/)
  assert.match(rendered, /不用短 ID、片段编号、“同源”或“同上”/)
  for (const maxChars of [0, 1, 100, 200, 400]) {
    assert.ok(renderContext(notebook, [], maxChars).length <= maxChars)
  }
})
