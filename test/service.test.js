import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { applyNotebook } from '../src/service.js'

function fixture(t, overrides = {}, transport = 'legacy') {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-service-'))
  const definitions = new Map()
  const sections = new Map()
  const listeners = new Map()
  const agents = new Map()
  const restrictions = new Map()
  const effects = []
  const jobs = new Map()
  const state = {
    web: true,
    webHandlers: {},
    selection: { provider: 'p', model: 'm' },
    providers: [{ id: 'p', name: 'Provider P' }, { id: 'q', name: 'Provider Q' }],
    models: { p: [{ id: 'm', name: 'Model M' }], q: [{ id: 'n', name: 'Model N' }] },
    modelErrors: {},
    frames: [{ type: 'text-delta', text: 'Saved report' }, { type: 'finish', reason: { kind: 'stop' } }],
    requests: [],
    nativeCreates: [],
    nativeResumes: [],
    sessionLogs: new Map(),
    route: null,
  }
  async function emit(name, ...args) {
    for (const handler of [...(listeners.get(name) ?? [])]) await handler(...args)
  }
  let eventSequence = 0
  function makeAgent(id, route = state.selection, native = false) {
    let selected = { ...route }
    let idle = Promise.resolve()
    const events = state.sessionLogs.get(id) ?? []
    state.sessionLogs.set(id, events)
    const agent = {
      id,
      session: { id, events, append(type, data) { events.push({ type, data, seq: ++eventSequence }) } },
      options: { ...selected },
      model: { current: () => ({ ...selected }), select: value => { selected = { ...value } } },
      ctx: { get(name) { return name === 'toolResultPruner' ? state.pruner : undefined }, tools: { restrict: ({ allow }) => {
        const value = [...allow]
        restrictions.set(id, value)
        return () => { if (restrictions.get(id) === value) restrictions.delete(id) }
      } } },
      received: [],
      followup(message) {
        agent.received.push(message)
        if (native) idle = Promise.resolve().then(async () => {
          await emit('session/event', { id }, { type: 'user/message', seq: ++eventSequence, data: message })
          const reply = await state.nativeFollowup?.({
            agent, message,
            async callTool(name, args = {}) {
              const definition = definitions.get(name) || (state.webHandlers[name] ? { execute: state.webHandlers[name] } : null)
              assert.ok(definition, 'registered native tool ' + name)
              const callId = randomUUID()
              await emit('session/event', { id }, { type: 'tool/call', seq: ++eventSequence, data: {
                callId, name, arguments: JSON.stringify(args), turn: 1, step: 1,
              } })
              const signal = new AbortController().signal
              const result = await definition.execute(args, { agent, signal })
              await emit('tools/result', { name, arguments: args, agent, signal, token: Symbol(name), callId }, { isError: result.ok === false, value: result })
              await emit('session/event', { id }, { type: 'tool/result', seq: ++eventSequence, data: { turn: 1, step: 1, message: {
                id: randomUUID(), role: 'tool', toolCallId: callId, isError: result.ok === false,
                content: [{ type: 'text', text: JSON.stringify(result) }],
              } } })
              return result
            },
          })
          await emit('session/event', { id }, { type: 'assistant/message', seq: ++eventSequence, data: {
            turn: 1, step: 1, message: { id: randomUUID(), role: 'assistant', source: selected, content: [{ type: 'text', text: reply ?? 'Native test reply' }] },
          } })
          await emit('session/event', { id }, { type: 'turn/end', seq: ++eventSequence, data: { reason: { kind: 'stop' } } })
        })
      },
      whenIdle: () => idle,
      cancel() {},
    }
    return agent
  }
  agents.set('host-session', makeAgent('host-session'))
  const ctx = {
    effect(run) { const dispose = run(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
    on(name, handler) {
      const handlers = listeners.get(name) ?? []
      handlers.push(handler)
      listeners.set(name, handlers)
      return () => { const index = handlers.indexOf(handler); if (index >= 0) handlers.splice(index, 1) }
    },
    get(name) {
      if (name === 'agentDefaultModel') return { currentSelection: () => state.selection }
      if (name === 'web') return state.webService
      if (name === 'agentPresets') return state.presets
      if (name === 'sessionQuery') return state.sessionQuery
      if (name === 'sessionPersistence' && state.persistence) return {
        async open(id) { return { async read() { return { events: state.sessionLogs.get(id) ?? [] } }, async close() {} } },
      }
      return undefined
    },
    systemPrompt: {
      getSectionOrder: () => 100,
      section(definition) { sections.set(definition.name, definition); return () => sections.delete(definition.name) },
    },
    tools: {
      register(definition) { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) },
      definitions(scope) {
        const tools = [...definitions.values(), ...(state.web ? [{ name: 'web_search' }, { name: 'web_fetch' }] : []), ...(state.scopedDefinitions?.(scope) ?? [])]
        const allow = scope && restrictions.get(scope.id)
        return allow ? tools.filter(tool => allow.includes(tool.name)) : tools
      },
    },
    agents: {
      get: id => agents.get(id),
      async create(options) {
        state.nativeCreates.push(options.sessionId)
        const agent = makeAgent(options.sessionId, options.agentOptions, true)
        await options.setup?.(agent.ctx, agent)
        options.signal?.throwIfAborted()
        agents.set(agent.id, agent)
        await emit('agent/created', { agent })
        return { agent, async dispose() { await emit('agent/disposed', { agent }); agents.delete(agent.id) } }
      },
      async resume(options) {
        if (!state.sessionLogs.has(options.resumeSessionId)) {
          const error = new Error('session not found')
          error.name = 'SessionPersistenceNotFoundError'
          throw error
        }
        state.nativeResumes.push(options.resumeSessionId)
        const agent = makeAgent(options.resumeSessionId, options.agentOptions, true)
        await options.setup?.(agent.ctx, agent)
        options.signal?.throwIfAborted()
        agents.set(agent.id, agent)
        await emit('agent/created', { agent })
        return { agent, async dispose() { await emit('agent/disposed', { agent }); agents.delete(agent.id) } }
      },
    },
    llm: {
      async resolveModelInfo(provider, model) { return state.modelInfo ?? { provider, id: model } },
      listProviders: () => state.providers,
      async listModels(provider) { if (state.modelErrors[provider]) throw state.modelErrors[provider]; return state.models[provider] ?? [] },
      async *stream(request) {
        state.requests.push(request)
        if (state.stream) { yield* state.stream(request); return }
        for (const frame of typeof state.frames === 'function' ? state.frames(request) : state.frames) yield frame
      },
    },
    jobs: {
      start(definition) {
        const id = 'job-' + (jobs.size + 1)
        const handle = definition.run()
        const job = { id, definition, cancel: handle.cancel, done: handle.done }
        jobs.set(id, job)
        return id
      },
    },
    connection: {
      isAuthenticated(req) { if (req.authError) throw req.authError; return req.authenticated === true },
    },
    webServer: {
      register(route) { state.route = route; return () => { state.route = null } },
    },
  }
  if (transport === 'connection') ctx.connection = {
    fetch: { register(route) { state.sharedRoute = route; return () => { state.sharedRoute = null } } },
  }
  const service = applyNotebook(ctx, { dataDir: dir, maxUploadBytes: 1024, ...overrides }, {
    defineTool: definition => definition,
    createUserMessage: value => ({ ...value, id: randomUUID(), role: 'user' }),
  })
  let disposed = false
  async function dispose() {
    if (disposed) return
    disposed = true
    await Promise.allSettled([...jobs.values()].map(job => job.done))
    await service.dispose()
    for (const release of effects.reverse()) await release()
    listeners.clear()
    rmSync(dir, { recursive: true, force: true })
  }
  t.after(dispose)
  return {
    ...service, dir, ctx, state, jobs, agents, sections, restrictions, dispose,
    tool(name, args = {}, agentId = 'host-session') {
      const definition = definitions.get(name)
      assert.ok(definition, 'registered tool ' + name)
      return definition.execute(args, { agent: agents.get(agentId) })
    },
    async settledTask(workspaceId) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const task = service.runtime.task(workspaceId)
        if (task?.status !== 'running') return task
        await setImmediate()
      }
      assert.fail('native test task did not settle')
    },
    async preStep(agentId, text) {
      const payload = { agent: agents.get(agentId), signal: new AbortController().signal, turn: 1 }
      const decision = { kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text }] }] }
      const run = (listeners.get('agent/pre-step') ?? []).reduceRight((next, handler) => () => handler(payload, next), async () => decision)
      return run()
    },
    async http({ method = 'POST', authenticated = true, authError, body = { op: 'state' }, chunks } = {}) {
      const req = Readable.from(chunks ?? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))])
      Object.assign(req, { method, authenticated, authError })
      const res = {
        headersSent: false,
        writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true },
        end(payload) { this.body = JSON.parse(payload) },
      }
      try { await state.route.handler(req, res) } finally { req.destroy() }
      return res
    },
  }
}

