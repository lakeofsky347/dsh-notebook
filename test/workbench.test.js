import assert from 'node:assert/strict'
import test from 'node:test'
import { openLibrary } from '../src/library.js'
import { createWorkbench } from '../src/workbench.js'

const limits = { maxNotebooks: 20, maxSourcesPerNotebook: 20, maxWordsPerSource: 10000, maxUploadBytes: 100000, chunkChars: 100, chunkOverlap: 10, topK: 3 }
const route = { provider: 'mock', model: 'first' }
const tick = () => new Promise(resolve => setImmediate(resolve))

async function settled(runtime, id) {
  const deadline = Date.now() + 2000
  while (runtime.task(id)?.status === 'running' && Date.now() < deadline) await tick()
  const task = runtime.task(id)
  assert.notEqual(task?.status, 'running', 'native turn should settle')
  return task
}

function host({ persistence = false, modern = true, run } = {}) {
  const listeners = new Map()
  const logs = new Map()
  const agents = new Map()
  const calls = { create: 0, resume: 0, disposed: [], cancelled: [], routes: [], setups: [] }
  const emit = (name, ...args) => { for (const handler of [...listeners.get(name) ?? []]) handler(...args) }
  const waterfall = (name, payload, value) => {
    const handlers = [...listeners.get(name) ?? []]
    const next = index => index < handlers.length ? handlers[index](payload, () => next(index + 1)) : Promise.resolve(value)
    return next(0)
  }
  const backend = {
    async open(id, access) {
      assert.equal(access, 'read')
      assert.ok(logs.has(id))
      return { async read() { return { events: [...logs.get(id)] } }, async close() {} }
    },
  }
  const ctx = {
    get(name) { return name === 'sessionPersistence' && persistence ? backend : undefined },
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(handler)
      return () => listeners.get(name).delete(handler)
    },
    agents: {
      get(id) { return agents.get(id) },
      async create(options) {
        calls.create += 1
        if (!logs.has(options.sessionId)) logs.set(options.sessionId, [])
        return create(options.sessionId, options)
      },
      async resume(options) {
        calls.resume += 1
        if (!logs.has(options.resumeSessionId)) {
          const error = new Error('not found')
          error.name = 'SessionPersistenceNotFoundError'
          throw error
        }
        return create(options.resumeSessionId, options)
      },
    },
  }
  async function create(id, options) {
    options.signal?.throwIfAborted()
    const prior = logs.get(id)
    let turn = Math.max(0, ...prior.map(event => event.data?.turn ?? 0))
    let activity = Promise.resolve()
    let controller
    let selected = { ...options.agentOptions }
    const agent = {
      id, options: options.agentOptions, ctx: {}, status: 'idle',
      ...(modern ? { model: { select(value) { selected = { ...value } } } } : {}),
      followup(message) {
        assert.equal(agent.status, 'idle')
        controller = new AbortController()
        agent.status = 'running'
        turn += 1
        const event = (type, data) => {
          const result = { type, data, seq: prior.length, time: Date.now() }
          prior.push(result)
          emit('session/event', { id }, result)
          return result
        }
        const step = async number => {
          const decision = await waterfall('agent/pre-step', { agent, turn, step: number, signal: controller.signal }, { kind: 'enter', messages: [message] })
          if (controller.signal.aborted || decision.kind !== 'enter') return false
          const resolved = await waterfall('agent/request', { agent, turn, step: number, signal: controller.signal }, selected)
          calls.routes.push(resolved)
          return true
        }
        const frame = value => emit('agent/assistant-stream', { agent, frame: value })
        const answer = (text, number = 1) => {
          const attemptId = id + ':' + turn + ':' + number
          frame({ type: 'start', attemptId, revision: turn, turn, step: number })
          frame({ type: 'chunk', attemptId, revision: turn, index: 0, time: Date.now(), chunk: { type: 'text-delta', index: 0, text } })
          const committed = event('assistant/message', { turn, step: number, message: { id: 'assistant-' + attemptId, role: 'assistant', source: { kind: 'model', provider: selected.provider, model: selected.model }, content: [{ type: 'text', text }] } })
          frame({ type: 'end', attemptId, revision: turn, index: 1, outcome: { kind: 'committed', eventType: 'assistant/message', seq: committed.seq } })
        }
        activity = Promise.resolve().then(async () => {
          try {
            if (!await step(1)) return
            event('user/message', message)
            if (run) await run({ agent, message, turn, signal: controller.signal, event, frame, step, answer })
            else answer('工作台中的实际模型回复')
          } catch (error) {
            emit('agent/error', { agent, error })
          } finally {
            event('turn/end', { turn, reason: controller.signal.aborted ? { kind: 'aborted', reason: controller.signal.reason } : { kind: 'completed' } })
            agent.status = 'idle'
          }
        })
      },
      whenIdle() { return activity },
      cancel(cause) { calls.cancelled.push({ id, cause }); controller?.abort(cause) },
    }
    await options.setup?.(agent.ctx, agent)
    agents.set(id, agent)
    calls.setups.push(id)
    emit('agent/created', { agent })
    return { agent, async dispose() { calls.disposed.push(id); agents.delete(id); emit('agent/disposed', { agent }) } }
  }
  return { ctx, calls, logs, emit, listeners }
}

