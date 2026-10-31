import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { applyNotebook } from '../src/service.js'

function fixture(t, overrides = {}) {
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
    selection: { provider: 'p', model: 'm' },
    providers: [{ id: 'p', name: 'Provider P' }, { id: 'q', name: 'Provider Q' }],
    models: { p: [{ id: 'm', name: 'Model M' }], q: [{ id: 'n', name: 'Model N' }] },
    modelErrors: {},
    frames: [{ type: 'text-delta', text: 'Saved report' }, { type: 'finish', reason: { kind: 'stop' } }],
    requests: [],
    nativeCreates: [],
    route: null,
  }
  async function emit(name, ...args) {
    for (const handler of [...(listeners.get(name) ?? [])]) await handler(...args)
  }
  let eventSequence = 0
  function makeAgent(id, route = state.selection, native = false) {
    let selected = { ...route }
    let idle = Promise.resolve()
    const agent = {
      id,
      options: { ...selected },
      model: { current: () => ({ ...selected }), select: value => { selected = { ...value } } },
      ctx: { tools: { restrict: ({ allow }) => {
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
              const definition = definitions.get(name)
              assert.ok(definition, 'registered native tool ' + name)
              const callId = randomUUID()
              await emit('session/event', { id }, { type: 'tool/call', seq: ++eventSequence, data: {
                callId, name, arguments: JSON.stringify(args), turn: 1, step: 1,
              } })
              const result = await definition.execute(args, { agent })
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
      return undefined
    },
    systemPrompt: {
      getSectionOrder: () => 100,
      section(definition) { sections.set(definition.name, definition); return () => sections.delete(definition.name) },
    },
    tools: {
      register(definition) { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) },
      definitions: () => [...definitions.values(), ...(state.web ? [{ name: 'web_search' }, { name: 'web_fetch' }] : [])],
    },
    agents: {
      get: id => agents.get(id),
      async create(options) {
        state.nativeCreates.push(options.sessionId)
        const agent = makeAgent(options.sessionId, options.agentOptions, true)
        agents.set(agent.id, agent)
        await options.setup?.(agent.ctx, agent)
        await emit('agent/created', { agent })
        return { agent, async dispose() { await emit('agent/disposed', { agent }); agents.delete(agent.id) } }
      },
    },
    llm: {
      listProviders: () => state.providers,
      async listModels(provider) { if (state.modelErrors[provider]) throw state.modelErrors[provider]; return state.models[provider] ?? [] },
      async *stream(request) {
        state.requests.push(request)
        for (const frame of state.frames) yield frame
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
  for (const op of ['state', 'create', 'open', 'addText', 'generate', 'chat']) {
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
  const result = await host.handle({ op: 'artifact', workspaceId, id: started.artifactId })
  assert.equal(result.artifact.status, 'done')
  assert.equal(result.artifact.body, 'Saved report')
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