async function workspaceWithNotebook(host, title = 'Workspace') {
  const created = await host.handle({ op: 'workspaceCreate', title })
  assert.equal(created.ok, true)
  const workspaceId = created.workspaceId
  const result = await host.handle({ op: 'create', workspaceId, title: title + ' notebook', bind: true })
  assert.equal(result.ok, true)
  return { workspaceId, notebookId: result.notebook.id }
}

function successfulWeb(host) {
  host.state.webHandlers.web_search = async () => ({ sources: [
    { title: 'Copper facts', url: 'https://example.org/copper', snippet: 'Summary is not source text' },
    { title: 'Conductivity', url: 'https://example.org/conductivity' },
  ], truncated: false })
  host.state.webHandlers.web_fetch = async ({ url }) => ({ url, statusCode: 200, body: { kind: 'text', content: 'Copper conducts electricity. Verified fetched body for ' + url }, truncated: false })
  host.state.frames = request => {
    const sourceId = request.messages[0].content[0].text.match(/sourceId=([^\s]+)/)?.[1]
    return [{ type: 'text-delta', text: 'Study the evidence [' + sourceId + ']. Then test your understanding.' }, { type: 'finish', reason: { kind: 'stop' } }]
  }
  host.state.nativeFollowup = async ({ callTool }) => {
    await callTool('web_search', { queries: ['copper facts', 'electrical conductivity'] })
    await callTool('web_fetch', { url: 'https://example.org/copper' })
    await callTool('web_fetch', { url: 'https://example.org/conductivity' })
    return 'Research finished.'
  }
}

function scopedPresets(host) {
  host.state.web = false
  const inventory = new Map([
    ['standard', ['web_search', 'web_fetch', 'bash', 'file_read']],
    ['saved-preset', ['web_search', 'web_fetch', 'bash']],
    ['no-web', ['bash']],
  ])
  const calls = { mounts: [], acquired: [], released: [] }
  const presets = {
    defaultId: 'standard',
    composedPreset: agentCtx => agentCtx.presetId,
    presetForSession: session => session.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset ?? null,
    async mount(agentCtx, id = this.defaultId) {
      calls.mounts.push(id)
      if (host.state.mountError) throw host.state.mountError
      agentCtx.presetId = id
      return { id }
    },
    async acquireScope(id = this.defaultId) {
      calls.acquired.push(id)
      return { key: { presetId: id }, async [Symbol.asyncDispose]() { calls.released.push(id) } }
    },
  }
  host.state.scopedDefinitions = scope => (inventory.get(scope?.ctx?.presetId ?? scope?.presetId) ?? []).map(name => ({ name }))
  host.state.presets = presets
  return { presets, inventory, calls }
}

test('preset-scoped web tools are detected before a workspace exists and mounted with a narrow allowlist', async t => {
  const host = fixture(t)
  const { calls } = scopedPresets(host)
  assert.equal(host.ctx.tools.definitions().some(tool => tool.name === 'web_search'), false)
  assert.deepEqual((await host.handle({ op: 'state' })).capabilities, { search: true, fetch: true })
  assert.deepEqual(calls.acquired, calls.released)
  const { workspaceId } = await host.handle({ op: 'workspaceCreate' })
  successfulWeb(host)
  const started = await host.handle({ op: 'researchStart', workspaceId, prompt: 'Copper', targetSources: 2 })
  assert.equal((await host.settledTask(workspaceId)).status, 'done')
  assert.equal(host.library.listSources(started.notebookId).length, 2)
  assert.deepEqual(calls.mounts, ['standard'])
  const allow = host.restrictions.get(workspaceId)
  assert.ok(allow.includes('web_search') && allow.includes('web_fetch'))
  assert.ok(allow.every(name => name.startsWith('notebook_') || ['web_search', 'web_fetch'].includes(name)))
  assert.equal(host.state.sessionLogs.get(workspaceId)[0].data.agentPreset, 'standard')
  await host.handle({ op: 'workspaceUpdate', workspaceId, mode: 'sources' })
  assert.equal(host.restrictions.get(workspaceId).includes('web_search'), false)
  // Capability discovery reports installed tools even when source Q&A masks
  // them for the current turn, so auto-build can be started again.
  assert.deepEqual((await host.handle({ op: 'state', workspaceId })).capabilities, { search: true, fetch: true })
  await host.handle({ op: 'researchStart', workspaceId, prompt: 'More copper', targetSources: 2 })
  await host.settledTask(workspaceId)
  assert.deepEqual(calls.mounts, ['standard'])
})

test('native resume mounts the preset replayed in the session before applying tool restrictions', async t => {
  const host = fixture(t)
  const { calls, presets } = scopedPresets(host)
  presets.defaultId = 'no-web'
  host.state.persistence = true
  const { workspaceId } = await host.handle({ op: 'workspaceCreate' })
  host.state.sessionLogs.set(workspaceId, [{ type: 'agent-preset/selected', data: { agentPreset: 'saved-preset' }, seq: 0 }])
  let observations = 0, released = 0
  host.state.sessionQuery = { async observeSession(id) {
    assert.equal(id, workspaceId)
    observations += 1
    return { projections: { values: { agentPreset: 'saved-preset' } }, [Symbol.dispose]() { released += 1 } }
  } }
  assert.deepEqual((await host.handle({ op: 'state', workspaceId })).capabilities, { search: true, fetch: true })
  successfulWeb(host)
  await host.handle({ op: 'researchStart', workspaceId, prompt: 'Copper', targetSources: 2 })
  await host.settledTask(workspaceId)
  assert.deepEqual(calls.mounts, ['saved-preset'])
  assert.deepEqual(host.state.nativeResumes, [workspaceId])
  assert.equal(host.state.nativeCreates.length, 0)
  assert.equal(host.state.sessionLogs.get(workspaceId).length, 1)
  assert.ok(host.restrictions.get(workspaceId).includes('web_search'))
  assert.equal(observations, 2)
  assert.equal(released, observations)
})

test('preset setup failure and restored preset without web tools leave no empty notebook', async t => {
  const host = fixture(t)
  scopedPresets(host)
  const { workspaceId } = await host.handle({ op: 'workspaceCreate' })
  host.state.mountError = new Error('preset failed to activate')
  await assert.rejects(host.handle({ op: 'researchStart', workspaceId, prompt: 'Copper' }), /preset failed/)
  assert.equal(host.library.listNotebooks().length, 0)
  assert.equal(host.library.binding('workbench:' + workspaceId), null)
  assert.equal(host.runtime.task(workspaceId), null)
  delete host.state.mountError
  host.state.persistence = true
  host.state.sessionLogs.set(workspaceId, [{ type: 'agent-preset/selected', data: { agentPreset: 'no-web' }, seq: 0 }])
  await assert.rejects(host.handle({ op: 'researchStart', workspaceId, prompt: 'Copper' }), /搜索/)
  assert.equal(host.library.listNotebooks().length, 0)
  assert.equal(host.runtime.task(workspaceId), null)
})

test('automatic research uses native web outcomes, saves real sources and delivers a cited study guide', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId: original } = await workspaceWithNotebook(host)
  successfulWeb(host)
  const started = await host.handle({ op: 'researchStart', workspaceId, prompt: 'Learn copper conductivity', targetSources: 2, title: 'Copper course', newNotebook: true })
  assert.equal(started.ok, true)
  assert.notEqual(started.notebookId, original)
  assert.equal((await host.settledTask(workspaceId)).status, 'done')
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.research.status, 'done')
  assert.equal(view.messages.find(row => row.role === 'user').text, 'Learn copper conductivity')
  assert.equal(view.sources.length, 2)
  assert.equal(view.research.queries.length, 2)
  assert.equal(view.sources.every(source => source.provenance.via === 'dsh-web-fetch'), true)
  assert.match(host.library.getSource(view.notebookId, view.sources[0].id).body, /Verified fetched body/)
  assert.doesNotMatch(host.library.getSource(view.notebookId, view.sources[0].id).body, /Summary is not/)
  assert.equal(host.library.getArtifact(view.research.artifactId).status, 'done')
  assert.match(host.library.getArtifact(view.research.artifactId).body, new RegExp(view.sources[0].id))
  assert.equal((await host.handle({ op: 'chat', workspaceId, mode: 'sources', text: 'Explain these sources' })).ok, true)
  await host.settledTask(workspaceId)
  assert.equal(host.restrictions.get(workspaceId).includes('web_search'), false)
})