function fixture(t, hostOptions, runtimeOptions = {}) {
  const library = openLibrary(':memory:', limits)
  const native = host(hostOptions)
  const workspace = library.createWorkspace({ ...route })
  const options = { resolveRoute: async value => value ?? route, ...runtimeOptions }
  const runtime = createWorkbench(native.ctx, library, options)
  t.after(async () => { await runtime.dispose(); library.close() })
  return { library, native, workspace, options, runtime }
}

test('native stream settles into one assistant row and reuses its owned Agent', async t => {
  const f = fixture(t)
  const setupIds = []
  const runtime = createWorkbench(f.native.ctx, f.library, { ...f.options, setupAgent(_ctx, agent, id) { setupIds.push(id); assert.equal(runtime.workspaceForAgent(agent.id), id) } })
  t.after(() => runtime.dispose())
  const task = await runtime.start(f.workspace.id, '为我建一个笔记本', route, 'research')
  assert.equal(task.status, 'running')
  assert.equal((await settled(runtime, f.workspace.id)).status, 'done')
  const rows = f.library.listMessages(f.workspace.id)
  assert.deepEqual(rows.map(row => [row.role, row.status]), [['user', 'done'], ['assistant', 'done']])
  assert.equal(rows[1].text, '工作台中的实际模型回复')
  assert.ok(rows[1].metadata.nativeMessageId)
  await runtime.start(f.workspace.id, '继续', { provider: 'mock', model: 'second' }, 'sources')
  assert.equal((await settled(runtime, f.workspace.id)).status, 'done')
  assert.equal(f.native.calls.create, 1)
  assert.equal(setupIds.length, 2)
  assert.equal(f.library.getWorkspace(f.workspace.id).mode, 'sources')
})

test('native context injections stay in native history and research instructions stay out of the UI projection', async t => {
  const f = fixture(t, { run: async ({ message, event, answer }) => {
    assert.equal(message.content[0].text, 'Internal workflow instructions\nResearch copper')
    event('user/message', { id: 'time-context', role: 'user', source: { kind: 'time-context', form: 'snapshot' }, content: [{ type: 'text', text: '<system-reminder>clock and settings</system-reminder>' }] })
    event('user/message', { id: 'runtime-context', role: 'user', source: { kind: 'runtime-context', form: 'snapshot' }, content: [{ type: 'text', text: 'non-user input' }] })
    answer('Saved evidence')
  } })
  await f.runtime.start(f.workspace.id, 'Internal workflow instructions\nResearch copper', route, 'research', { displayText: 'Research copper' })
  await settled(f.runtime, f.workspace.id)
  const rows = f.library.listMessages(f.workspace.id)
  assert.deepEqual(rows.map(row => [row.role, row.text]), [['user', 'Research copper'], ['assistant', 'Saved evidence']])
  assert.deepEqual(rows[0].content, [{ type: 'text', text: 'Research copper' }])
  assert.equal(rows[0].metadata.displayText, 'Research copper')
  assert.equal(f.native.logs.get(f.workspace.id).filter(event => event.type === 'user/message').length, 3)
})

