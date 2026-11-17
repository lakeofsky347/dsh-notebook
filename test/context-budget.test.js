import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fitArtifactPrompt, pruneWorkbenchContext, resolveArtifactBudget } from '../src/context-budget.js'
import { studioPrompt } from '../src/prompt.js'

test('native pruning uses the agent scope and preserves native failure signals', () => {
  const session = { originalJournal: [{ text: 'full original source' }] }
  const result = { pruned: [{ callId: 'call-1' }], charsRemoved: 9000 }
  let calls = 0
  const agent = { session, ctx: { get(name) {
    assert.equal(name, 'toolResultPruner')
    return { pruneSession(value) { assert.equal(value, session); calls++; return result } }
  } } }
  assert.equal(pruneWorkbenchContext(agent), result)
  assert.equal(calls, 1)
  assert.equal(session.originalJournal[0].text, 'full original source')
  for (const unavailable of [null, {}, { session, ctx: { get: () => undefined } }]) assert.equal(pruneWorkbenchContext(unavailable), null)
  const failure = new Error('native journal write failed')
  assert.throws(() => pruneWorkbenchContext({ session, ctx: { get: () => ({ pruneSession() { throw failure } }) } }), error => error === failure)
})

test('native pruning resolves isolated preset services through the public registry', () => {
  const session = { originalJournal: [{ seq: 30, text: 'original full result' }] }
  const agent = { session, ctx: { get: () => undefined } }
  const result = { pruned: [{ originalSeq: 30, replacementSeq: 42 }], charsRemoved: 23000 }
  let resolutions = 0
  const registry = { serviceFor(value, name) {
    assert.equal(value, agent)
    assert.equal(name, 'toolResultPruner')
    resolutions++
    return { pruneSession(value) { assert.equal(value, session); return result } }
  } }
  assert.equal(pruneWorkbenchContext(agent, registry), result)
  assert.equal(resolutions, 1)
  assert.equal(session.originalJournal[0].text, 'original full result')
  const directlyMounted = { session, ctx: { get: () => ({ pruneSession: () => result }) } }
  assert.equal(pruneWorkbenchContext(directlyMounted, { serviceFor() { throw new Error('must not resolve a second service') } }), result)
  assert.equal(pruneWorkbenchContext(agent, { serviceFor: () => undefined }), null)
  const failure = new Error('isolated journal write failed')
  assert.throws(() => pruneWorkbenchContext(agent, { serviceFor: () => ({ pruneSession() { throw failure } }) }), error => error === failure)
  const resolutionFailure = new Error('preset resolution failed')
  assert.throws(() => pruneWorkbenchContext(agent, { serviceFor() { throw resolutionFailure } }), error => error === resolutionFailure)
})

test('artifact output and input budgets adapt to small model windows', async () => {
  const selected = { provider: 'configured', model: 'small' }
  const controller = new AbortController()
  const llm = { async resolveModelInfo(provider, model, signal) {
    assert.equal(provider, selected.provider)
    assert.equal(model, selected.model)
    assert.equal(signal, controller.signal)
    return { context: { contextWindow: 8192 }, defaultMaxTokens: 4096 }
  } }
  assert.deepEqual(await resolveArtifactBudget(llm, selected, 32768, controller.signal), {
    maxTokens: 2048, inputTokenBudget: 5120, contextWindow: 8192,
  })
  assert.deepEqual(await resolveArtifactBudget({ resolveModelInfo: async () => ({ context: { contextWindow: 512 } }) }, selected, 1000), {
    maxTokens: 128, inputTokenBudget: 320, contextWindow: 512,
  })
})

test('unknown capacity preserves configured allowance while respecting route output preference', async () => {
  assert.deepEqual(await resolveArtifactBudget({}, { provider: 'p', model: 'm' }, 8192), {
    maxTokens: 8192, inputTokenBudget: null, contextWindow: null,
  })
  assert.deepEqual(await resolveArtifactBudget({ resolveModelInfo: async () => ({ defaultMaxTokens: 4096 }) }, {}, 8192), {
    maxTokens: 4096, inputTokenBudget: null, contextWindow: null,
  })
  assert.equal((await resolveArtifactBudget({ resolveModelInfo: async () => ({ defaultMaxTokens: 16384 }) }, {}, 8192)).maxTokens, 8192)
})