test('automatic research preflight rejects missing web tools and unready authentication before creating a notebook', async t => {
  const host = fixture(t)
  const created = await host.handle({ op: 'workspaceCreate' })
  const input = { op: 'researchStart', workspaceId: created.workspaceId, prompt: 'Ocean research' }
  host.state.web = false
  await assert.rejects(host.handle(input), /搜索/)
  assert.equal(host.library.listNotebooks().length, 0)
  host.state.web = true
  host.state.webService = { searchReady: async () => false }
  await assert.rejects(host.handle(input), /认证/)
  assert.equal(host.library.listNotebooks().length, 0)
  await assert.rejects(host.handle({ ...input, targetSources: 13 }), /1–12/)
  assert.equal(host.state.nativeCreates.length, 0)
})

test('automatic research never equates a fluent answer with completed source collection', async t => {
  const host = fixture(t)
  const { workspaceId } = await workspaceWithNotebook(host)
  host.state.nativeFollowup = async () => 'All sources collected and notebook completed!'
  await host.handle({ op: 'researchStart', workspaceId, prompt: 'Collect evidence', targetSources: 1, newNotebook: false })
  await host.settledTask(workspaceId)
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.research.status, 'failed')
  assert.equal(view.sources.length, 0)
  assert.equal(view.artifacts.length, 0)
})

test('a failed or ungrounded study guide keeps saved sources but cannot report complete research', async t => {
  const host = fixture(t)
  const { workspaceId } = await workspaceWithNotebook(host)
  successfulWeb(host)
  host.state.frames = [{ type: 'text-delta', text: 'An uncited answer' }]
  await host.handle({ op: 'researchStart', workspaceId, prompt: 'Copper', targetSources: 2, newNotebook: false })
  await host.settledTask(workspaceId)
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.sources.length, 2)
  assert.equal(view.research.status, 'partial')
  assert.equal(view.research.artifactStatus, 'failed')
  assert.equal(host.library.getArtifact(view.research.artifactId).status, 'failed')
})

test('research reservations serialize competing starts and block notebook mutations during collection', async t => {
  const host = fixture(t)
  const { workspaceId } = await workspaceWithNotebook(host)
  let release
  const paused = new Promise(resolve => { release = resolve })
  host.state.nativeFollowup = () => paused
  const input = { op: 'researchStart', workspaceId, prompt: 'Collect copper', newNotebook: true }
  const starts = await Promise.allSettled([host.handle(input), host.handle(input)])
  assert.equal(starts.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(host.library.listNotebooks().length, 2)
  assert.equal((await host.handle({ op: 'create', workspaceId, title: 'Race', bind: true })).ok, false)
  assert.equal((await host.handle({ op: 'chat', workspaceId, text: 'A competing question' })).ok, false)
  const allowed = host.restrictions.get(workspaceId)
  assert.ok(allowed.includes('web_search'))
  assert.equal(allowed.includes('notebook_add_source'), false)
  await host.handle({ op: 'cancel', workspaceId })
  release('stopped')
  await host.settledTask(workspaceId)
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.research.status, 'cancelled')
})

test('cancelling during research guide generation settles the artifact and preserves collected sources', async t => {
  const host = fixture(t)
  const { workspaceId } = await workspaceWithNotebook(host)
  successfulWeb(host)
  let started
  const generating = new Promise(resolve => { started = resolve })
  host.state.stream = async function* (request) {
    started()
    await new Promise((resolve, reject) => {
      if (request.signal.aborted) { reject(request.signal.reason); return }
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    })
    yield { type: 'text-delta', text: 'This must never be saved' }
  }
  await host.handle({ op: 'researchStart', workspaceId, prompt: 'Copper', targetSources: 2, newNotebook: false })
  await generating
  await host.handle({ op: 'cancel', workspaceId })
  assert.equal((await host.settledTask(workspaceId)).status, 'cancelled')
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.research.status, 'cancelled')
  assert.equal(view.sources.length, 2)
  assert.equal(host.library.getArtifact(view.research.artifactId).status, 'failed')
  assert.equal(host.library.getArtifact(view.research.artifactId).body, '')
})

test('ordinary notebook_build rejects invalid requests without orphan workspaces and binds a successful run', async t => {
  const host = fixture(t)
  assert.equal((await host.tool('notebook_build', { prompt: ' ' })).ok, false)
  host.state.web = false
  assert.equal((await host.tool('notebook_build', { prompt: 'Copper' })).ok, false)
  assert.equal(host.library.listWorkspaces().length, 0)
  host.state.web = true
  successfulWeb(host)
  const started = await host.tool('notebook_build', { prompt: 'Copper', targetSources: 2 })
  assert.equal(started.ok, true)
  assert.equal(started.kind, 'background')
  await host.settledTask(started.workspaceId)
  const status = await host.tool('notebook_workbench_status', { workspaceId: started.workspaceId })
  assert.equal(status.research.status, 'done')
  assert.equal(host.library.binding('host-session'), started.notebookId)
})

test('workspaces can be created and managed without an active host conversation', async t => {
  const host = fixture(t)
  host.agents.clear()
  const created = await host.handle({ op: 'workspaceCreate', title: 'Independent' })
  assert.equal(created.ok, true)
  let view = await host.handle({ op: 'state', workspaceId: created.workspaceId })
  assert.equal(view.workspace.title, 'Independent')
  assert.equal(view.notebookId, null)
  assert.deepEqual(view.messages, [])
  assert.equal(view.task, null)
  assert.deepEqual(host.state.nativeCreates, [])
  const notebook = await host.handle({ op: 'create', workspaceId: created.workspaceId, title: 'Saved sources', bind: true })
  view = await host.handle({ op: 'state', workspaceId: created.workspaceId })
  assert.equal(view.notebookId, notebook.notebook.id)
  assert.equal(view.workspace.notebookId, notebook.notebook.id)
  assert.deepEqual(host.state.nativeCreates, [])
  const changed = await host.handle({ op: 'workspaceUpdate', workspaceId: created.workspaceId, provider: 'q', model: 'n', mode: 'sources', title: 'Updated' })
  assert.equal(changed.workspace.provider, 'q')
  assert.equal(changed.workspace.model, 'n')
  assert.equal(changed.workspace.mode, 'sources')
  assert.equal(changed.workspace.title, 'Updated')
})

test('source Q&A requires complete clickable citations and checks uncovered passages before claiming gaps', async t => {
  const host = fixture(t)
  const { workspaceId } = await workspaceWithNotebook(host)
  await host.runtime.prepare(workspaceId)
  host.library.updateWorkspace(workspaceId, { mode: 'sources' })
  const prompt = host.sections.get('notebook:management').text({ agent: host.agents.get(workspaceId) })
  assert.match(prompt, /每项有依据的事实后都必须写 \[sourceId\]/)
  assert.match(prompt, /真实来源的完整 ID/)
  assert.match(prompt, /不得缩短 ID、用编号或“同源”“同上”替代/)
  assert.match(prompt, /当前片段不足时先用 notebook_search 或 notebook_source 继续核查/)
  assert.match(prompt, /区分“当前片段未覆盖”与“整份资料不存在”/)
})

test('catalog exposes provider failures and state reflects actual web capabilities', async t => {
  const host = fixture(t)
  host.state.modelErrors.q = new Error('provider temporarily unavailable')
  const catalog = await host.handle({ op: 'catalog' })
  assert.equal(catalog.ok, true)
  assert.deepEqual(catalog.selectedRoute, { provider: 'p', model: 'm' })
  assert.deepEqual(catalog.providers[0].models, host.state.models.p)
  assert.deepEqual(catalog.providers[1].models, [])
  assert.match(catalog.providers[1].error, /temporarily unavailable/)
  assert.deepEqual((await host.handle({ op: 'state' })).capabilities, { search: true, fetch: true })
  host.state.web = false
  assert.deepEqual((await host.handle({ op: 'state' })).capabilities, { search: false, fetch: false })
})

test('route and unknown workspace errors reject mutations before jobs or messages start', async t => {
  const host = fixture(t)
  const { workspaceId } = await workspaceWithNotebook(host)
  await assert.rejects(host.handle({ op: 'workspaceUpdate', workspaceId, provider: 'missing', model: 'm' }), /提供方/)
  await assert.rejects(host.handle({ op: 'workspaceUpdate', workspaceId, provider: 'p', model: 'missing' }), /模型/)
  await assert.rejects(host.handle({ op: 'chat', workspaceId, text: 'research', provider: 'missing', model: 'm' }), /提供方/)
  assert.equal(host.library.getWorkspace(workspaceId).provider, '')
  assert.equal(host.library.listMessages(workspaceId).length, 0)
  assert.equal(host.jobs.size, 0)
  const before = host.library.listNotebooks().length
  for (const op of ['state', 'create', 'open', 'addText', 'generate', 'chat', 'studyOpen', 'studyGet', 'studyAnswer', 'studyRate', 'studyNext']) {
    const result = await host.handle({ op, workspaceId: 'missing', title: 'Must not be created', text: 'hello' })
    assert.equal(result.ok, false)
    assert.match(result.error, /workspace not found/)
  }
  assert.equal(host.library.listNotebooks().length, before)
  assert.equal((await host.handle({ op: 'chat', workspaceId, mode: 'sources', text: 'question' })).ok, false)
  await assert.rejects(host.handle(null), /request must be an object/)
})