test('tool call/result update one progress row and preserve native correlation', async t => {
  let changed = 0
  const f = fixture(t, { run: async ({ turn, event, step, answer }) => {
    event('tool/call', { turn, step: 1, callId: 'collect-1', name: 'notebook_add_source', arguments: '{"url":"https://example.org/paper"}' })
    event('tool/result', { turn, step: 1, message: { id: 'result-1', role: 'tool', toolCallId: 'collect-1', content: [{ type: 'text', text: 'source saved' }], isError: false } })
    if (await step(2)) answer('已保存来源', 2)
  } }, { onNotebookChange() { changed += 1 } })
  await f.runtime.start(f.workspace.id, '搜集资料')
  assert.equal((await settled(f.runtime, f.workspace.id)).steps, 2)
  const tools = f.library.listMessages(f.workspace.id).filter(row => row.role === 'tool')
  assert.equal(tools.length, 1)
  assert.equal(tools[0].status, 'done')
  assert.equal(tools[0].text, 'source saved')
  assert.equal(tools[0].toolName, 'notebook_add_source')
  assert.equal(tools[0].metadata.callId, 'collect-1')
  assert.equal(changed, 1)
})

test('rc.5 request waterfall changes model between turns without retaining old reasoning effort', async t => {
  const f = fixture(t, { modern: false }, { maxTokens: 777 })
  await f.runtime.start(f.workspace.id, 'first', { ...route, reasoningEffort: 'high' })
  await settled(f.runtime, f.workspace.id)
  await f.runtime.start(f.workspace.id, 'second', { provider: 'mock', model: 'second' })
  await settled(f.runtime, f.workspace.id)
  assert.deepEqual(f.native.calls.routes.map(value => [value.model, value.reasoningEffort, value.maxTokens]), [['first', 'high', 777], ['second', undefined, 777]])
  assert.equal(f.native.calls.create, 1)
})

test('prepare creates a native owner without creating task or conversational messages', async t => {
  const f = fixture(t, { persistence: true })
  const agent = await f.runtime.prepare(f.workspace.id, route)
  assert.equal(agent.id, f.workspace.id)
  assert.equal(f.runtime.task(f.workspace.id), null)
  assert.deepEqual(f.library.listMessages(f.workspace.id), [])
  assert.equal(await f.runtime.prepare(f.workspace.id, route), agent)
  assert.equal(f.native.calls.create, 1)
  await f.runtime.start(f.workspace.id, '现在开始')
  assert.equal((await settled(f.runtime, f.workspace.id)).status, 'done')
  assert.equal(f.native.calls.create, 1)
})

test('cancel during native preparation prevents a later task or message from starting', async t => {
  let entered, release
  const preparing = new Promise(resolve => { entered = resolve })
  const blocked = new Promise(resolve => { release = resolve })
  const f = fixture(t, {}, { async setupAgent() { entered(); await blocked } })
  const pending = f.runtime.prepare(f.workspace.id, route)
  await preparing
  f.runtime.cancel(f.workspace.id)
  release()
  await assert.rejects(pending, /已停止/)
  assert.equal(f.runtime.task(f.workspace.id), null)
  assert.deepEqual(f.library.listMessages(f.workspace.id), [])
})

test('route validation and concurrent start reservations reject before native creation', async t => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const f = fixture(t, {}, { resolveRoute: () => pending })
  await assert.rejects(f.runtime.start('unknown', 'text'), /workspace not found/)
  await assert.rejects(f.runtime.start(f.workspace.id, ' '), /请输入/)
  const first = f.runtime.start(f.workspace.id, 'question')
  await assert.rejects(f.runtime.start(f.workspace.id, 'other'), /正在运行/)
  await assert.rejects(f.runtime.prepare(f.workspace.id), /正在运行/)
  resolve(route)
  await first
  await settled(f.runtime, f.workspace.id)
  assert.equal(f.native.calls.create, 1)
})

