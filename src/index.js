import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { openLibrary } from './library.js'
import { studioPrompt } from './prompt.js'
import { renderContext } from './text.js'

export const name = 'dsh-notebook'
export const inject = ['tools', 'systemPrompt', 'jobs', 'agents', 'llm', 'webServer', 'connection']

export const Config = Schema.object({
  dataDir: Schema.string().default(''),
  maxNotebooks: Schema.number().default(100),
  maxSourcesPerNotebook: Schema.number().default(50),
  maxWordsPerSource: Schema.number().default(500000),
  maxUploadBytes: Schema.number().default(20 * 1024 * 1024),
  chunkChars: Schema.number().default(1200),
  chunkOverlap: Schema.number().default(150),
  topK: Schema.number().default(8),
  maxInjectChars: Schema.number().default(16000),
  urlTimeoutMs: Schema.number().default(15000),
  maxUrlBytes: Schema.number().default(2 * 1024 * 1024),
})

const ALLOW = [
  'notebook_list', 'notebook_create', 'notebook_open', 'notebook_update',
  'notebook_add_source', 'notebook_set_sources', 'notebook_note', 'notebook_search', 'notebook_generate',
  'job_list', 'job_output', 'job_kill',
]

function defaultDataDir() {
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    if (manifest?.dsh?.profile) return join(process.cwd(), 'plugin-data', 'dsh-notebook')
  } catch {}
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE || 'web'
  const candidate = join(home, 'profiles', profile)
  if (existsSync(candidate)) return join(candidate, 'plugin-data', 'dsh-notebook')
  return join(home, 'plugin-data', 'dsh-notebook')
}