test('ordinary tools and workspace API share the same saved source state', async t => {
  const host = fixture(t)
  const ordinary = await host.tool('notebook_create', { title: 'Shared', bind: true })
  assert.equal(ordinary.ok, true)
  const source = await host.tool('notebook_add_source', { kind: 'text', title: 'Copper', text: 'copper conducts electricity' })
  const created = await host.handle({ op: 'workspaceCreate' })
  const workspaceId = created.workspaceId
  assert.equal((await host.handle({ op: 'open', workspaceId, notebookId: ordinary.notebook.id })).ok, true)
  let view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.sources[0].id, source.source.id)
  await host.handle({ op: 'renameSource', workspaceId, id: source.source.id, title: 'Renamed copper' })
  assert.equal((await host.tool('notebook_source', { id: source.source.id })).source.title, 'Renamed copper')
  const file = join(host.dir, 'fixture.md')
  writeFileSync(file, 'tungsten remains strong')
  const imported = await host.tool('notebook_add_source', { kind: 'file', path: file })
  assert.equal(imported.ok, true)
  assert.equal((await host.tool('notebook_sources')).sources.length, 2)
  await host.tool('notebook_rename_source', { id: imported.source.id, title: 'Renamed file' })
  assert.equal((await host.handle({ op: 'source', workspaceId, id: imported.source.id })).source.title, 'Renamed file')
  const note = await host.tool('notebook_note', { title: 'Analysis', text: 'saved note about copper' })
  assert.equal((await host.handle({ op: 'source', workspaceId, id: note.note.id })).source.body, 'saved note about copper')
  await host.tool('notebook_delete_source', { id: source.source.id })
  view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.sources.some(row => row.id === source.source.id), false)
  const other = await host.tool('notebook_create', { title: 'Other', bind: true })
  assert.equal((await host.tool('notebook_sources')).sources.length, 0)
  assert.equal((await host.handle({ op: 'state', workspaceId })).notebookId, ordinary.notebook.id)
  await host.tool('notebook_open', { notebookId: ordinary.notebook.id })
  assert.equal((await host.tool('notebook_sources')).sources.length, 2)
  assert.notEqual(other.notebook.id, ordinary.notebook.id)
})

test('native workspace tools resolve the workbench binding and keep ordinary sessions independent', async t => {
  const host = fixture(t)
  const created = await host.handle({ op: 'workspaceCreate', title: 'Native' })
  const workspaceId = created.workspaceId
  assert.equal((await host.handle({ op: 'chat', workspaceId, text: 'Organize resources' })).ok, true)
  assert.equal((await host.settledTask(workspaceId)).status, 'done')
  const notebook = await host.tool('notebook_create', { title: 'Native saved notebook', bind: true }, workspaceId)
  assert.equal(notebook.ok, true)
  assert.equal(host.library.binding('workbench:' + workspaceId), notebook.notebook.id)
  assert.equal(host.library.binding(workspaceId), null)
  assert.equal(host.library.binding('host-session'), null)
  const saved = await host.tool('notebook_add_source', { kind: 'text', title: 'Native source', text: 'copper from saved native work' }, workspaceId)
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.notebookId, notebook.notebook.id)
  assert.equal(view.sources[0].id, saved.source.id)
  assert.equal(view.messages.some(row => row.text === 'Native test reply'), true)
  assert.equal(host.restrictions.get(workspaceId).includes('web_search'), true)
  assert.equal(host.restrictions.get(workspaceId).includes('notebook_research'), false)
})

test('ordinary research enriches its existing target through native tools and exposes saved results', async t => {
  const host = fixture(t)
  const initial = await host.tool('notebook_create', { title: 'Initial host notebook', bind: true })
  assert.equal(host.restrictions.get('host-session').includes('notebook_research'), true)
  const file = join(host.dir, 'collected-resource.md')
  writeFileSync(file, 'Copper conducts electricity. This text is an actual saved resource.')
  let turns = 0
  const finalNotebookId = initial.notebook.id
  const actualCalls = []
  const researchPermissions = []
  const sourcePermissions = []
  host.state.nativeFollowup = async ({ agent, message, callTool }) => {
    turns += 1
    if (turns === 1) {
      researchPermissions.push(...host.restrictions.get(agent.id))
      const management = host.sections.get('notebook:management').text({ agent })
      assert.ok(management.includes(finalNotebookId))
      assert.ok(management.includes(initial.notebook.title))
      assert.ok(message.content[0].text.includes(finalNotebookId))
      const opened = await callTool('notebook_open', { notebookId: finalNotebookId })
      assert.equal(opened.ok, true)
      actualCalls.push('notebook_open')
      const imported = await callTool('notebook_add_source', { kind: 'file', path: file })
      assert.equal(imported.ok, true)
      actualCalls.push('notebook_add_source')
      return 'Collected 1 source using the registered notebook tools.'
    }
    sourcePermissions.push(...host.restrictions.get(agent.id))
    const found = await callTool('notebook_search', { query: 'copper' })
    assert.equal(found.ok, true)
    assert.equal(found.passages.length, 1)
    return 'Copper conducts electricity, according to the saved source.'
  }
  const started = await host.tool('notebook_research', { title: 'Copper research', prompt: 'Collect a reliable copper resource and build a notebook.' })
  assert.equal(started.ok, true)
  assert.equal(started.kind, 'background')
  assert.equal((await host.settledTask(started.workspaceId)).status, 'done')
  assert.deepEqual(actualCalls, ['notebook_open', 'notebook_add_source'])
  assert.equal(researchPermissions.includes('web_search'), true)
  assert.equal(researchPermissions.includes('web_fetch'), true)
  const view = await host.handle({ op: 'state', workspaceId: started.workspaceId })
  assert.equal(view.notebookId, finalNotebookId)
  assert.equal(view.notebook.title, 'Initial host notebook')
  assert.equal(view.sources.length, 1)
  assert.equal(view.sources[0].locator, file)
  assert.equal(view.messages.some(row => row.role === 'assistant' && row.text === 'Collected 1 source using the registered notebook tools.'), true)
  assert.equal(view.messages.filter(row => row.role === 'tool' && row.status === 'done').length, 2)
  assert.equal((await host.handle({ op: 'state', sessionId: 'host-session' })).notebookId, finalNotebookId)
  assert.equal((await host.tool('notebook_sources')).sources[0].id, view.sources[0].id)
  const status = await host.tool('notebook_workbench_status', { workspaceId: started.workspaceId })
  assert.equal(status.ok, true)
  assert.equal(status.task.status, 'done')
  assert.equal(status.workspace.notebookId, finalNotebookId)
  assert.equal(status.sources[0].id, view.sources[0].id)
  assert.equal(status.messages.some(row => row.role === 'assistant' && /Collected 1 source/.test(row.text)), true)
  const next = await host.handle({ op: 'chat', workspaceId: started.workspaceId, mode: 'sources', text: 'What does the copper source say?' })
  assert.equal(next.ok, true)
  assert.equal((await host.settledTask(started.workspaceId)).status, 'done')
  assert.equal(sourcePermissions.includes('web_search'), false)
  assert.equal(sourcePermissions.includes('web_fetch'), false)
  assert.equal(sourcePermissions.includes('notebook_search'), true)
  assert.equal(host.restrictions.get('host-session').includes('notebook_research'), true)
})