test('stop cancels the owned native turn and retains an interrupted stream prefix', async t => {
  const f = fixture(t, { run: async ({ agent, turn, frame, signal }) => {
    frame({ type: 'start', attemptId: 'partial', revision: 1, turn, step: 1 })
    frame({ type: 'chunk', attemptId: 'partial', revision: 1, index: 0, chunk: { type: 'text-delta', index: 0, text: '已经找到' } })
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    assert.equal(agent.id, f.workspace.id)
  } })
  await f.runtime.start(f.workspace.id, '搜集')
  while (!f.library.listMessages(f.workspace.id).some(row => row.status === 'streaming')) await tick()
  f.runtime.cancel(f.workspace.id)
  assert.equal((await settled(f.runtime, f.workspace.id)).status, 'cancelled')
  assert.equal(f.native.calls.cancelled[0].cause.kind, 'user')
  const row = f.library.listMessages(f.workspace.id).find(row => row.role === 'assistant')
  assert.equal(row.text, '已经找到')
  assert.equal(row.status, 'cancelled')
})

test('native turn timeout and step limit stop work and report distinct failures', async t => {
  const slow = fixture(t, { run: async ({ signal }) => { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) } }, { timeoutMs: 20 })
  await slow.runtime.start(slow.workspace.id, 'slow', route, 'sources')
  const timeout = await settled(slow.runtime, slow.workspace.id)
  assert.equal(timeout.status, 'failed')
  assert.match(timeout.error, /时间上限/)
  const bounded = fixture(t, { run: async ({ step }) => { assert.equal(await step(2), false) } }, { maxSteps: 1 })
  await bounded.runtime.start(bounded.workspace.id, 'loop', route, 'sources')
  const limit = await settled(bounded.runtime, bounded.workspace.id)
  assert.equal(limit.status, 'failed')
  assert.match(limit.error, /步骤上限/)
  assert.equal(limit.steps, 1)
})

test('free research uses its own time and step budgets without an automatic research record', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let entered, release
  const running = new Promise(resolve => { entered = resolve })
  const waiting = new Promise(resolve => { release = resolve })
  const f = fixture(t, { run: async ({ step, answer }) => {
    entered()
    await waiting
    assert.equal(await step(2), true)
    answer('Collected the requested resources', 2)
  } }, { timeoutMs: 10, maxSteps: 1, researchTimeoutMs: 100, researchMaxSteps: 3 })
  await f.runtime.start(f.workspace.id, '自由搜集资料', route, 'research')
  await running
  t.mock.timers.tick(60)
  assert.equal(f.runtime.task(f.workspace.id).status, 'running')
  release()
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'done')
  assert.equal(task.automaticResearch, false)
  assert.equal(task.steps, 2)
  assert.deepEqual(task.limits, { timeoutMs: 100, maxSteps: 3, finalizeTimeoutMs: 10 })
  assert.equal(f.native.calls.cancelled.length, 0)
})

test('automatic collection and guide receive independent deadlines', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let enteredCollection, releaseCollection, enteredGuide, releaseGuide
  const collecting = new Promise(resolve => { enteredCollection = resolve })
  const collectionWait = new Promise(resolve => { releaseCollection = resolve })
  const guiding = new Promise(resolve => { enteredGuide = resolve })
  const guideWait = new Promise(resolve => { releaseGuide = resolve })
  const progress = { status: 'running', completedSources: 0, targetSources: 1 }
  let guideSignal
  const f = fixture(t, { run: async ({ answer }) => {
    enteredCollection()
    await collectionWait
    progress.completedSources = 1
    answer('Saved source')
  } }, { timeoutMs: 10, researchTimeoutMs: 100, finalizeTimeoutMs: 100,
    researchState: () => progress,
    async finalize(_workspaceId, signal) { guideSignal = signal; enteredGuide(); await guideWait; signal.throwIfAborted() },
  })
  await f.runtime.start(f.workspace.id, '自动构建', route, 'research')
  await collecting
  t.mock.timers.tick(80)
  releaseCollection()
  await guiding
  t.mock.timers.tick(80)
  assert.equal(guideSignal.aborted, false)
  assert.equal(f.runtime.task(f.workspace.id).status, 'running')
  releaseGuide()
  assert.equal((await settled(f.runtime, f.workspace.id)).status, 'done')
  assert.equal(f.native.calls.cancelled.length, 0)
})