test('model metadata failures and cancellation cannot silently disable budgeting', async () => {
  const failure = new Error('provider catalog unavailable')
  await assert.rejects(resolveArtifactBudget({ resolveModelInfo: async () => { throw failure } }, {}, 8192), error => error === failure)
  const controller = new AbortController()
  controller.abort(new Error('cancelled by user'))
  let called = false
  await assert.rejects(resolveArtifactBudget({ resolveModelInfo() { called = true } }, {}, 8192, controller.signal), /cancelled by user/)
  assert.equal(called, false)
  await assert.rejects(resolveArtifactBudget({ resolveModelInfo: async () => ({ context: { contextWindow: 1 } }) }, {}, 8192), { code: 'notebook/context-budget' })
})

test('long Chinese evidence fits byte budget without truncating instructions or citations', () => {
  const notebook = { title: '并发学习', instructions: '必须保留这条完整要求：说明关键前提与例外。' }
  const request = '对比两份资料中的取消处理；保留引用，不省略请求结尾：结束标记。'
  const originals = [
    { sourceId: 'source-one', title: '来源一', text: '取消需要传播，清理使用 finally。😀'.repeat(120) },
    { sourceId: 'source-two', title: '来源二', text: '超时转换具有上下文边界，不能吞掉取消异常。'.repeat(120) },
  ]
  const untouched = structuredClone(originals)
  const build = passages => studioPrompt('briefing', notebook, passages, request,
    passages.map(p => ({ sourceId: p.sourceId, title: p.title, excerptChars: p.text.length })))
  const result = fitArtifactPrompt(build, originals, 3600)
  assert.ok(result.estimatedTokens <= 3600 - 180)
  assert.equal(result.estimatedTokens, Buffer.byteLength(result.prompt, 'utf8'))
  assert.ok(result.prompt.includes(notebook.instructions))
  assert.ok(result.prompt.includes(request))
  assert.deepEqual(result.passages.map(p => p.sourceId), ['source-one', 'source-two'])
  for (const passage of result.passages) {
    assert.ok(originals.find(p => p.sourceId === passage.sourceId).text.startsWith(passage.text))
    assert.ok(passage.text.length > 0)
    assert.ok(!passage.text.includes('\uFFFD'))
    assert.ok(result.prompt.includes('sourceId=' + passage.sourceId))
  }
  assert.deepEqual(originals, untouched)
})

test('evidence allowances are balanced per source rather than per chunk', () => {
  const input = [
    { sourceId: 'one', text: 'a'.repeat(3000) },
    { sourceId: 'one', text: 'b'.repeat(3000) },
    { sourceId: 'two', text: 'c'.repeat(3000) },
  ]
  const result = fitArtifactPrompt(p => JSON.stringify(p), input, 1800)
  const one = result.passages.filter(p => p.sourceId === 'one').reduce((sum, p) => sum + p.text.length, 0)
  const two = result.passages.find(p => p.sourceId === 'two').text.length
  assert.ok(Math.abs(one - two) <= 1)
  assert.ok(result.estimatedTokens <= 1710)
})

test('fixed request overflow and insufficient evidence space fail before a model call', () => {
  const passages = [{ sourceId: 'one', text: 'evidence'.repeat(100) }]
  assert.throws(() => fitArtifactPrompt(p => '完整要求'.repeat(1000) + JSON.stringify(p), passages, 1000), error => error.code === 'notebook/context-budget' && /原始要求不会被截断/.test(error.message))
  assert.throws(() => fitArtifactPrompt(p => 'fixed' + JSON.stringify(p), passages, 100), error => error.code === 'notebook/context-budget' && /减少本次选中的来源/.test(error.message))
  assert.throws(() => fitArtifactPrompt(p => JSON.stringify(p), [], 1000), /没有可用于生成的正文片段/)
})

test('unknown capacity and already fitting prompts retain complete evidence', () => {
  const input = [{ sourceId: 'one', text: 'First short source' }, { sourceId: 'two', text: 'Second short source' }]
  const build = p => 'Full request\n' + JSON.stringify(p)
  for (const budget of [null, 1000]) {
    const result = fitArtifactPrompt(build, input, budget)
    assert.equal(result.prompt, build(input))
    assert.deepEqual(result.passages, input)
    assert.notEqual(result.passages, input)
    assert.notEqual(result.passages[0], input[0])
  }
})
