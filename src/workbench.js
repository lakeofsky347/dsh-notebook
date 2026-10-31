import { randomUUID } from 'node:crypto'

const textOf = content => (content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n')
const messageOf = error => error?.message || String(error)
const missingSession = error => error?.name === 'SessionPersistenceNotFoundError'
const userMessage = ({ content, source }) => Object.freeze({ id: randomUUID(), role: 'user', content, source })

/** An owned native DSH Agent per workbench; SQLite contains only its UI projection. */
export function createWorkbench(ctx, library, options) {
  const { resolveRoute, setupAgent, onNotebookChange, maxSteps = 24, timeoutMs = 180000, maxTokens = 8192 } = options
  for (const [name, value] of Object.entries({ maxSteps, timeoutMs, maxTokens })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(name + ' must be a positive integer')
  }
  const makeUserMessage = options.createUserMessage ?? userMessage
  const owned = new Map()
  const tasks = new Map()
  const reservations = new Set()
  const preparations = new Map()
  const listeners = []
  let disposed = false

  function snapshot(task) {
    if (!task) return null
    const { id, workspaceId, status, phase, error, steps, startedAt, finishedAt, mode, route } = task
    return { id, workspaceId, sessionId: workspaceId, status, phase, error, steps, startedAt, finishedAt, mode, provider: route.provider, model: route.model }
  }

  function remember(record, row) {
    record.rows.set(row.id, row)
    const meta = row.metadata ?? {}
    if (meta.nativeMessageId) record.messages.set(meta.nativeMessageId, row.id)
    if (meta.callId) record.calls.set(meta.callId, row.id)
    for (const key of ['nativeEventSeq', 'nativeCallSeq']) {
      if (Number.isSafeInteger(meta[key])) record.events.add(meta[key])
    }
    return row
  }

  function append(record, input) {
    return remember(record, library.appendMessage(record.workspaceId, input))
  }

  function update(record, id, patch) {
    return remember(record, library.updateMessage(id, patch))
  }

  function stop(record, cause, error = '') {
    const task = record.task
    if (!task || task.status !== 'running' || task.stopCause) return
    task.stopCause = cause
    task.error = error
    task.phase = 'stopping'
    task.controller.abort(new Error(error || '已停止'))
    record.agent?.cancel(cause === 'user' ? { kind: 'user' } : cause === 'disposed' ? { kind: 'disposed' } : { kind: 'hook', reason: error })
  }

  function projectionFailure(record, error) {
    if (record.task?.status === 'running') stop(record, 'projection', '工作台记录失败：' + messageOf(error))
  }

  function listen(name, handler) {
    const release = ctx.on(name, handler)
    if (typeof release === 'function') listeners.push(release)
  }

  function metadata(record, event, extra = {}) {
    return { nativeSessionId: record.workspaceId, nativeEventSeq: event.seq, ...extra }
  }

  function projectEvent(record, event, replay = false) {
    if (Number.isSafeInteger(event.seq) && record.events.has(event.seq)) return
    const data = event.data
    const route = record.task?.route ?? library.getWorkspace(record.workspaceId)
    if (event.type === 'user/message' || event.type === 'assistant/message') {
      const message = event.type === 'user/message' ? data : data.message
      const role = event.type === 'user/message' ? 'user' : 'assistant'
      let id = record.messages.get(message.id)
      // A stream row already exists before its final native event. On resume,
      // turn/step correlates that row with the committed message as well.
      if (!id && role === 'assistant') {
        id = [...record.rows.values()].find(row => row.role === 'assistant' && row.status === 'streaming' && row.metadata?.turn === data.turn && row.metadata?.step === data.step)?.id
      }
      const meta = metadata(record, event, { nativeMessageId: message.id, ...(data.turn === undefined ? {} : { turn: data.turn, step: data.step }), ...(data.interrupted ? { interrupted: true } : {}) })
      const body = { text: textOf(message.content), content: message.content, status: data.interrupted ? 'cancelled' : 'done', metadata: meta }
      const row = id ? update(record, id, body) : append(record, { ...body, role, provider: message.source?.provider ?? route.provider, model: message.source?.model ?? route.model })
      if (role === 'assistant' && record.stream?.rowId === row.id) {
        clearTimeout(record.stream.timer)
        record.stream.committed = true
      }
    } else if (event.type === 'tool/call') {
      if (!record.calls.has(data.callId)) append(record, {
        role: 'tool', toolName: data.name, text: data.arguments, status: 'pending',
        metadata: metadata(record, event, { nativeCallSeq: event.seq, callId: data.callId, turn: data.turn, step: data.step, arguments: data.arguments }),
      })
      if (!replay && record.task) record.task.phase = 'tool:' + data.name
    } else if (event.type === 'tool/result') {
      const message = data.message
      const id = record.calls.get(message.toolCallId)
      const previous = id ? record.rows.get(id) : null
      const patch = {
        text: textOf(message.content), content: message.content, status: message.isError ? 'failed' : 'done',
        metadata: metadata(record, event, { ...previous?.metadata, nativeEventSeq: event.seq, nativeMessageId: message.id, callId: message.toolCallId, ...(data.error ? { error: data.error } : {}) }),
      }
      const row = id ? update(record, id, patch) : append(record, { role: 'tool', ...patch })
      if (!replay && row.toolName.startsWith('notebook_')) {
        const changed = onNotebookChange?.(record.workspaceId)
        if (changed?.then) record.updates = Promise.all([record.updates, changed]).then(() => undefined).catch(error => projectionFailure(record, error))
      }
    } else if (!replay && event.type === 'turn/end' && record.task) {
      record.task.turnReason = data.reason
    }
    if (Number.isSafeInteger(event.seq)) record.events.add(event.seq)
  }

  listen('session/event', (session, event) => {
    const record = owned.get(session.id)
    if (!record) return
    try { projectEvent(record, event) } catch (error) { projectionFailure(record, error) }
  })

  listen('agent/assistant-stream', ({ agent, frame }) => {
    const record = owned.get(agent.id)
    if (!record || record.task?.status !== 'running') return
    try {
      if (frame.type === 'start') {
        const row = append(record, {
          role: 'assistant', text: '', status: 'streaming', provider: record.task.route.provider, model: record.task.route.model,
          metadata: { nativeSessionId: agent.id, attemptId: frame.attemptId, turn: frame.turn, step: frame.step },
        })
        record.stream = { attemptId: frame.attemptId, rowId: row.id, text: '', lastIndex: -1, committed: false }
        record.task.phase = 'thinking'
      } else if (frame.type === 'chunk' && record.stream?.attemptId === frame.attemptId) {
        const stream = record.stream
        if (frame.index <= stream.lastIndex) return
        stream.lastIndex = frame.index
        if (frame.chunk.type === 'text-delta') {
          stream.text += frame.chunk.text
          record.task.phase = 'answering'
          if (!stream.timer) stream.timer = setTimeout(() => {
            stream.timer = undefined
            if (stream.committed) return
            try { update(record, stream.rowId, { text: stream.text, content: [{ type: 'text', text: stream.text }] }) }
            catch (error) { projectionFailure(record, error) }
          }, 40)
        }
      } else if (frame.type === 'end' && record.stream?.attemptId === frame.attemptId) {
        const stream = record.stream
        clearTimeout(stream.timer)
        if (!stream.committed) update(record, stream.rowId, { text: stream.text, content: [{ type: 'text', text: stream.text }], status: frame.outcome.kind === 'abandoned' ? 'cancelled' : 'failed' })
        record.stream = null
      }
    } catch (error) { projectionFailure(record, error) }
  })

  listen('agent/pre-step', async (payload, next) => {
    const decision = await next()
    const record = owned.get(payload.agent.id)
    if (decision?.kind !== 'enter' || !record || record.task?.status !== 'running' || payload.signal.aborted) return decision
    if (record.task.steps >= maxSteps) stop(record, 'limit', '已达到本轮工具步骤上限（' + maxSteps + '），可继续发送消息接着整理。')
    else { record.task.steps += 1; record.task.phase = 'thinking' }
    return decision
  })

  // rc.5 switches through this public waterfall. Newer hosts expose
  // agent.model.select(), whose captured selection must remain untouched here.
  listen('agent/request', async ({ agent }, next) => {
    const config = await next()
    const record = owned.get(agent.id)
    if (!record || record.task?.status !== 'running' || typeof agent.model?.select === 'function') return config
    const { provider: _provider, model: _model, reasoningEffort: _effort, ...controls } = config
    return { ...controls, ...record.task.route, maxTokens }
  })

  listen('agent/error', ({ agent, error }) => {
    const task = owned.get(agent.id)?.task
    if (task?.status === 'running' && !task.stopCause) task.error = messageOf(error)
  })

  listen('agent/disposed', ({ agent }) => {
    const record = owned.get(agent.id)
    if (record?.agent !== agent) return
    record.agent = null
    record.handle = null
    if (!disposed && record.task?.status === 'running') stop(record, 'unavailable', '工作台会话已关闭，请重试以恢复会话。')
  })

  async function ensureAgent(record, task) {
    if (record.handle) {
      await setupAgent?.(record.agent.ctx, record.agent, record.workspaceId)
      return record.agent
    }
    const persistence = ctx.get?.('sessionPersistence')
    const rows = library.listMessages(record.workspaceId, Number.MAX_SAFE_INTEGER)
    for (const row of rows) remember(record, row)
    const hasHistory = rows.some(row => row.metadata?.nativeMessageId || row.metadata?.attemptId)
    const setup = async (agentCtx, agent) => {
      record.agent = agent
      await setupAgent?.(agentCtx, agent, record.workspaceId)
    }
    const agentOptions = { ...task.route, maxTokens }
    let handle
    let resumed = false
    if (persistence) {
      try {
        handle = await ctx.agents.resume({ resumeSessionId: record.workspaceId, agentOptions, setup, signal: task.controller.signal })
        resumed = true
      } catch (error) {
        if (!missingSession(error)) throw error
        if (hasHistory) throw new Error('宿主会话日志已缺失，无法完整恢复此对话。请新建工作台对话；原有记录仍可查看。')
      }
    } else if (hasHistory) {
      throw new Error('宿主未启用会话持久化，无法恢复已关闭的工作台对话。请新建对话；原有记录仍可查看。')
    }
    if (!handle) handle = await ctx.agents.create({ sessionId: record.workspaceId, agentOptions, setup, signal: task.controller.signal })
    record.handle = handle
    record.agent = handle.agent
    if (resumed) {
      // A read handle is public and can coexist with the native writer. Refill
      // missed UI events after a crash, never manufacture model history.
      const reader = await persistence.open(record.workspaceId, 'read', { signal: task.controller.signal })
      try {
        const { events } = await reader.read(0, undefined, { signal: task.controller.signal })
        for (const event of events) projectEvent(record, event, true)
      } finally { await reader.close() }
      for (const row of record.rows.values()) {
        if (row.status === 'streaming' || row.status === 'pending') update(record, row.id, { status: 'cancelled', metadata: { ...row.metadata, interrupted: true } })
      }
    }
    return handle.agent
  }

  async function drive(record, task, text) {
    task.timer = setTimeout(() => stop(record, 'timeout', '本轮整理超过时间上限，已停止。可以继续发送消息。'), timeoutMs)
    try {
      const agent = await ensureAgent(record, task)
      task.controller.signal.throwIfAborted()
      if (typeof agent.model?.select === 'function') agent.model.select(task.route)
      task.turnReason = null
      const message = makeUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
      const row = append(record, {
        role: 'user', text, content: message.content, provider: task.route.provider, model: task.route.model, status: 'pending',
        metadata: { nativeSessionId: agent.id, nativeMessageId: message.id },
      })
      task.userRowId = row.id
      task.phase = 'thinking'
      agent.followup(message)
      await agent.whenIdle()
      await record.updates
      const reason = task.turnReason
      if (task.stopCause) {
        if (!['user', 'disposed'].includes(task.stopCause)) throw new Error(task.error)
        task.status = 'cancelled'
      } else if (reason?.kind === 'aborted' || reason?.kind === 'interrupted') task.status = 'cancelled'
      else if (task.error || reason?.kind === 'error' || reason?.kind === 'max-tokens' || reason?.kind === 'blocked') {
        throw new Error(task.error || reason.error?.message || (reason.kind === 'max-tokens' ? '模型输出达到上限，请继续或缩小任务范围。' : '模型任务被阻止。'))
      } else task.status = 'done'
    } catch (error) {
      task.status = ['user', 'disposed'].includes(task.stopCause) ? 'cancelled' : 'failed'
      if (task.status === 'failed') task.error = task.error || messageOf(error)
    } finally {
      clearTimeout(task.timer)
      if (record.stream) {
        clearTimeout(record.stream.timer)
        if (!record.stream.committed) {
          const stream = record.stream
          try { update(record, stream.rowId, { text: stream.text, content: [{ type: 'text', text: stream.text }], status: task.status === 'cancelled' ? 'cancelled' : 'failed' }) } catch {}
        }
        record.stream = null
      }
      const user = task.userRowId && record.rows.get(task.userRowId)
      if (user?.status === 'pending') {
        try { update(record, user.id, { status: task.status === 'cancelled' ? 'cancelled' : task.status === 'failed' ? 'failed' : 'done' }) } catch {}
      }
      task.phase = task.status
      task.finishedAt = Date.now()
    }
  }

  return {
    workspaceForAgent(agentId) { return owned.get(agentId)?.workspaceId ?? null },
    routeForAgent(agentId) { const route = owned.get(agentId)?.task?.route; return route ? { ...route } : null },
    task(workspaceId) { return snapshot(tasks.get(workspaceId)) },
    async prepare(workspaceId, selectedRoute) {
      if (disposed) throw new Error('工作台已关闭')
      const workspace = library.getWorkspace(workspaceId)
      if (!workspace) throw new Error('workspace not found')
      if (reservations.has(workspaceId) || tasks.get(workspaceId)?.status === 'running') throw new Error('当前对话正在运行，请先停止或等待完成')
      reservations.add(workspaceId)
      const controller = new AbortController()
      const promise = (async () => {
        const route = await resolveRoute(selectedRoute, workspace)
        if (disposed) throw new Error('工作台已关闭')
        if (!route?.provider || !route?.model) throw new Error('请选择可用的模型')
        library.updateWorkspace(workspaceId, { provider: route.provider, model: route.model })
        let record = owned.get(workspaceId)
        if (!record) {
          record = { workspaceId, agent: null, handle: null, task: null, rows: new Map(), messages: new Map(), calls: new Map(), events: new Set(), stream: null, updates: Promise.resolve() }
          owned.set(workspaceId, record)
        }
        const agent = await ensureAgent(record, { route, controller })
        controller.signal.throwIfAborted()
        if (typeof agent.model?.select === 'function') agent.model.select(route)
        return agent
      })()
      preparations.set(workspaceId, { controller, promise })
      try { return await promise }
      finally { reservations.delete(workspaceId); preparations.delete(workspaceId) }
    },
    async start(workspaceId, input, selectedRoute, selectedMode) {
      if (disposed) throw new Error('工作台已关闭')
      const workspace = library.getWorkspace(workspaceId)
      if (!workspace) throw new Error('workspace not found')
      const text = String(input ?? '').trim()
      if (!text) throw new Error('请输入消息')
      if (reservations.has(workspaceId) || tasks.get(workspaceId)?.status === 'running') throw new Error('当前对话正在运行，请先停止或等待完成')
      const mode = selectedMode ?? workspace.mode
      if (!['research', 'sources'].includes(mode)) throw new Error('未知的工作台模式')
      reservations.add(workspaceId)
      let route
      try {
        route = await resolveRoute(selectedRoute, workspace)
        if (disposed) throw new Error('工作台已关闭')
        if (!route?.provider || !route?.model) throw new Error('请选择可用的模型')
        library.updateWorkspace(workspaceId, { provider: route.provider, model: route.model, mode })
      } finally { reservations.delete(workspaceId) }
      const task = { id: randomUUID(), workspaceId, status: 'running', phase: 'preparing', error: '', steps: 0, startedAt: Date.now(), finishedAt: null, mode, route: { ...route }, controller: new AbortController() }
      tasks.set(workspaceId, task)
      let record = owned.get(workspaceId)
      if (!record) {
        record = { workspaceId, agent: null, handle: null, task, rows: new Map(), messages: new Map(), calls: new Map(), events: new Set(), stream: null, updates: Promise.resolve() }
        owned.set(workspaceId, record)
      }
      record.task = task
      record.updates = Promise.resolve()
      task.promise = Promise.resolve().then(() => drive(record, task, text))
      return snapshot(task)
    },
    cancel(workspaceId) {
      const record = owned.get(workspaceId)
      if (record) stop(record, 'user')
      return snapshot(tasks.get(workspaceId))
    },
    async dispose() {
      disposed = true
      for (const record of owned.values()) stop(record, 'disposed')
      for (const preparation of preparations.values()) preparation.controller.abort(new Error('工作台已关闭'))
      await Promise.allSettled([...preparations.values()].map(value => value.promise))
      await Promise.allSettled([...tasks.values()].map(task => task.promise))
      await Promise.allSettled([...owned.values()].filter(record => record.handle).map(record => record.handle.dispose()))
      for (const release of listeners) release()
      owned.clear()
    },
  }
}