test('a new UI workspace builds its notebook and imports sources through native registered tools', async t => {
  const host = fixture(t)
  host.agents.clear()
  const created = await host.handle({ op: 'workspaceCreate', title: 'Build a new collection' })
  const workspaceId = created.workspaceId
  const before = await host.handle({ op: 'state', workspaceId })
  assert.equal(before.notebookId, null)
  assert.deepEqual(before.sources, [])
  let savedNotebookId
  let savedSourceId
  const actualCalls = []
  host.state.nativeFollowup = async ({ callTool }) => {
    const notebook = await callTool('notebook_create', { title: 'Copper collection', bind: true })
    assert.equal(notebook.ok, true)
    savedNotebookId = notebook.notebook.id
    actualCalls.push('notebook_create')
    const source = await callTool('notebook_add_source', {
      kind: 'text', title: 'Copper evidence', text: 'Copper conducts electricity and is used in electrical wiring.',
    })
    assert.equal(source.ok, true)
    savedSourceId = source.source.id
    actualCalls.push('notebook_add_source')
    return 'Created Copper collection and saved one evidence source.'
  }
  const started = await host.handle({ op: 'chat', workspaceId, text: 'Build a copper notebook from the resource I supplied.' })
  assert.equal(started.ok, true)
  assert.equal((await host.settledTask(workspaceId)).status, 'done')
  assert.deepEqual(actualCalls, ['notebook_create', 'notebook_add_source'])
  assert.deepEqual(host.state.nativeCreates, [workspaceId])
  const view = await host.handle({ op: 'state', workspaceId })
  assert.equal(view.notebookId, savedNotebookId)
  assert.equal(view.workspace.notebookId, savedNotebookId)
  assert.equal(view.notebook.title, 'Copper collection')
  assert.equal(view.sources.length, 1)
  assert.equal(view.sources[0].id, savedSourceId)
  assert.equal(view.messages.some(row => row.role === 'assistant' && row.text === 'Created Copper collection and saved one evidence source.'), true)
  assert.equal(view.messages.filter(row => row.role === 'tool' && row.status === 'done').length, 2)
  const source = await host.handle({ op: 'source', workspaceId, id: savedSourceId })
  assert.equal(source.source.body, 'Copper conducts electricity and is used in electrical wiring.')
  const status = await host.tool('notebook_workbench_status', { workspaceId })
  assert.equal(status.ok, true)
  assert.equal(status.task.status, 'done')
  assert.equal(status.sources[0].id, savedSourceId)
})

test('bindSession requires an existing host conversation and associates its tools with the workspace notebook', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId } = await workspaceWithNotebook(host)
  assert.equal((await host.handle({ op: 'bindSession', workspaceId, sessionId: 'missing-host' })).ok, false)
  const bound = await host.handle({ op: 'bindSession', workspaceId, sessionId: 'host-session' })
  assert.deepEqual(bound, { ok: true, notebookId, sessionId: 'host-session' })
  await host.tool('notebook_add_source', { kind: 'text', title: 'Bound source', text: 'copper from host conversation' })
  assert.equal((await host.handle({ op: 'state', workspaceId })).sources.length, 1)
  assert.equal((await host.handle({ op: 'state', sessionId: 'host-session' })).notebookId, notebookId)
})

test('source ownership is enforced across workspace API and ordinary tools', async t => {
  const host = fixture(t)
  const left = await workspaceWithNotebook(host, 'Left')
  const right = await workspaceWithNotebook(host, 'Right')
  const saved = await host.handle({ op: 'addText', workspaceId: left.workspaceId, title: 'Private to notebook', text: 'copper original text' })
  assert.equal((await host.handle({ op: 'source', workspaceId: right.workspaceId, id: saved.source.id })).ok, false)
  await assert.rejects(host.handle({ op: 'renameSource', workspaceId: right.workspaceId, id: saved.source.id, title: 'Wrong' }), /source not found/)
  await assert.rejects(host.handle({ op: 'deleteSource', workspaceId: right.workspaceId, id: saved.source.id }), /source not found/)
  await host.tool('notebook_open', { notebookId: right.notebookId })
  assert.equal((await host.tool('notebook_source', { id: saved.source.id })).ok, false)
  assert.equal((await host.tool('notebook_delete_source', { id: saved.source.id })).ok, false)
  assert.equal((await host.handle({ op: 'source', workspaceId: left.workspaceId, id: saved.source.id })).source.body, 'copper original text')
})

test('human source previews remain available while sources-only tools cannot read unselected bodies', async t => {
  const host = fixture(t)
  const notebook = await host.tool('notebook_create', { title: 'Selected evidence', bind: true })
  await host.tool('notebook_add_source', { kind: 'text', title: 'Selected source', text: 'copper selected evidence' })
  const excludedBody = 'excluded_source_body_7429'
  const excluded = await host.tool('notebook_add_source', { kind: 'text', title: 'Unselected source', text: excludedBody })
  await host.tool('notebook_set_sources', { changes: JSON.stringify([{ id: excluded.source.id, enabled: false }]) })
  const ordinaryRead = await host.tool('notebook_source', { id: excluded.source.id })
  assert.equal(ordinaryRead.ok, false)
  assert.equal(ordinaryRead.source, undefined)
  assert.equal(JSON.stringify(ordinaryRead).includes(excludedBody), false)
  const ordinaryPreview = await host.handle({ op: 'source', sessionId: 'host-session', id: excluded.source.id })
  assert.equal(ordinaryPreview.ok, true)
  assert.equal(ordinaryPreview.source.body, excludedBody)
  const created = await host.handle({ op: 'workspaceCreate' })
  const workspaceId = created.workspaceId
  await host.handle({ op: 'open', workspaceId, notebookId: notebook.notebook.id })
  const reads = []
  host.state.nativeFollowup = async ({ callTool }) => {
    reads.push(await callTool('notebook_source', { id: excluded.source.id }))
    return 'Completed the requested source read check.'
  }
  assert.equal((await host.handle({ op: 'chat', workspaceId, mode: 'research', text: 'Inspect the unselected source while organizing.' })).ok, true)
  assert.equal((await host.settledTask(workspaceId)).status, 'done')
  assert.equal(reads[0].ok, true)
  assert.equal(reads[0].source.body, excludedBody)
  assert.equal((await host.handle({ op: 'chat', workspaceId, mode: 'sources', text: 'Read the selected evidence only.' })).ok, true)
  assert.equal((await host.settledTask(workspaceId)).status, 'done')
  assert.equal(reads[1].ok, false)
  assert.equal(reads[1].source, undefined)
  assert.equal(JSON.stringify(reads[1]).includes(excludedBody), false)
  const workspacePreview = await host.handle({ op: 'source', workspaceId, id: excluded.source.id })
  assert.equal(workspacePreview.ok, true)
  assert.equal(workspacePreview.source.body, excludedBody)
})

test('generation without a host conversation uses real streamed output and the workspace owner', async t => {
  const host = fixture(t)
  host.agents.clear()
  const { workspaceId } = await workspaceWithNotebook(host, 'Unmatched title')
  await host.handle({ op: 'addText', workspaceId, title: 'Evidence', text: 'copper conducts electricity' })
  const started = await host.handle({ op: 'generate', workspaceId, kind: 'report', prompt: 'summarize the sources' })
  assert.equal(started.ok, true)
  const job = host.jobs.get(started.jobId)
  assert.equal(job.definition.owner, workspaceId)
  assert.equal((await job.done).status, 'completed')
  assert.equal(host.state.requests[0].sessionId, workspaceId)
  assert.equal(host.state.requests[0].provider, 'p')
  assert.equal(host.state.requests[0].model, 'm')
  assert.match(host.state.requests[0].messages[0].content[0].text, /copper conducts electricity/)
  assert.equal(host.state.requests[0].maxTokens, 8192)
  const result = await host.handle({ op: 'artifact', workspaceId, id: started.artifactId })
  assert.equal(result.artifact.status, 'done')
  assert.equal(result.artifact.body, 'Saved report')
})

function savedResearchGoal(host, workspaceId, notebookId, prompt) {
  host.library.appendMessage(workspaceId, { role: 'system', text: 'Saved research', metadata: { research: {
    version: 1, id: randomUUID(), workspaceId, notebookId, prompt, status: 'done',
    imported: [], reused: [], candidates: [],
  } } })
}