test('saved source target rejects the next native step before downstream maintenance', async t => {
  const progress = { status: 'running', completedSources: 0, targetSources: 1 }
  let finalizations = 0, downstreamSteps = 0
  const f = fixture(t, { run: async ({ step }) => {
    progress.completedSources = 1
    assert.equal(await step(2), false)
  } }, { researchState: () => progress, async finalize(_id, signal) { assert.equal(signal.aborted, false); finalizations += 1 } })
  f.native.ctx.on('agent/pre-step', async (_payload, next) => { downstreamSteps += 1; return next() })
  await f.runtime.start(f.workspace.id, 'Collect one source', route, 'research')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'done')
  assert.equal(task.error, '')
  assert.equal(task.collectionStop, 'target')
  assert.equal(task.steps, 1)
  assert.equal(downstreamSteps, 1)
  assert.equal(f.native.calls.routes.length, 1)
  assert.equal(finalizations, 1)
})

test('research step exhaustion still produces one partial guide without clearing the failure', async t => {
  const progress = { status: 'running', imported: [], reused: [], targetSources: 3 }
  let finalizations = 0
  const f = fixture(t, { run: async ({ step }) => {
    progress.imported.push({ sourceId: 'committed-source' })
    assert.equal(await step(2), false)
  } }, { researchState: () => progress, researchMaxSteps: 1,
    async finalize(_id, signal) { assert.equal(signal.aborted, false); finalizations += 1 },
  })
  await f.runtime.start(f.workspace.id, 'Collect three sources', route, 'research')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.equal(task.collectionStop, 'limit')
  assert.match(task.error, /步骤上限/)
  assert.equal(finalizations, 1)
  assert.equal(progress.imported.length, 1)
})

test('research timeout preserves saved evidence and gives its guide an un-aborted signal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const progress = { status: 'running', completedSources: 0, targetSources: 3 }
  let entered, finalizations = 0
  const collecting = new Promise(resolve => { entered = resolve })
  const f = fixture(t, { run: async ({ signal }) => {
    progress.completedSources = 1
    entered()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  } }, { researchState: () => progress, researchTimeoutMs: 100,
    async finalize(_id, signal) { assert.equal(signal.aborted, false); finalizations += 1 },
  })
  await f.runtime.start(f.workspace.id, 'Collect three sources', route, 'research')
  await collecting
  t.mock.timers.tick(100)
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.equal(task.collectionStop, 'timeout')
  assert.match(task.error, /时间上限/)
  assert.equal(finalizations, 1)
})

test('terminal context errors retain their diagnostic while saved sources receive a partial guide', async t => {
  const progress = { status: 'running', completedSources: 0, targetSources: 3 }
  let finalizations = 0
  const f = fixture(t, { run: async () => {
    progress.completedSources = 1
    throw new Error('maximum context length exceeded')
  } }, { researchState: () => progress, async finalize(_id, signal) { assert.equal(signal.aborted, false); finalizations += 1 } })
  await f.runtime.start(f.workspace.id, 'Collect sources', route, 'research')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.equal(task.collectionStop, 'error')
  assert.match(task.error, /maximum context length exceeded/)
  assert.equal(finalizations, 1)
  assert.equal(f.native.calls.create, 1, 'context failure must not silently replace the native session')
})

test('user cancellation wins over a just-reached collection deadline and does not start a guide', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const progress = { status: 'running', completedSources: 0, targetSources: 3 }
  let entered, finalizations = 0
  const collecting = new Promise(resolve => { entered = resolve })
  const f = fixture(t, { run: async ({ signal }) => {
    progress.completedSources = 1
    entered()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  } }, { researchState: () => progress, researchTimeoutMs: 100, async finalize() { finalizations += 1 } })
  await f.runtime.start(f.workspace.id, 'Collect sources', route, 'research')
  await collecting
  t.mock.timers.tick(100)
  f.runtime.cancel(f.workspace.id)
  assert.equal((await settled(f.runtime, f.workspace.id)).status, 'cancelled')
  assert.equal(finalizations, 0)
  assert.equal(progress.completedSources, 1)
})

test('automatic research with no saved sources fails without generating a guide', async t => {
  let finalizations = 0
  const f = fixture(t, {}, { researchState: () => ({ status: 'running', completedSources: 0, targetSources: 3 }), async finalize() { finalizations += 1 } })
  await f.runtime.start(f.workspace.id, 'Collect sources', route, 'research')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.match(task.error, /未保存.*来源/)
  assert.equal(finalizations, 0)
})