function messageText(messages) {
  const parts = []
  for (const message of messages ?? []) {
    for (const block of message?.content ?? []) {
      if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function apply(ctx, config) {
  const limits = {
    maxNotebooks: config.maxNotebooks,
    maxSourcesPerNotebook: config.maxSourcesPerNotebook,
    maxWordsPerSource: config.maxWordsPerSource,
    maxUploadBytes: config.maxUploadBytes,
    chunkChars: config.chunkChars,
    chunkOverlap: config.chunkOverlap,
    topK: config.topK,
    maxInjectChars: config.maxInjectChars,
    urlTimeoutMs: config.urlTimeoutMs,
    maxUrlBytes: config.maxUrlBytes,
  }
  const dir = config.dataDir.trim() === '' ? defaultDataDir() : config.dataDir
  const library = openLibrary(join(dir, 'library.sqlite'), limits)
  ctx.effect(() => () => library.close())
  const passages = new Map()
  const releases = new Map()

  function render(sessionId) {
    const notebookId = library.binding(sessionId)
    if (!notebookId) return ''
    const notebook = library.getNotebook(notebookId)
    if (!notebook) return ''
    const cached = passages.get(sessionId)
    return renderContext(notebook, cached?.passages ?? [], limits.maxInjectChars)
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'notebook:context',
    order: ctx.systemPrompt.getSectionOrder('PLAN_POLICY') + 10,
    text(context) {
      const sessionId = context.agent?.id
      return sessionId ? render(sessionId) : ''
    },
  }))

  function syncRestrict(sessionId) {
    const previous = releases.get(sessionId)
    if (previous) previous()
    releases.delete(sessionId)
    const agent = ctx.agents.get(sessionId)
    if (!agent?.ctx?.tools) return
    const notebookId = library.binding(sessionId)
    const notebook = notebookId ? library.getNotebook(notebookId) : null
    if (notebook?.grounding === 'sources-only') {
      releases.set(sessionId, agent.ctx.tools.restrict({ allow: ALLOW }))
    }
  }

  ctx.on('agent/created', ({ agent }) => syncRestrict(agent.id))
  ctx.on('agent/disposed', ({ agent }) => {
    releases.get(agent.id)?.()
    releases.delete(agent.id)
    passages.delete(agent.id)
  })
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision?.kind !== 'enter' || payload.signal.aborted) return decision
    const sessionId = payload.agent.id
    const notebookId = library.binding(sessionId)
    if (!notebookId) {
      passages.delete(sessionId)
      return decision
    }
    const query = messageText(decision.messages)
    const previous = passages.get(sessionId)
    if (query.trim() === '') {
      if (!previous || previous.turn !== payload.turn) passages.delete(sessionId)
      return decision
    }
    passages.set(sessionId, {
      turn: payload.turn,
      passages: library.search(notebookId, query, limits.topK),
    })
    return decision
  })

  function modelOf(agent) {
    if (agent?.options?.provider && agent?.options?.model) {
      return {
        provider: agent.options.provider,
        model: agent.options.model,
        reasoningEffort: agent.options.reasoningEffort,
      }
    }
    let defaults
    try { defaults = ctx.get('agentDefaultModel') } catch { defaults = undefined }
    const selected = defaults?.currentSelection?.()
    if (selected?.provider && selected?.model) return selected
    throw new Error('no model is selected for this session')
  }

  async function complete(agent, prompt, signal) {
    const selected = modelOf(agent)
    const messages = [createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'dsh-notebook' },
    })]
    let text = ''
    for await (const chunk of ctx.llm.stream({
      provider: selected.provider,
      model: selected.model,
      reasoningEffort: selected.reasoningEffort,
      system: 'You write notebook artifacts from supplied passages only.',
      messages,
      maxTokens: 4096,
      signal,
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
      if (chunk.type === 'error') throw new Error(chunk.error?.message || 'generation failed')
    }
    const trimmed = text.trim()
    if (trimmed === '') throw new Error('model returned an empty artifact')
    return trimmed
  }

  function startGenerate(agent, notebookId, kind, userPrompt) {
    const notebook = library.getNotebook(notebookId)
    if (!notebook) return { ok: false, error: 'notebook not found' }
    const found = library.search(notebookId, userPrompt || notebook.title, limits.topK)
    const artifact = library.createArtifact(notebookId, {
      kind,
      title: kind,
      prompt: userPrompt,
    })
    const prompt = studioPrompt(kind, notebook, found, userPrompt)
    let jobId
    try {
      jobId = ctx.jobs.start({
        kind: 'notebook-generate',
        label: kind + ' · ' + notebook.title,
        owner: agent,
        run() {
          const controller = new AbortController()
          const done = (async () => {
            try {
              const body = await complete(agent, prompt, controller.signal)
              library.finishArtifact(artifact.id, 'done', body, '')
              return { status: 'completed', output: body.slice(0, 8000), detail: artifact.id }
            } catch (error) {
              const message = error?.message || String(error)
              try { library.finishArtifact(artifact.id, 'failed', '', message) } catch {}
              if (controller.signal.aborted) return { status: 'killed', detail: message }
              return { status: 'failed', detail: message }
            }
          })()
          return { cancel() { controller.abort() }, done }
        },
      })
    } catch (error) {
      library.finishArtifact(artifact.id, 'failed', '', error.message)
      return { ok: false, error: error.message, artifactId: artifact.id }
    }
    return { ok: true, kind: 'background', jobId, artifactId: artifact.id }
  }

  function bound(exec) {
    const sessionId = exec.agent?.id
    if (!sessionId) return { ok: false, error: 'no session' }
    const notebookId = library.binding(sessionId)
    if (!notebookId) return { ok: false, error: 'this session is not bound to a notebook' }
    return { ok: true, sessionId, notebookId }
  }

  function tool(name, description, parameters, execute) {
    ctx.tools.register(defineTool({
      name,
      description,
      parameters,
      output: {
        schema: { type: 'json' },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }]
        },
      },
      async execute(args, exec) {
        try {
          return await execute(args, exec)
        } catch (error) {
          return { ok: false, error: error.message || String(error) }
        }
      },
    }))
  }

  tool('notebook_list', 'List notebooks in the profile library.', {}, () => ({
    ok: true,
    notebooks: library.listNotebooks(),
  }))
  tool('notebook_create', 'Create a notebook. Pass bind true to attach it to this session.', {
    title: { type: 'string', required: true, description: 'Notebook title' },
    instructions: { type: 'string', description: 'Optional custom instructions' },
    style: { type: 'string', description: 'default, learning, or custom' },
    grounding: { type: 'string', description: 'sources-only or sources-plus-tools' },
    bind: { type: 'boolean', description: 'Bind the new notebook to this session' },
  }, (args, exec) => {
    const notebook = library.createNotebook(args)
    if (args.bind) {
      if (!exec.agent?.id) return { ok: false, error: 'no session' }
      library.bind(exec.agent.id, notebook.id)
      syncRestrict(exec.agent.id)
    }
    return { ok: true, notebook }
  })
  tool('notebook_open', 'Bind this session to an existing notebook.', {
    notebookId: { type: 'string', required: true, description: 'Notebook id' },
  }, (args, exec) => {
    if (!exec.agent?.id) return { ok: false, error: 'no session' }
    if (!library.getNotebook(args.notebookId)) return { ok: false, error: 'notebook not found' }
    library.bind(exec.agent.id, args.notebookId)
    syncRestrict(exec.agent.id)
    return { ok: true, notebook: library.getNotebook(args.notebookId) }
  })
  tool('notebook_update', 'Update the bound notebook title, instructions, style, or grounding.', {
    title: { type: 'string', description: 'New title' },
    instructions: { type: 'string', description: 'Replacement instructions' },
    style: { type: 'string', description: 'default, learning, or custom' },
    grounding: { type: 'string', description: 'sources-only or sources-plus-tools' },
  }, (args, exec) => {
    const current = bound(exec)
    if (!current.ok) return current
    const notebook = library.updateNotebook(current.notebookId, args)
    syncRestrict(current.sessionId)
    return { ok: true, notebook }
  })
  tool('notebook_add_source', 'Add a text, utf-8 file, or http(s) URL source to the bound notebook.', {
    kind: { type: 'string', required: true, description: 'text, file, or url' },
    title: { type: 'string', description: 'Title for a text source' },
    text: { type: 'string', description: 'Text body when kind is text' },
    path: { type: 'string', description: 'Absolute file path when kind is file' },
    url: { type: 'string', description: 'http(s) URL when kind is url' },
  }, async (args, exec) => {
    const current = bound(exec)
    if (!current.ok) return current
    const source = args.kind === 'file'
      ? library.addFile(current.notebookId, args.path)
      : args.kind === 'url'
        ? await library.addUrl(current.notebookId, args.url)
        : args.kind === 'text'
          ? library.addText(current.notebookId, args.title, args.text)
          : null
    if (!source) return { ok: false, error: 'kind must be text, file, or url' }
    return { ok: true, source }
  })
  tool('notebook_set_sources', 'Enable or disable sources on the bound notebook. changes is a JSON array of {id, enabled}.', {
    changes: { type: 'string', required: true, description: 'JSON array of {id, enabled}' },
  }, (args, exec) => {
    const current = bound(exec)
    if (!current.ok) return current
    const changes = JSON.parse(args.changes)
    if (!Array.isArray(changes)) return { ok: false, error: 'changes must be an array' }
    return { ok: true, sources: library.setSources(current.notebookId, changes) }
  })
  tool('notebook_note', 'Create or replace a note source on the bound notebook.', {
    id: { type: 'string', description: 'Existing note id to replace' },
    title: { type: 'string', description: 'Note title' },
    text: { type: 'string', required: true, description: 'Note body' },
  }, (args, exec) => {
    const current = bound(exec)
    if (!current.ok) return current
    return { ok: true, note: library.saveNote(current.notebookId, { id: args.id, title: args.title, body: args.text }) }
  })
  tool('notebook_search', 'Search selected sources in the bound notebook.', {
    query: { type: 'string', required: true, description: 'Search query' },
  }, (args, exec) => {
    const current = bound(exec)
    if (!current.ok) return current
    return { ok: true, passages: library.search(current.notebookId, args.query, limits.topK) }
  })
  tool('notebook_generate', 'Generate a text studio artifact in the background. kind is report, study-guide, briefing, flashcards, quiz, mind-map, or data-table.', {
    kind: { type: 'string', required: true, description: 'Artifact kind' },
    prompt: { type: 'string', description: 'What the artifact should focus on' },
  }, (args, exec) => {
    const current = bound(exec)
    if (!current.ok) return current
    if (!exec.agent) return { ok: false, error: 'no session' }
    return startGenerate(exec.agent, current.notebookId, args.kind, args.prompt ?? '')
  })

  async function handle(body) {
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    if (body.op === 'state') {
      const notebookId = sessionId ? library.binding(sessionId) : null
      return {
        ok: true,
        notebooks: library.listNotebooks(),
        notebookId,
        notebook: notebookId ? library.getNotebook(notebookId) : null,
        sources: notebookId ? library.listSources(notebookId) : [],
        artifacts: notebookId ? library.listArtifacts(notebookId) : [],
      }
    }
    if (body.op === 'create') {
      const notebook = library.createNotebook(body)
      if (body.bind && sessionId) {
        library.bind(sessionId, notebook.id)
        syncRestrict(sessionId)
      }
      return { ok: true, notebook }
    }
    if (body.op === 'open') {
      if (!sessionId) return { ok: false, error: 'no session' }
      if (!library.getNotebook(body.notebookId)) return { ok: false, error: 'notebook not found' }
      library.bind(sessionId, body.notebookId)
      syncRestrict(sessionId)
      return { ok: true }
    }
    if (body.op === 'unbind') {
      if (sessionId) {
        library.unbind(sessionId)
        passages.delete(sessionId)
        syncRestrict(sessionId)
      }
      return { ok: true }
    }
    const notebookId = sessionId ? library.binding(sessionId) : null
    if (!notebookId) return { ok: false, error: 'this session is not bound to a notebook' }
    if (body.op === 'update') {
      const notebook = library.updateNotebook(notebookId, body)
      syncRestrict(sessionId)
      return { ok: true, notebook }
    }
    if (body.op === 'addText') return { ok: true, source: library.addText(notebookId, body.title, body.text) }
    if (body.op === 'addFile') return { ok: true, source: library.addFile(notebookId, body.path) }
    if (body.op === 'addUrl') return { ok: true, source: await library.addUrl(notebookId, body.url) }
    if (body.op === 'setSources') return { ok: true, sources: library.setSources(notebookId, body.changes ?? []) }
    if (body.op === 'saveNote') return { ok: true, note: library.saveNote(notebookId, body) }
    if (body.op === 'ask') {
      const question = String(body.text ?? '').trim()
      if (question === '') return { ok: false, error: '问题是空的' }
      const found = library.search(notebookId, question, limits.topK)
      const agent = ctx.agents.get(sessionId)
      if (typeof agent?.followup === 'function') {
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: question }],
          source: { kind: 'user' },
        }))
      }
      return {
        ok: true,
        sent: typeof agent?.followup === 'function',
        passages: found,
      }
    }
    if (body.op === 'generate') {
      const agent = ctx.agents.get(sessionId)
      if (!agent) return { ok: false, error: '先打开这场对话，再生成' }
      return startGenerate(agent, notebookId, body.kind, body.prompt ?? '')
    }
    if (body.op === 'artifact') {
      const artifact = library.getArtifact(body.id)
      if (!artifact || artifact.notebook_id !== notebookId) return { ok: false, error: 'artifact not found' }
      return { ok: true, artifact }
    }
    return { ok: false, error: 'unknown operation' }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-notebook/api',
    async handler(req, res) {
      try {
        if (req.method !== 'POST') {
          send(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        let authed = false
        try {
          authed = ctx.connection?.isAuthenticated?.(req) === true
        } catch (error) {
          authed = false
          send(res, 401, { ok: false, error: '登录状态无效：' + (error.message || String(error)) })
          return
        }
        if (!authed) {
          send(res, 401, { ok: false, error: '需要先登录桌面端' })
          return
        }
        const raw = await readBody(req)
        const body = raw === '' ? {} : JSON.parse(raw)
        send(res, 200, await handle(body))
      } catch (error) {
        if (!res.headersSent) send(res, 200, { ok: false, error: error.message || String(error) })
      }
    },
  }))
}