test('button-only Studio briefing uses the current notebook research goal and substantive topic windows', async t => {
  const host = fixture(t, { maxUploadBytes: 20000, chunkChars: 220, chunkOverlap: 10 })
  const { workspaceId, notebookId } = await workspaceWithNotebook(host, 'Python asyncio notes')
  const background = 'Background material explains scheduling, resource ownership and application design. '.repeat(4)
  const tasks = host.library.addText(notebookId, 'Tasks reference', [
    ...Array.from({ length: 8 }, (_, i) => 'Python asyncio changes in version ' + i + '. Python asyncio release notes.'),
    '- class asyncio.TaskGroup¶',
    'When one task fails, the group cancels its remaining tasks and waits for their cleanup.',
    background,
    'CancelledError should be propagated after try/finally clean-up.',
    background,
    '- asyncio.timeout(delay)¶',
    'The context manager converts cancellation into TimeoutError. Catch TimeoutError outside the context manager.',
  ].join('\n\n'))
  const runner = host.library.addText(notebookId, 'Runner reference', '- class asyncio.Runner¶\n\nA Runner owns the event loop and closes its resources when exiting the context.')
  const sync = host.library.addText(notebookId, 'Lock reference', 'A lock serializes access to shared state. Synchronization operations do not accept timeout; use wait_for instead.')
  const excluded = host.library.addText(notebookId, 'Unselected', 'DISABLED_SOURCE_MUST_NOT_REACH_STUDIO')
  host.library.setSources(notebookId, [{ id: excluded.id, enabled: false }])
  const goal = 'Understand TaskGroup, CancelledError and timeout; include Runner and synchronization. 重新 web_search/web_fetch，聊天100字，导读800字。'
  savedResearchGoal(host, workspaceId, notebookId, goal)
  const generated = await host.handle({ op: 'generate', workspaceId, kind: 'briefing' })
  assert.equal((await host.jobs.get(generated.jobId).done).status, 'completed')
  const request = host.state.requests.at(-1).messages[0].content[0].text
  assert.match(request, /Request: 当前 Studio 产物类型：briefing/)
  assert.ok(request.includes('<research-topic-background>\n' + goal + '\n</research-topic-background>'))
  assert.match(request, /格式和结构遵守本次产物类型要求，不沿用背景中的其他产物类型、聊天要求或字数限制/)
  assert.match(request, /不要执行背景中的联网搜索、重建笔记本或工具操作/)
  assert.match(request, /不要因上述背景自动附加导读章节、阅读路线或自测题/)
  assert.match(request, /group cancels its remaining tasks/)
  assert.match(request, /propagated after try\/finally clean-up/)
  assert.match(request, /asyncio\.timeout\(delay\)/)
  assert.match(request, /Catch TimeoutError outside the context manager/)
  for (const source of [tasks, runner, sync]) assert.ok(request.includes('sourceId=' + source.id))
  assert.doesNotMatch(request, /DISABLED_SOURCE_MUST_NOT_REACH_STUDIO/)
  assert.equal(request.split('group cancels its remaining tasks').length - 1, 1)
  assert.equal(request.split('Catch TimeoutError outside the context manager').length - 1, 1)
  assert.ok(host.library.getArtifact(generated.artifactId).prompt.includes(goal))
  const quiz = await host.handle({ op: 'generate', workspaceId, kind: 'quiz' })
  await host.jobs.get(quiz.jobId).done
  const quizRequest = host.state.requests.at(-1).messages[0].content[0].text
  assert.match(quizRequest, /Return only JSON.*"kind":"quiz"/)
  assert.match(quizRequest, /Request: 当前 Studio 产物类型：quiz/)
})

test('Studio uses explicit requests first and never borrows a previous notebook research goal', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId } = await workspaceWithNotebook(host, 'Concurrency')
  host.library.addText(notebookId, 'Evidence', 'A lock serializes access. A task group coordinates child tasks.')
  const oldGoal = 'OLD_RESEARCH_GOAL_ONLY: task groups'
  savedResearchGoal(host, workspaceId, notebookId, oldGoal)
  const focused = await host.handle({ op: 'generate', workspaceId, kind: 'report', prompt: 'Explain lock ownership' })
  await host.jobs.get(focused.jobId).done
  const focusedRequest = host.state.requests.at(-1).messages[0].content[0].text
  assert.match(focusedRequest, /Request: Explain lock ownership/)
  assert.doesNotMatch(focusedRequest, /OLD_RESEARCH_GOAL_ONLY/)
  const next = host.library.createNotebook({ title: 'Plant metabolism' })
  const plant = host.library.addText(next.id, 'Leaf evidence', 'Photosynthesis converts sunlight into chemical energy in plants.')
  await host.handle({ op: 'open', workspaceId, notebookId: next.id })
  const unrelated = await host.handle({ op: 'generate', workspaceId, kind: 'briefing' })
  await host.jobs.get(unrelated.jobId).done
  const unrelatedRequest = host.state.requests.at(-1).messages[0].content[0].text
  assert.match(unrelatedRequest, /Notebook: Plant metabolism/)
  assert.ok(unrelatedRequest.includes('sourceId=' + plant.id))
  assert.doesNotMatch(unrelatedRequest, /OLD_RESEARCH_GOAL_ONLY|task group|lock serializes/)
  assert.equal(host.library.getArtifact(unrelated.artifactId).prompt, '')
})

test('ordinary notebook_generate expands short topic matches and bounds the supplied evidence', async t => {
  const host = fixture(t, { maxUploadBytes: 10000, maxInjectChars: 250 })
  await host.tool('notebook_create', { title: 'Photosynthesis', bind: true })
  await host.tool('notebook_add_source', { kind: 'text', title: 'Mechanism', text: 'Photosynthesis\n\nPlants capture sunlight and convert it into stored chemical energy. ' + 'The surrounding explanation supplies additional source evidence. '.repeat(20) })
  const generated = await host.tool('notebook_generate', { kind: 'briefing', prompt: 'Explain the mechanism' })
  await host.jobs.get(generated.jobId).done
  const request = host.state.requests.at(-1).messages[0].content[0].text
  assert.match(request, /Plants capture sunlight and convert it into stored chemical energy/)
  const evidence = request.split('Passages:\n\n')[1].replace(/^\[\d+\] sourceId=[^\n]+\n/gm, '')
  assert.equal(evidence.length, 250)
})

test('Studio receives actual saved source URLs and truncation metadata without crossing source selection', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId } = await workspaceWithNotebook(host, 'Copper reference')
  const truncatedBody = 'Copper evidence saved from a provider-truncated document.'
  const completeBody = 'Copper evidence saved without a provider truncation flag.'
  const localBody = 'Copper evidence pasted by the user without a public URL.'
  const truncated = host.library.addWebDocument(notebookId, { url: 'https://example.org/copper-truncated', body: { kind: 'text', content: truncatedBody }, truncated: true })
  const complete = host.library.addWebDocument(notebookId, { url: 'https://example.org/copper-full', body: { kind: 'text', content: completeBody }, truncated: false })
  const local = host.library.addText(notebookId, 'Pasted copper', localBody)
  const disabled = host.library.addWebDocument(notebookId, { url: 'https://example.org/unselected', body: { kind: 'text', content: 'Copper unselected body' } })
  host.library.setSources(notebookId, [{ id: disabled.id, enabled: false }])
  const other = host.library.createNotebook({ title: 'Other copper' })
  host.library.addWebDocument(other.id, { url: 'https://example.org/other-notebook', body: { kind: 'text', content: 'Copper other notebook body' } })
  const generated = await host.handle({ op: 'generate', workspaceId, kind: 'briefing' })
  await host.jobs.get(generated.jobId).done
  const request = host.state.requests.at(-1).messages[0].content[0].text
  const metadata = JSON.parse(request.match(/Selected source metadata:\n([\s\S]*?)\n\nPassages:/)[1])
  assert.deepEqual(new Set(metadata.map(source => source.sourceId)), new Set([truncated.id, complete.id, local.id]))
  assert.deepEqual(metadata.map(source => ({ url: source.url, savedBody: source.savedBody, savedChars: source.savedChars, providerTruncated: source.providerTruncated })), [
    { url: truncated.locator, savedBody: true, savedChars: truncatedBody.length, providerTruncated: true },
    { url: complete.locator, savedBody: true, savedChars: completeBody.length, providerTruncated: false },
    { url: null, savedBody: true, savedChars: localBody.length, providerTruncated: null },
  ])
  assert.ok(metadata.every(source => source.excerptChars > 0 && source.excerptChars <= source.savedChars))
  assert.doesNotMatch(request, /https:\/\/example\.org\/(unselected|other-notebook)/)
  assert.match(request, /workbench renders these citations as clickable links to the saved source body/)
  assert.match(request, /current excerpts are insufficient, not that the whole source is unavailable/)
})

test('failed model streams produce failed artifacts and preserve ordinary job ownership', async t => {
  const host = fixture(t)
  const notebook = await host.tool('notebook_create', { title: 'Failure', bind: true })
  await host.tool('notebook_add_source', { kind: 'text', title: 'Evidence', text: 'copper evidence' })
  host.state.frames = [{ type: 'text-delta', text: 'partial output' }, { type: 'error', error: { message: 'simulated provider failure' } }]
  const started = await host.tool('notebook_generate', { kind: 'report', prompt: 'copper' })
  const job = host.jobs.get(started.jobId)
  assert.equal(job.definition.owner, 'host-session')
  assert.equal((await job.done).status, 'failed')
  assert.equal(host.state.requests[0].sessionId, 'host-session')
  const artifact = host.library.getArtifact(started.artifactId)
  assert.equal(artifact.notebook_id, notebook.notebook.id)
  assert.equal(artifact.status, 'failed')
  assert.equal(artifact.body, '')
  assert.match(artifact.error, /simulated provider failure/)
})