test('cancelling or timing out the independent guide aborts its signal', async t => {
  for (const scenario of ['cancel', 'timeout']) await t.test(scenario, async subtest => {
    subtest.mock.timers.enable({ apis: ['setTimeout'] })
    const progress = { status: 'running', completedSources: 0, targetSources: 1 }
    let entered, guideSignal
    const guiding = new Promise(resolve => { entered = resolve })
    const f = fixture(subtest, { run: async () => { progress.completedSources = 1 } }, {
      researchState: () => progress, finalizeTimeoutMs: 100,
      async finalize(_id, signal) {
        guideSignal = signal
        entered()
        await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      },
    })
    await f.runtime.start(f.workspace.id, 'Collect sources', route, 'research')
    await guiding
    if (scenario === 'cancel') f.runtime.cancel(f.workspace.id)
    else subtest.mock.timers.tick(100)
    const task = await settled(f.runtime, f.workspace.id)
    assert.equal(guideSignal.aborted, true)
    assert.equal(task.status, scenario === 'cancel' ? 'cancelled' : 'failed')
    if (scenario === 'timeout') assert.match(task.error, /导读.*时间上限/)
    assert.equal(progress.completedSources, 1)
  })
})

test('projection failure with saved sources does not start another model call for a guide', async t => {
  const progress = { status: 'running', completedSources: 0, targetSources: 3 }
  let finalizations = 0
  const f = fixture(t, { run: async ({ event, message }) => {
    progress.completedSources = 1
    const update = f.library.updateMessage
    f.library.updateMessage = () => { throw new Error('disk write failed') }
    event('user/message', message)
    f.library.updateMessage = update
  } }, { researchState: () => progress, async finalize() { finalizations += 1 } })
  await f.runtime.start(f.workspace.id, 'Collect sources', route, 'research')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.match(task.error, /记录失败.*disk write failed/)
  assert.equal(finalizations, 0)
})

test('disposing automatic research keeps its committed sources without starting a guide', async t => {
  const progress = { status: 'running', completedSources: 0, targetSources: 3 }
  let entered, finalizations = 0
  const collecting = new Promise(resolve => { entered = resolve })
  const f = fixture(t, { run: async ({ signal }) => {
    progress.completedSources = 1
    entered()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  } }, { researchState: () => progress, async finalize() { finalizations += 1 } })
  await f.runtime.start(f.workspace.id, 'Collect sources', route, 'research')
  await collecting
  await f.runtime.dispose()
  assert.equal(f.runtime.task(f.workspace.id).status, 'cancelled')
  assert.equal(finalizations, 0)
  assert.equal(progress.completedSources, 1)
})

test('target completion also succeeds when the native idle waiter rejects hook cancellation', async t => {
  const progress = { status: 'running', completedSources: 0, targetSources: 1 }
  let finalizations = 0
  const f = fixture(t, { run: async ({ step }) => {
    progress.completedSources = 1
    await step(2)
  } }, {
    researchState: () => progress,
    setupAgent(_ctx, agent) {
      const whenIdle = agent.whenIdle
      agent.whenIdle = async () => { await whenIdle(); throw new Error('native waiter was aborted by hook') }
    },
    async finalize(_id, signal) { assert.equal(signal.aborted, false); finalizations += 1 },
  })
  await f.runtime.start(f.workspace.id, 'Collect a source', route, 'research')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'done')
  assert.equal(task.collectionStop, 'target')
  assert.equal(task.error, '')
  assert.equal(finalizations, 1)
})

