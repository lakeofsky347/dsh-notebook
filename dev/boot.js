/* Development fixtures only. No model requests or external network access. */
(function () {
  const params = new URLSearchParams(location.search)
  const scene = params.get('scene') || 'ready'
  const act = params.get('act') || ''
  if (params.get('chrome') === '0') document.body.classList.add('clean')
  const clone = value => JSON.parse(JSON.stringify(value))
  let sequence = 10
  const id = prefix => prefix + (++sequence)
  const now = () => Date.now()
  const store = {
    workspaces: scene === 'fresh' ? [] : [
      { id: 'ws1', title: '海洋资料研究', provider: 'dev-local', model: 'fixture-research', mode: 'research', notebookId: 'nb1', createdAt: now(), updatedAt: now() },
      { id: 'ws2', title: '插件架构笔记', provider: 'dev-local', model: 'fixture-compact', mode: 'sources', notebookId: 'nb2', createdAt: now(), updatedAt: now() },
    ],
    notebooks: [
      { id: 'nb1', title: '深海样本', grounding: 'sources-plus-tools', instructions: '', style: 'learning' },
      { id: 'nb2', title: '插件架构笔记', grounding: 'sources-only', instructions: '', style: 'default' },
    ],
    sources: {
      nb1: scene === 'empty' || scene === 'fresh' ? [] : [
        { id: 's1', title: '潮汐与插件边界', kind: 'url', enabled: true, status: 'ready', url: 'https://example.org/research', body: '插件是能力的边界。模型、工具与资料库可以独立配置。\n\n来源引用应保留原文与定位，以便研究者核验。' },
        { id: 's2', title: 'notes/runtime.md', kind: 'file', enabled: true, status: 'ready', path: '/demo/notes/runtime.md', body: '# 运行记录\n每一次运行都保存模型、工具和输出。\n取消运行后保留已经收到的内容。' },
        { id: 's3', title: '粘贴的实验记录', kind: 'text', enabled: false, status: 'ready', body: '实验记录：只使用选定资料进行回答。' },
        { id: 's4', title: '现场笔记', kind: 'note', enabled: true, status: 'ready', body: '工作台可以独立管理会话、来源、模型与产物。' },
      ],
      nb2: [],
    },
    artifacts: { nb1: scene === 'empty' || scene === 'fresh' ? [] : [{ id: 'a1', notebook_id: 'nb1', kind: 'report', title: '研究报告', status: 'done', body: '# 插件能力与边界\n\n工作台管理资料和生成任务。\n\n- 模型、工具、技能可以替换。\n- 引用应来自已选来源。', error: '' }], nb2: [] },
    messages: { ws1: [], ws2: [] },
    tasks: {},
    bindings: {},
  }
  const catalog = {
    providers: scene === 'empty-models' ? [] : [
      { id: 'dev-local', name: '开发预览 · 模拟模型', models: [{ id: 'fixture-research', name: '研究模型（模拟）' }, { id: 'fixture-compact', name: '轻量模型（模拟）' }] },
      { id: 'dev-secondary', name: '开发预览 · 第二提供方', models: [{ id: 'fixture-other', name: '备用模型（模拟）' }] },
    ],
  }
  function findWorkspace(body) { return store.workspaces.find(item => item.id === body.workspaceId) || (!body.workspaceId ? store.workspaces[0] : null) }
  function statePayload(body) {
    const workspace = findWorkspace(body)
    const notebookId = workspace?.notebookId || null
    return { ok: true, workspaces: clone(store.workspaces), workspace: clone(workspace || null), workspaceId: workspace?.id || null, notebooks: clone(store.notebooks), notebookId,
      notebook: clone(store.notebooks.find(item => item.id === notebookId) || null), sources: clone((store.sources[notebookId] || []).map(({ body, ...rest }) => rest)),
      artifacts: clone((store.artifacts[notebookId] || []).map(({ body, ...rest }) => rest)), messages: clone(store.messages[workspace?.id] || []), task: clone(store.tasks[workspace?.id] || null), capabilities: { search: scene !== 'no-search', fetch: true } }
  }
  function message(workspace, role, text, extra) {
    const item = { id: id('m'), role, text, status: 'done', createdAt: now(), ...extra }
    ;(store.messages[workspace.id] ||= []).push(item)
    return item
  }
  function ensureNotebook(workspace) {
    if (workspace.notebookId) return workspace.notebookId
    const notebook = { id: id('nb'), title: workspace.title + ' · 资料', grounding: workspace.mode === 'sources' ? 'sources-only' : 'sources-plus-tools' }
    store.notebooks.push(notebook); store.sources[notebook.id] = []; store.artifacts[notebook.id] = []; workspace.notebookId = notebook.id
    return notebook.id
  }
  function handle(body) {
    if (body.op === 'catalog') return { ok: true, ...catalog }
    if (body.op === 'state') {
      if (scene === 'error') return { ok: false, error: '开发预览：无法读取工作台。请稍后重试。' }
      if (body.workspaceId && !findWorkspace(body)) return { ok: false, error: 'workspace not found' }
      return statePayload(body)
    }
    if (body.op === 'workspaceCreate') {
      const workspace = { id: id('ws'), title: body.title || '新的研究', provider: '', model: '', mode: 'research', notebookId: null, createdAt: now(), updatedAt: now() }
      store.workspaces.push(workspace); store.messages[workspace.id] = []
      return { ok: true, workspace: clone(workspace), workspaceId: workspace.id }
    }
    const workspace = findWorkspace(body)
    if (!workspace) return { ok: false, error: '工作台不存在' }
    if (body.op === 'workspaceUpdate') {
      for (const key of ['title', 'provider', 'model', 'mode']) if (typeof body[key] === 'string') workspace[key] = body[key]
      workspace.updatedAt = now()
      return { ok: true, workspace: clone(workspace) }
    }
    if (body.op === 'bindSession') {
      if (!body.sessionId) return { ok: false, error: '请先打开宿主对话' }
      store.bindings[body.sessionId] = workspace.notebookId
      return { ok: true }
    }
    if (body.op === 'create') {
      const notebook = { id: id('nb'), title: body.title || '未命名笔记本', grounding: body.grounding || 'sources-plus-tools' }
      store.notebooks.push(notebook); store.sources[notebook.id] = []; store.artifacts[notebook.id] = []
      if (body.bind) workspace.notebookId = notebook.id
      return { ok: true, notebook: clone(notebook) }
    }
    if (body.op === 'open') {
      if (!store.notebooks.some(item => item.id === body.notebookId)) return { ok: false, error: '笔记本不存在' }
      workspace.notebookId = body.notebookId
      return { ok: true }
    }
    if (body.op === 'chat') {
      if (store.tasks[workspace.id]?.status === 'running') return { ok: false, error: '已经有任务在运行' }
      const text = String(body.text || '').trim()
      if (!text) return { ok: false, error: '问题是空的' }
      workspace.provider = body.provider || workspace.provider; workspace.model = body.model || workspace.model; workspace.mode = body.mode || workspace.mode
      message(workspace, 'user', text)
      const task = { id: id('task'), status: 'running', phase: 'preparing', provider: workspace.provider, model: workspace.model }
      store.tasks[workspace.id] = task
      setTimeout(() => {
        if (task.status !== 'running') return
        task.phase = workspace.mode === 'sources' ? 'thinking' : 'tool:web_search'
        if (workspace.mode === 'research') message(workspace, 'assistant', '', { content: [{ type: 'tool-call', name: 'web_search' }] })
        if (workspace.mode === 'research') message(workspace, 'tool', '开发预览：正在搜索与研究目标有关的资料…', { toolName: 'search_web' })
      }, 120)
      setTimeout(() => {
        if (task.status !== 'running') return
        if (scene === 'chat-error' || text.includes('模拟失败')) { task.status = 'failed'; task.error = '开发预览：模拟模型请求失败'; return }
        if (workspace.mode === 'research') {
          const notebookId = ensureNotebook(workspace)
          const source = { id: id('s'), title: '研究资料 · ' + text.slice(0, 18), kind: 'text', enabled: true, status: 'ready', body: '这是开发预览生成的模拟资料，用于验证工具执行后工作台会刷新来源。\n研究目标：' + text }
          store.sources[notebookId].push(source)
          message(workspace, 'tool', '已将研究资料加入笔记本「' + store.notebooks.find(item => item.id === notebookId).title + '」。', { toolName: 'notebook_add_source' })
        }
        message(workspace, 'assistant', workspace.mode === 'sources' ? '这是开发预览中的模拟回答。\n\n已依据勾选资料整理：插件负责管理能力边界，工作台负责保存研究会话、来源和生成产物。' : '这是开发预览中的模拟回答。\n\n已围绕你的目标整理资料并加入笔记本。你可以在左侧检查来源原文，再切换到「资料问答」继续核对证据。')
        task.status = 'done'; task.phase = '完成'
      }, scene === 'slow' ? 15000 : 550)
      return { ok: true, task: clone(task) }
    }
    if (body.op === 'cancel') {
      const task = store.tasks[workspace.id]
      if (task?.status === 'running') { task.status = 'cancelled'; task.phase = '已停止'; message(workspace, 'system', '已停止本次模型运行。') }
      return { ok: true }
    }
    const notebookId = workspace.notebookId
    const notebook = store.notebooks.find(item => item.id === notebookId)
    if (!notebook) return { ok: false, error: '请先创建或选择笔记本' }
    if (body.op === 'update') { Object.assign(notebook, Object.fromEntries(['title', 'grounding'].filter(key => key in body).map(key => [key, body[key]]))); return { ok: true, notebook: clone(notebook) } }
    if (['addText', 'addFile', 'addUrl'].includes(body.op)) {
      const source = { id: id('s'), title: body.title || body.path || body.url || '粘贴文本', kind: body.op === 'addFile' ? 'file' : body.op === 'addUrl' ? 'url' : 'text', enabled: true, status: 'ready', body: body.text || '开发预览中的文件或网页原文。' }
      store.sources[notebookId].push(source); return { ok: true, source: clone(source) }
    }
    if (body.op === 'setSources') { for (const change of body.changes || []) { const source = store.sources[notebookId].find(item => item.id === change.id); if (source) source.enabled = change.enabled }; return { ok: true } }
    const source = store.sources[notebookId].find(item => item.id === body.id)
    if (body.op === 'source') return source ? { ok: true, source: clone(source) } : { ok: false, error: '来源不存在' }
    if (body.op === 'renameSource') { if (!source) return { ok: false, error: '来源不存在' }; source.title = body.title; return { ok: true } }
    if (body.op === 'deleteSource') { store.sources[notebookId] = store.sources[notebookId].filter(item => item.id !== body.id); return { ok: true } }
    if (body.op === 'generate') {
      const artifact = { id: id('a'), notebook_id: notebookId, kind: body.kind, title: body.kind, status: 'running', body: '', error: '' }
      store.artifacts[notebookId].unshift(artifact)
      setTimeout(() => { artifact.status = 'done'; artifact.body = '【开发预览 · ' + body.kind + '】\n\n根据勾选资料整理的模拟产物。\n\n1. 工作台可以独立使用\n2. 后台任务完成后自动刷新\n3. 引用需要核对来源原文' }, 650)
      return { ok: true, kind: 'background', jobId: id('job'), artifactId: artifact.id }
    }
    if (body.op === 'artifact') { const artifact = store.artifacts[notebookId].find(item => item.id === body.id); return artifact ? { ok: true, artifact: clone(artifact) } : { ok: false, error: '产物不存在' } }
    return { ok: false, error: '未知操作：' + body.op }
  }
  window.fetch = async function (url, options) {
    if (!String(url).includes('/dsh-notebook/api')) throw new Error('开发预览禁止外部请求：' + url)
    const body = JSON.parse(options.body || '{}')
    if (scene === 'loading' && body.op === 'state') await new Promise(() => {})
    await new Promise(resolve => setTimeout(resolve, 20))
    if (scene === 'blank') return { ok: true, status: 200, async text() { return '' } }
    const payload = handle(body)
    return { ok: true, status: 200, statusText: 'OK', async text() { return JSON.stringify(payload) } }
  }
  const captured = []
  const ctx = { sessions: { list: { getSnapshot: () => ({ ids: ['sess-1'], byId: {} }), subscribe: () => () => {} } }, slots: {
    inject(_name, fn) { const result = fn(); if (result?.next) { let step = result.next(); while (!step.done) step = result.next() } },
    register(meta, component) { captured.push({ meta, component }); return { meta, component } },
  } }
  window.__plugins[0].apply(ctx)
  const main = captured.find(item => item.meta.name === 'main' && item.meta.key === 'notebook')
  let sessionId = scene === 'nosession' ? '' : 'sess-1'
  const props = main.meta.inject ? main.meta.inject() : {}
  props.currentSessionId = () => sessionId
  props.watchSession = listener => { window.__setSession = id => { sessionId = id; listener() }; return () => {} }
  window.ReactDOM.render(window.React.createElement(main.component, props), document.getElementById('app'))
  window.__nbDev = { store, handle }
  function when(selector, fn) { const start = now(); const timer = setInterval(() => { const node = document.querySelector(selector); if (node) { clearInterval(timer); fn(node) } else if (now() - start > 3000) clearInterval(timer) }, 30) }
  if (act === 'add') when('.dsh-nb-head .dsh-nb-chip', node => node.click())
  if (act === 'artifact') when('.dsh-nb-art', node => node.click())
  if (act === 'ask') when('.dsh-nb-suggest button:not(:disabled)', node => { node.click(); setTimeout(() => document.querySelector('.dsh-nb-send')?.click(), 40) })
  window.__nbProbe = () => ({ scene, workspaceId: document.querySelector('.dsh-nb-workspaces')?.value, sources: document.querySelectorAll('.dsh-nb-source').length, messages: [...document.querySelectorAll('.dsh-nb-message')].map(node => node.className), error: document.querySelector('.dsh-nb-error')?.textContent || '', task: document.querySelector('.dsh-nb-task')?.textContent || '', preview: document.querySelector('.dsh-nb-preview')?.textContent || '', route: [...document.querySelectorAll('.dsh-nb-route select')].map(node => node.value), mode: document.querySelector('.dsh-nb-mode button.on')?.textContent })
})()