test('terminal model failures and empty output cannot become completed artifacts', async t => {
  for (const scenario of [
    { name: 'terminal failure', frames: [{ type: 'text-delta', text: 'partial' }, { type: 'finish', reason: { kind: 'error', failure: { message: 'terminal failure' } } }], expected: /terminal failure/ },
    { name: 'token budget exhausted', frames: [{ type: 'text-delta', text: 'incomplete guide' }, { type: 'finish', reason: { kind: 'max-tokens' } }], expected: /8192 tokens，max-tokens/ },
    { name: 'blocked without provider detail', frames: [{ type: 'finish', reason: { kind: 'blocked' } }], expected: /blocked/ },
    { name: 'empty output', frames: [{ type: 'text-delta', text: '  ' }, { type: 'finish', reason: { kind: 'stop' } }], expected: /empty artifact/ },
  ]) await t.test(scenario.name, async subtest => {
    const host = fixture(subtest)
    await host.tool('notebook_create', { title: 'Failure', bind: true })
    await host.tool('notebook_add_source', { kind: 'text', title: 'Evidence', text: 'copper evidence' })
    host.state.frames = scenario.frames
    const started = await host.tool('notebook_generate', { kind: 'report', prompt: 'copper' })
    assert.equal((await host.jobs.get(started.jobId).done).status, 'failed')
    const artifact = host.library.getArtifact(started.artifactId)
    assert.equal(artifact.status, 'failed')
    assert.equal(artifact.body, '')
    assert.match(artifact.error, scenario.expected)
  })
})

test('context injection reflects source selection and clears cached passages after tool mutations', async t => {
  const host = fixture(t)
  await host.tool('notebook_create', { title: 'Grounding', bind: true })
  const added = await host.tool('notebook_add_source', { kind: 'text', title: 'Evidence', text: 'copper evidence' })
  await host.preStep('host-session', 'copper')
  const section = host.sections.get('notebook:context')
  assert.match(section.text({ agent: host.agents.get('host-session') }), new RegExp('sourceId=' + added.source.id))
  await host.tool('notebook_set_sources', { changes: JSON.stringify([{ id: added.source.id, enabled: false }]) })
  assert.doesNotMatch(section.text({ agent: host.agents.get('host-session') }), /sourceId=/)
  await host.preStep('host-session', 'copper')
  assert.doesNotMatch(section.text({ agent: host.agents.get('host-session') }), /sourceId=/)
})

test('model source tools page long bodies while the saved and UI source remain complete', async t => {
  const host = fixture(t, { maxUploadBytes: 200000 })
  const { workspaceId, notebookId } = await workspaceWithNotebook(host)
  await host.tool('notebook_open', { notebookId })
  const body = ('中文参考资料：copper conducts electricity.\n').repeat(900)
  const added = await host.tool('notebook_add_source', { kind: 'text', title: 'Long source', text: body })
  assert.equal(added.ok, true)
  assert.equal(added.source.body, undefined, 'save acknowledgement stays metadata-only')
  const firstPage = (await host.tool('notebook_source', { id: added.source.id })).source
  assert.equal(firstPage.body.length, 6000)
  assert.equal(firstPage.bodyLength, body.length)
  assert.equal(firstPage.nextOffset, 6000)
  let reconstructed = ''
  let offset = 0
  do {
    const page = (await host.tool('notebook_source', { id: added.source.id, offset, limit: 4000 })).source
    assert.ok(page.body.length <= 4000)
    reconstructed += page.body
    offset = page.nextOffset
  } while (offset !== null)
  const saved = host.library.getSource(notebookId, added.source.id)
  assert.equal(reconstructed, saved.body)
  assert.equal((await host.handle({ op: 'source', workspaceId, id: added.source.id })).source.body, saved.body)
  for (const args of [{ offset: -1 }, { offset: 0.5 }, { limit: 12001 }, { offset: body.length + 1 }]) {
    assert.equal((await host.tool('notebook_source', { id: added.source.id, ...args })).ok, false)
  }
  const unicode = await host.tool('notebook_add_source', { kind: 'text', title: 'Unicode source', text: '😀中' })
  const completeCharacter = (await host.tool('notebook_source', { id: unicode.source.id, limit: 1 })).source
  assert.equal(completeCharacter.body, '😀')
  assert.equal(completeCharacter.nextOffset, 2)
  const remainder = (await host.tool('notebook_source', { id: unicode.source.id, offset: completeCharacter.nextOffset, limit: 1 })).source
  assert.equal(remainder.body, '中')
  assert.equal(remainder.nextOffset, null)
  const splitCharacter = await host.tool('notebook_source', { id: unicode.source.id, offset: 1, limit: 1 })
  assert.equal(splitCharacter.ok, false)
  assert.match(splitCharacter.error, /offset splits a Unicode character; use offset 0/)
})

test('owned collection prunes native history and does not reinject source bodies every step', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId } = await workspaceWithNotebook(host)
  const source = host.library.addText(notebookId, 'Evidence', 'copper original evidence UNIQUE_SOURCE_BODY')
  const pruned = []
  host.state.pruner = { pruneSession(session) { pruned.push(session.id); return { pruned: [], charsRemoved: 0 } } }
  await host.runtime.prepare(workspaceId, { provider: 'p', model: 'm' })
  await host.handle({ op: 'workspaceUpdate', workspaceId, mode: 'research' })
  await host.preStep(workspaceId, 'copper')
  assert.deepEqual(pruned, [workspaceId])
  assert.equal(host.sections.get('notebook:context').text({ agent: host.agents.get(workspaceId) }), '')
  assert.equal(host.library.getSource(notebookId, source.id).body, 'copper original evidence UNIQUE_SOURCE_BODY')
  await host.preStep('host-session', 'copper')
  assert.equal(pruned.length, 1, 'unowned sessions keep their host policy')
  await host.handle({ op: 'workspaceUpdate', workspaceId, mode: 'sources' })
  await host.preStep(workspaceId, 'copper')
  assert.match(host.sections.get('notebook:context').text({ agent: host.agents.get(workspaceId) }), /UNIQUE_SOURCE_BODY/)
})

test('Studio fits evidence to the selected model window and fails oversized instructions before calling it', async t => {
  const host = fixture(t, { maxUploadBytes: 100000, maxInjectChars: 16000, chunkChars: 8000, chunkOverlap: 0 })
  const { workspaceId, notebookId } = await workspaceWithNotebook(host, 'Small-window study')
  const first = host.library.addText(notebookId, 'First source', '铜的导电机制。'.repeat(1500))
  const second = host.library.addText(notebookId, 'Second source', '铜与其他金属比较。'.repeat(1500))
  host.state.modelInfo = { context: { contextWindow: 12000 }, defaultMaxTokens: 4096 }
  const generated = await host.handle({ op: 'generate', workspaceId, kind: 'briefing', prompt: '比较两份资料，保留关键条件。' })
  assert.equal((await host.jobs.get(generated.jobId).done).status, 'completed')
  const request = host.state.requests.at(-1)
  const prompt = request.messages[0].content[0].text
  assert.equal(request.maxTokens, 3000)
  assert.ok(Buffer.byteLength(prompt) + request.maxTokens + 1024 <= 12000)
  for (const source of [first, second]) assert.ok(prompt.includes('sourceId=' + source.id))
  assert.match(prompt, /比较两份资料，保留关键条件。/)
  assert.ok(host.library.getSource(notebookId, first.id).body.length > 6000)
  const calls = host.state.requests.length
  const tooLong = await host.handle({ op: 'generate', workspaceId, kind: 'briefing', prompt: '完整保留这个要求。'.repeat(1500) })
  const failure = await host.jobs.get(tooLong.jobId).done
  assert.equal(failure.status, 'failed')
  assert.match(failure.detail, /上下文预算/)
  assert.equal(host.state.requests.length, calls, 'do not submit a request known to exceed its window')
  assert.equal(host.library.getArtifact(tooLong.artifactId).body, '')
})

test('HTTP API enforces authentication, method, JSON validity, and request size', async t => {
  const host = fixture(t, { maxUploadBytes: 128 })
  assert.equal(host.state.route.path, '/dsh-notebook/api')
  assert.equal((await host.http({ method: 'GET' })).status, 405)
  assert.equal((await host.http({ authenticated: false, body: '{broken json' })).status, 401)
  const invalidAuth = await host.http({ authError: new Error('session expired') })
  assert.equal(invalidAuth.status, 401)
  assert.match(invalidAuth.body.error, /session expired/)
  const success = await host.http()
  assert.equal(success.status, 200)
  assert.equal(success.body.ok, true)
  assert.equal(success.headers['cache-control'], 'no-store')
  assert.equal((await host.http({ body: '{broken json' })).status, 400)
  const tooLarge = await host.http({ chunks: [Buffer.alloc(128 + 256 * 1024 + 1, ' ')] })
  assert.equal(tooLarge.status, 413)
  assert.match(tooLarge.body.error, /upload limit/)
  const unknown = await host.http({ body: { op: 'state', workspaceId: 'missing' } })
  assert.equal(unknown.body.ok, false)
  assert.match(unknown.body.error, /workspace not found/)
})