test('native Agent errors fail the task instead of claiming a completed answer', async t => {
  const f = fixture(t, { run: async () => { throw new Error('provider request failed') } })
  await f.runtime.start(f.workspace.id, 'question')
  const task = await settled(f.runtime, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.equal(task.error, 'provider request failed')
  assert.equal(f.library.listMessages(f.workspace.id).filter(row => row.role === 'assistant').length, 0)
})

test('resume uses native history and idempotently repairs missed SQLite projection', async t => {
  const f = fixture(t, { persistence: true })
  const id = f.workspace.id
  f.library.appendMessage(id, { role: 'assistant', text: 'old prefix', status: 'streaming', metadata: { nativeSessionId: id, attemptId: 'old-attempt', turn: 1, step: 1 } })
  f.native.logs.set(id, [
    { seq: 0, type: 'user/message', data: { id: 'old-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'old question' }] } },
    { seq: 1, type: 'assistant/message', data: { turn: 1, step: 1, message: { id: 'old-answer', role: 'assistant', source: { provider: 'mock', model: 'first' }, content: [{ type: 'text', text: 'old completed answer' }] } } },
  ])
  await f.runtime.start(id, 'continue')
  assert.equal((await settled(f.runtime, id)).status, 'done')
  const rows = f.library.listMessages(id)
  assert.equal(rows.length, 4)
  assert.equal(rows.filter(row => row.metadata.nativeMessageId === 'old-answer').length, 1)
  assert.equal(rows[0].text, 'old completed answer')
  assert.equal(rows[0].status, 'done')
  assert.equal(f.native.calls.create, 0)
  assert.equal(f.native.calls.resume, 1)
  // Duplicate native delivery is harmless even after the stream has settled.
  const event = f.native.logs.get(id).find(value => value.type === 'assistant/message')
  f.native.emit('session/event', { id }, event)
  assert.equal(f.library.listMessages(id).length, 4)
})

test('missing or corrupt native history never silently starts an empty replacement conversation', async t => {
  const f = fixture(t, { persistence: true })
  f.library.appendMessage(f.workspace.id, { role: 'user', text: 'past', metadata: { nativeMessageId: 'past-user' } })
  await f.runtime.start(f.workspace.id, 'continue')
  const missing = await settled(f.runtime, f.workspace.id)
  assert.equal(missing.status, 'failed')
  assert.match(missing.error, /日志已缺失/)
  assert.equal(f.native.calls.create, 0)

  const fresh = f.library.createWorkspace(route)
  f.native.ctx.agents.resume = async () => { const error = new Error('corrupt stored bytes'); error.name = 'SessionPersistenceCorruptionError'; throw error }
  await f.runtime.start(fresh.id, 'do not reset')
  const corrupt = await settled(f.runtime, fresh.id)
  assert.equal(corrupt.status, 'failed')
  assert.match(corrupt.error, /corrupt/)
  assert.equal(f.native.calls.create, 0)
})

test('without native persistence a reopened workspace clearly refuses false history recovery', async t => {
  const f = fixture(t)
  await f.runtime.start(f.workspace.id, 'first')
  await settled(f.runtime, f.workspace.id)
  await f.runtime.dispose()
  const reopened = createWorkbench(f.native.ctx, f.library, f.options)
  t.after(() => reopened.dispose())
  await reopened.start(f.workspace.id, 'resume')
  const task = await settled(reopened, f.workspace.id)
  assert.equal(task.status, 'failed')
  assert.match(task.error, /未启用会话持久化/)
  assert.equal(f.native.calls.create, 1)
})

test('dispose releases only owned Agents and all subscriptions', async t => {
  const f = fixture(t)
  const unrelated = await f.native.ctx.agents.create({ sessionId: 'unrelated', agentOptions: route })
  await f.runtime.prepare(f.workspace.id)
  await f.runtime.dispose()
  assert.deepEqual(f.native.calls.disposed, [f.workspace.id])
  assert.equal(unrelated.agent.status, 'idle')
  assert.equal(f.runtime.workspaceForAgent(f.workspace.id), null)
  assert.ok([...f.native.listeners.values()].every(value => value.size === 0))
  await assert.rejects(f.runtime.start(f.workspace.id, 'later'), /已关闭/)
})

test('dispose aborts an active native turn before releasing its handle', async t => {
  const f = fixture(t, { run: async ({ signal }) => { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) } })
  await f.runtime.start(f.workspace.id, 'long running research')
  while (!f.library.listMessages(f.workspace.id).length) await tick()
  await f.runtime.dispose()
  assert.equal(f.runtime.task(f.workspace.id).status, 'cancelled')
  assert.deepEqual(f.native.calls.disposed, [f.workspace.id])
  assert.equal(f.native.calls.cancelled[0].cause.kind, 'disposed')
})