test('modern Desktop uses the owner-authenticated Connection channel without requiring removed cookie APIs', async t => {
  const host = fixture(t, { maxUploadBytes: 128 }, 'connection')
  assert.equal(host.state.route, null, 'no raw route is exposed alongside the authenticated channel')
  const route = host.state.sharedRoute
  assert.equal(route.path, '/api/dsh-notebook/api')
  assert.deepEqual(route.methods, ['POST'])
  assert.equal(route.requestBody, 'buffered')
  const envelope = { type: 'client-request', rpcId: 'desktop-test', method: 'dsh-notebook/api', payload: { op: 'workspaceCreate', title: 'Desktop RPC' } }
  const call = body => route.fetch(new Request('http://localhost' + route.path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))
  const response = await call(envelope)
  const body = await response.json()
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, envelope.rpcId)
  assert.equal(body.result.ok, true)
  assert.equal(body.result.value.workspace.title, 'Desktop RPC')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await call('{bad')).status, 400)
  assert.equal((await call({ ...envelope, method: 'other' })).status, 400)
  assert.equal((await call(' '.repeat(128 + 256 * 1024 + 1))).status, 413)
  const error = await (await call({ ...envelope, payload: null })).json()
  assert.equal(error.result.ok, false)
  assert.equal(error.result.error.code, 'NOTEBOOK_ERROR')
})

function studyDeck(kind, sourceId) {
  return { version: 1, kind, items: kind === 'quiz'
    ? [{ id: 'q1', question: 'Where must TimeoutError be caught?', choices: [{ id: 'A', text: 'Inside the context' }, { id: 'B', text: 'Outside the context' }], answer: 'B', explanation: 'The timeout context translates cancellation on exit, so catch TimeoutError outside.', sourceIds: [sourceId] }]
    : [{ id: 'c1', front: 'Where must TimeoutError be caught?', back: 'Outside the timeout context.', explanation: 'The timeout context translates cancellation on exit.', sourceIds: [sourceId] }] }
}

test('study generation validates the exact selected evidence and rejects ungradeable output before marking done', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId } = await workspaceWithNotebook(host, 'Timeout study')
  const source = host.library.addText(notebookId, 'Timeout', 'Catch TimeoutError outside the timeout context.')
  const excluded = host.library.addText(notebookId, 'Unselected', 'Not in the generated evidence.')
  host.library.setSources(notebookId, [{ id: excluded.id, enabled: false }])
  const malformedAnswer = studyDeck('quiz', source.id)
  malformedAnswer.items[0].answer = 'missing-choice'
  const missingExplanation = studyDeck('flashcards', source.id)
  missingExplanation.items[0].explanation = ''
  const cases = [
    { kind: 'quiz', value: studyDeck('quiz', source.id), valid: true },
    { kind: 'flashcards', value: studyDeck('flashcards', source.id), valid: true },
    { kind: 'quiz', value: malformedAnswer },
    { kind: 'quiz', value: studyDeck('quiz', excluded.id) },
    { kind: 'flashcards', value: missingExplanation },
    { kind: 'quiz', raw: 'Model returned explanatory prose, not valid JSON' },
  ]
  for (const scenario of cases) {
    host.state.frames = [{ type: 'text-delta', text: scenario.raw || JSON.stringify(scenario.value) }, { type: 'finish', reason: { kind: 'stop' } }]
    const started = await host.handle({ op: 'generate', workspaceId, kind: scenario.kind })
    assert.equal(started.ok, true)
    const result = await host.jobs.get(started.jobId).done
    const artifact = host.library.getArtifact(started.artifactId)
    assert.equal(artifact.status, scenario.valid ? 'done' : 'failed')
    assert.equal(result.status, scenario.valid ? 'completed' : 'failed')
    if (scenario.valid) {
      const saved = JSON.parse(artifact.body)
      assert.equal(saved.version, 1)
      assert.equal(saved.kind, scenario.kind)
      assert.deepEqual(saved.items[0].sourceIds, [source.id])
      assert.equal(JSON.parse(result.result).itemCount, 1)
      assert.ok(!result.result.includes(saved.items[0].explanation), 'job notice must not disclose explanations before practice')
    } else {
      assert.equal(artifact.body, '')
      assert.ok(artifact.error)
    }
  }
})

test('study API binds notebook ownership and persists submitted feedback through quiz and flashcard retry flows', async t => {
  const host = fixture(t)
  const { workspaceId, notebookId } = await workspaceWithNotebook(host, 'Study API')
  const other = await workspaceWithNotebook(host, 'Other notebook')
  const source = host.library.addText(notebookId, 'Timeout', 'Catch TimeoutError outside the timeout context.')
  const ids = {}
  for (const kind of ['quiz', 'flashcards']) {
    const artifact = host.library.createArtifact(notebookId, { kind, title: kind, prompt: '' })
    host.library.finishArtifact(artifact.id, 'done', JSON.stringify(studyDeck(kind, source.id)))
    ids[kind] = artifact.id
  }
  const call = async (op, args = {}) => {
    const result = await host.handle({ op, workspaceId, sessionId: 'host-session', ...args })
    assert.equal(result.ok, true)
    return result.study
  }
  let quiz = await call('studyOpen', { artifactId: ids.quiz })
  assert.equal(quiz.currentItem.question, 'Where must TimeoutError be caught?')
  assert.equal(quiz.currentItem.answer, undefined)
  assert.equal(quiz.currentItem.explanation, undefined)
  assert.equal(quiz.currentAttempt, null)
  const quizSession = quiz.studySessionId
  const wrong = { studySessionId: quizSession, itemId: 'q1', answer: 'A', requestId: 'quiz-wrong' }
  quiz = await call('studyAnswer', wrong)
  assert.equal(quiz.currentAttempt.correct, false)
  assert.equal(quiz.currentAttempt.correctAnswer, 'B')
  assert.match(quiz.currentAttempt.explanation, /outside/)
  assert.equal((await call('studyAnswer', wrong)).history.length, 1)
  assert.equal((await host.handle({ op: 'studyGet', workspaceId: other.workspaceId, notebookId, studySessionId: quizSession })).ok, false)
  assert.equal((await host.handle({ op: 'studyAnswer', workspaceId: other.workspaceId, notebookId, ...wrong })).ok, false)
  assert.equal((await host.handle({ op: 'studyOpen', workspaceId: other.workspaceId, notebookId, artifactId: ids.quiz })).ok, false)
  const unauthenticated = await host.http({ authenticated: false, body: { op: 'studyGet', workspaceId, studySessionId: quizSession } })
  assert.equal(unauthenticated.status, 401)
  quiz = await call('studyNext', { studySessionId: quizSession, itemId: 'q1' })
  assert.equal(quiz.completed, true)
  const restored = await call('studyOpen', { artifactId: ids.quiz })
  assert.equal(restored.studySessionId, quizSession)
  assert.equal(restored.history.length, 1)
  quiz = await call('studyOpen', { artifactId: ids.quiz, mode: 'mistakes', restart: true })
  assert.equal(quiz.total, 1)
  quiz = await call('studyAnswer', { studySessionId: quiz.studySessionId, itemId: 'q1', answer: 'B', requestId: 'quiz-correct' })
  assert.equal(quiz.currentAttempt.correct, true)
  assert.equal(quiz.mistakeCount, 0)
  let card = await call('studyOpen', { artifactId: ids.flashcards })
  assert.equal(card.currentItem.back, undefined)
  card = await call('studyAnswer', { studySessionId: card.studySessionId, itemId: 'c1', answer: '不确定', requestId: 'card-recall' })
  assert.equal(card.currentAttempt.correct, null)
  assert.match(card.currentAttempt.back, /Outside/)
  assert.equal(card.canNext, false)
  card = await call('studyRate', { studySessionId: card.studySessionId, itemId: 'c1', rating: 'again', requestId: 'card-rate' })
  assert.equal(card.currentAttempt.grading, 'self-assessment')
  assert.equal(card.currentAttempt.correct, false)
  assert.equal(card.mistakeCount, 1)
  card = await call('studyNext', { studySessionId: card.studySessionId, itemId: 'c1' })
  assert.equal(card.completed, true)
  assert.equal((await call('studyOpen', { artifactId: ids.flashcards })).currentItem, null)
  const retry = await call('studyOpen', { artifactId: ids.flashcards, mode: 'mistakes' })
  assert.equal(retry.total, 1)
})
