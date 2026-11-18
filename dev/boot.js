/* Development fixtures only. No model requests or external network access. */
(function () {
  const params = new URLSearchParams(location.search)
  const scene = params.get('scene') || 'ready'
  let authRequired = scene === 'unauthenticated'
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
    research: {},
    bindings: {},
    studySessions: {},
  }
  function studyDocument(kind) {
    return kind === 'quiz' ? { version: 1, kind, items: [
      { id: 'q1', question: '核验模型结论时，应该首先检查什么？', choices: [{ id: 'A', text: '已保存的来源原文与定位' }, { id: 'B', text: '答案看起来是否流畅' }], answer: 'A', explanation: '来源引用应保留原文与定位，才能核验结论。<script>window.__studyUnsafe=true</script>', sourceIds: ['s1'] },
      { id: 'q2', question: '运行记录应保留哪些内容？', choices: [{ id: 'A', text: '只有最终一句话' }, { id: 'B', text: '模型、工具和输出' }], answer: 'B', explanation: '运行记录保存模型、工具和输出，取消后也保留已收到的内容。', sourceIds: ['s2'] },
    ] } : { version: 1, kind: 'flashcards', items: [
      { id: 'f1', front: '为什么引用需要保留原文与定位？', back: '便于研究者核验模型给出的结论。', explanation: '引用应链接到已保存、可核对的资料。', sourceIds: ['s1'] },
      { id: 'f2', front: '取消运行后应该如何处理已收到的内容？', back: '保留已经收到的内容。', explanation: '运行记录记录模型、工具和输出，取消不会抹掉已接收内容。', sourceIds: ['s2'] },
    ] }
  }
  if (scene === 'study') {
    store.artifacts.nb1.push(
      { id: 'aq1', notebook_id: 'nb1', kind: 'quiz', title: '来源核验测验（模拟）', status: 'done', body: JSON.stringify(studyDocument('quiz')), error: '' },
      { id: 'af1', notebook_id: 'nb1', kind: 'flashcards', title: '来源核验闪卡（模拟）', status: 'done', body: JSON.stringify(studyDocument('flashcards')), error: '' },
      { id: 'abroken', notebook_id: 'nb1', kind: 'quiz', title: '旧格式测验（模拟）', status: 'done', body: '{ invalid JSON <script>window.__studyUnsafe=true</script>', error: '' },
      { id: 'aunknown', notebook_id: 'nb1', kind: 'quiz', title: '未知引用测验（模拟）', status: 'done', body: JSON.stringify({ ...studyDocument('quiz'), items: [{ ...studyDocument('quiz').items[0], sourceIds: ['outside-source'] }] }), error: '' },
    )
  }
  function studyItems(artifact, notebookId) {
    const invalid = message => Object.assign(new Error(message), { code: 'notebook/invalid-study-artifact' })
    let document
    try { document = JSON.parse(artifact.body) } catch { throw invalid('练习内容不是有效 JSON，请重新生成测验或闪卡。') }
    if (document.version !== 1 || document.kind !== artifact.kind || !Array.isArray(document.items) || !document.items.length) throw invalid('练习格式无效，请重新生成。')
    if (document.items.some(item => !item.sourceIds?.length || item.sourceIds.some(sourceId => !(store.sources[notebookId] || []).some(source => source.id === sourceId)))) throw invalid('练习引用了未知来源，请重新生成。')
    return clone(document.items)
  }
  function publicStudyItem(item, kind) {
    if (!item) return null
    return kind === 'quiz' ? { id: item.id, question: item.question, choices: clone(item.choices), sourceIds: clone(item.sourceIds) } : { id: item.id, front: item.front, sourceIds: clone(item.sourceIds) }
  }
  function mistakesFor(notebookId, artifactId) {
    const latest = new Map()
    Object.values(store.studySessions).filter(session => session.notebookId === notebookId && session.artifactId === artifactId)
      .flatMap(session => session.history).filter(attempt => attempt.gradedAt).sort((a, b) => a.gradeSequence - b.gradeSequence)
      .forEach(attempt => latest.set(attempt.itemId, attempt.correct))
    return [...latest].filter(([, correct]) => correct === false).map(([itemId]) => itemId)
  }
  function studySnapshot(session) {
    const item = session.items[session.position]
    const currentAttempt = session.history.find(attempt => attempt.itemId === item?.id) || null
    const graded = session.history.filter(attempt => attempt.gradedAt)
    const correct = graded.filter(attempt => attempt.correct).length
    const mistakeIds = mistakesFor(session.notebookId, session.artifactId)
    const related = Object.values(store.studySessions).filter(item => item.notebookId === session.notebookId && item.artifactId === session.artifactId)
    const history = related.flatMap(item => item.history.map(attempt => ({ ...attempt, studySessionId: item.id, mode: item.mode }))).sort((a, b) => a.submittedAt - b.submittedAt)
    return clone({ version: 1, studySessionId: session.id, notebookId: session.notebookId, artifactId: session.artifactId, kind: session.kind, mode: session.mode,
      status: session.completed ? 'completed' : 'active', completed: session.completed, position: session.position, total: session.items.length,
      answeredCount: session.history.length, gradedCount: graded.length, correctCount: correct,
      score: { graded: graded.length, correct, incorrect: graded.length - correct, selfReported: session.kind === 'flashcards' },
      currentItem: session.completed ? null : publicStudyItem(item, session.kind), currentAttempt: session.completed ? null : currentAttempt,
      history: history.slice(-200).map(({ gradeSequence, ...attempt }) => attempt), historyTotal: history.length, historyLimit: 200,
      sessions: related.slice(-20).map(item => ({ studySessionId: item.id, mode: item.mode, status: item.completed ? 'completed' : 'active', position: item.position, total: item.items.length, createdAt: item.createdAt, updatedAt: item.updatedAt })),
      mistakeIds, mistakeCount: mistakeIds.length, revisionChanged: false, warnings: [],
      canNext: !session.completed && !!currentAttempt?.gradedAt, createdAt: session.createdAt, updatedAt: session.updatedAt })
  }
  function handleStudy(body, notebookId) {
    try {
      if (body.op === 'studyOpen') {
        const artifact = (store.artifacts[notebookId] || []).find(item => item.id === body.artifactId)
        if (!artifact || artifact.status !== 'done' || !['quiz', 'flashcards'].includes(artifact.kind)) throw new Error('练习产物不存在或尚未完成')
        let items = studyItems(artifact, notebookId)
        const mode = body.mode === 'mistakes' ? 'mistakes' : 'all'
        let session = !body.restart && Object.values(store.studySessions).filter(item => item.notebookId === notebookId && item.artifactId === artifact.id && item.mode === mode).at(-1)
        if (!session) {
          if (mode === 'mistakes') { const mistakes = mistakesFor(notebookId, artifact.id); items = items.filter(item => mistakes.includes(item.id)) }
          session = { id: id('study'), notebookId, artifactId: artifact.id, kind: artifact.kind, mode, items, position: 0, completed: items.length === 0, history: [], requests: {}, createdAt: now(), updatedAt: now() }
          store.studySessions[session.id] = session
        }
        return { ok: true, study: studySnapshot(session) }
      }
      const session = store.studySessions[body.studySessionId]
      if (!session || session.notebookId !== notebookId) throw new Error('练习不属于当前笔记本')
      if (body.op === 'studyGet') return { ok: true, study: studySnapshot(session) }
      const fingerprint = JSON.stringify({ op: body.op, itemId: body.itemId, answer: body.answer, rating: body.rating })
      if (body.requestId && session.requests[body.requestId]) {
        if (session.requests[body.requestId] !== fingerprint) throw new Error('重复请求的内容不同')
        return { ok: true, study: studySnapshot(session) }
      }
      const item = session.items[session.position]
      if (session.completed || item?.id !== body.itemId) {
        if (body.op === 'studyNext' && session.history.some(attempt => attempt.itemId === body.itemId && attempt.gradedAt)) return { ok: true, study: studySnapshot(session) }
        throw new Error('题目已改变，请重新打开练习')
      }
      let attempt = session.history.find(entry => entry.itemId === item.id)
      if (body.op === 'studyAnswer' && !attempt) {
        if (session.kind === 'quiz' && !item.choices.some(choice => choice.id === body.answer)) throw new Error('请选择一个有效选项')
        attempt = { id: id('attempt'), itemId: item.id, item: publicStudyItem(item, session.kind), answer: String(body.answer || ''), submittedAt: now(), gradedAt: session.kind === 'quiz' ? now() : null,
          correct: session.kind === 'quiz' ? body.answer === item.answer : null, rating: null, grading: session.kind === 'quiz' ? 'automatic' : 'self-assessment',
          ...(session.kind === 'quiz' ? { correctAnswer: item.answer } : { back: item.back }), explanation: item.explanation, sourceIds: clone(item.sourceIds), gradeSequence: ++sequence }
        session.history.push(attempt)
      } else if (body.op === 'studyRate') {
        if (session.kind !== 'flashcards' || !attempt) throw new Error('请先提交回忆并显示答案')
        if (!['remembered', 'again'].includes(body.rating)) throw new Error('请选择自评结果')
        if (!attempt.gradedAt) Object.assign(attempt, { rating: body.rating, correct: body.rating === 'remembered', gradedAt: now(), gradeSequence: ++sequence })
      } else if (body.op === 'studyNext') {
        if (!attempt?.gradedAt) throw new Error('请先完成当前题的作答或自评')
        session.position += 1; session.completed = session.position >= session.items.length
      }
      if (body.requestId) session.requests[body.requestId] = fingerprint
      session.updatedAt = now()
      return { ok: true, study: studySnapshot(session) }
    } catch (error) { return { ok: false, error: error.message, code: error.code || 'notebook/rejected' } }
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
      artifacts: clone((store.artifacts[notebookId] || []).map(({ body, ...rest }) => rest)), messages: clone(store.messages[workspace?.id] || []), task: clone(store.tasks[workspace?.id] || null), research: clone(store.research[workspace?.id] || null), capabilities: { search: scene !== 'no-search', fetch: true } }
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
    if (body.op === 'researchStart') {
      if (store.tasks[workspace.id]?.status === 'running' || store.research[workspace.id]?.status === 'running') return { ok: false, error: '已经有任务在运行' }
      if (scene === 'no-search') return { ok: false, error: 'DSH 未接入网页搜索' }
      const prompt = String(body.prompt || '').trim()
      if (!prompt) return { ok: false, error: '请填写研究目标' }
      if (body.newNotebook || !workspace.notebookId) {
        const notebook = { id: id('nb'), title: body.title || prompt.slice(0, 32), grounding: 'sources-plus-tools' }
        store.notebooks.push(notebook); store.sources[notebook.id] = []; store.artifacts[notebook.id] = []; workspace.notebookId = notebook.id
      }
      workspace.provider = body.provider || workspace.provider; workspace.model = body.model || workspace.model; workspace.mode = 'research'
      const notebookId = workspace.notebookId
      const research = { id: id('research'), workspaceId: workspace.id, notebookId, prompt, targetSources: body.targetSources || 5, status: 'running', phase: 'planning', queries: [], candidates: [], imported: [], reused: [], failures: [], startedAt: now() }
      store.research[workspace.id] = research
      message(workspace, 'user', prompt)
      setTimeout(() => {
        if (research.status !== 'running') return
        research.phase = 'searching'; research.queries = [prompt, prompt + ' 官方资料']
        research.candidates = Array.from({ length: research.targetSources }, (_, index) => ({ url: 'https://example.org/auto-research/' + (index + 1), title: '模拟研究来源 ' + (index + 1), status: 'discovered' }))
      }, 100)
      setTimeout(() => {
        if (research.status !== 'running') return
        if (scene === 'research-failed') { research.status = 'failed'; research.phase = 'completed'; research.error = '开发预览：搜索服务调用失败'; research.failures.push({ tool: 'web_search', message: research.error }); return }
        research.phase = 'importing'
        const count = scene === 'research-partial' ? Math.min(2, research.targetSources - 1) : scene === 'research-slow' ? 1 : research.targetSources
        for (const candidate of research.candidates.slice(0, count)) {
          const source = { id: id('s'), title: candidate.title, kind: 'url', url: candidate.url, enabled: true, status: 'ready', provenance: { via: 'dsh-web-fetch', requestedUrl: candidate.url, fetchedAt: now(), truncated: candidate === research.candidates[0] }, body: '开发预览中的模拟网页正文。\n\n本来源用于检查自动构建的保存、引用与取消流程。研究目标：' + prompt }
          store.sources[notebookId].push(source)
          candidate.status = 'imported'; candidate.sourceId = source.id
          research.imported.push({ sourceId: source.id, title: source.title, url: source.url, truncated: source.provenance.truncated })
        }
        research.completedSources = research.imported.length
        if (scene === 'research-partial') for (const candidate of research.candidates.slice(count)) { candidate.status = 'failed'; research.failures.push({ tool: 'notebook_add_source', url: candidate.url, message: '开发预览：网页无法读取' }) }
      }, 450)
      setTimeout(() => {
        if (research.status !== 'running') return
        research.phase = 'synthesizing'
      }, scene === 'research-slow' ? 13000 : 2300)
      setTimeout(() => {
        if (research.status !== 'running') return
        const artifact = { id: id('a'), notebook_id: notebookId, kind: 'study-guide', title: '自动研究学习指南', status: 'done', body: '【开发预览 · 自动研究学习指南】\n\n研究目标：' + prompt + '\n\n阅读路线：先理解概念，再比较方法，最后用资料验证结论。\n\n来源：' + research.imported.map(item => '[' + item.sourceId + ']').join(' '), error: '' }
        store.artifacts[notebookId].unshift(artifact)
        research.artifactId = artifact.id; research.artifactStatus = 'done'; research.status = scene === 'research-partial' ? 'partial' : 'done'; research.phase = 'completed'; research.finishedAt = now()
        message(workspace, 'assistant', '开发预览：已保存 ' + research.imported.length + ' 个来源，并整理了学习指南。')
      }, scene === 'research-slow' ? 15000 : 2800)
      return { ok: true, research: clone(research) }
    }
    if (body.op === 'chat') {
      if (store.tasks[workspace.id]?.status === 'running' || store.research[workspace.id]?.status === 'running') return { ok: false, error: '已经有任务在运行' }
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
      const research = store.research[workspace.id]
      if (research?.status === 'running') { research.status = 'cancelled'; research.phase = 'completed'; research.finishedAt = now(); message(workspace, 'system', '已停止自动构建，已保存来源保留。') }
      const task = store.tasks[workspace.id]
      if (task?.status === 'running') { task.status = 'cancelled'; task.phase = '已停止'; message(workspace, 'system', '已停止本次模型运行。') }
      return { ok: true }
    }
    const notebookId = workspace.notebookId
    const notebook = store.notebooks.find(item => item.id === notebookId)
    if (!notebook) return { ok: false, error: '请先创建或选择笔记本' }
    if (body.op.startsWith('study')) return handleStudy(body, notebookId)
    if (body.op === 'update') { Object.assign(notebook, Object.fromEntries(['title', 'grounding'].filter(key => key in body).map(key => [key, body[key]]))); return { ok: true, notebook: clone(notebook) } }
    if (['addText', 'addFile', 'addUrl', 'saveNote'].includes(body.op)) {
      const source = { id: id('s'), title: body.title || body.path || body.url || '粘贴文本', kind: body.op === 'saveNote' ? 'note' : body.op === 'addFile' ? 'file' : body.op === 'addUrl' ? 'url' : 'text', enabled: true, status: 'ready', body: body.body || body.text || '开发预览中的文件或网页原文。' }
      store.sources[notebookId].push(source); return { ok: true, source: clone(source), ...(body.op === 'saveNote' ? { note: clone(source) } : {}) }
    }
    if (body.op === 'setSources') { for (const change of body.changes || []) { const source = store.sources[notebookId].find(item => item.id === change.id); if (source) source.enabled = change.enabled }; return { ok: true } }
    const source = store.sources[notebookId].find(item => item.id === body.id)
    if (body.op === 'source') return source ? { ok: true, source: clone(source) } : { ok: false, error: '来源不存在' }
    if (body.op === 'renameSource') { if (!source) return { ok: false, error: '来源不存在' }; source.title = body.title; return { ok: true } }
    if (body.op === 'deleteSource') { store.sources[notebookId] = store.sources[notebookId].filter(item => item.id !== body.id); return { ok: true } }
    if (body.op === 'generate') {
      const artifact = { id: id('a'), notebook_id: notebookId, kind: body.kind, title: body.kind, status: 'running', body: '', error: '' }
      store.artifacts[notebookId].unshift(artifact)
      setTimeout(() => {
        artifact.status = 'done'
        if (['quiz', 'flashcards'].includes(body.kind)) {
          const document = studyDocument(body.kind)
          const sources = store.sources[notebookId].filter(source => source.enabled && source.status === 'ready')
          document.items.forEach((item, index) => { item.sourceIds = sources.length ? [sources[index % sources.length].id] : [] })
          artifact.body = JSON.stringify(document)
        } else artifact.body = '【开发预览 · ' + body.kind + '】\n\n根据勾选资料整理的模拟产物。\n\n1. 工作台可以独立使用\n2. 后台任务完成后自动刷新\n3. 引用需要核对来源原文'
      }, 650)
      return { ok: true, kind: 'background', jobId: id('job'), artifactId: artifact.id }
    }
    if (body.op === 'artifact') { const artifact = store.artifacts[notebookId].find(item => item.id === body.id); return artifact ? { ok: true, artifact: clone(artifact) } : { ok: false, error: '产物不存在' } }
    return { ok: false, error: '未知操作：' + body.op }
  }
  const requests = []
  window.fetch = async function (url, options) {
    if (!String(url).includes('/dsh-notebook/api')) throw new Error('开发预览禁止外部请求：' + url)
    const raw = JSON.parse(options.body || '{}')
    const rpc = raw.type === 'client-request'
    if (rpc && (raw.method !== 'dsh-notebook/api' || typeof raw.rpcId !== 'string')) throw new Error('开发预览：无效的宿主 RPC 请求')
    const body = rpc ? raw.payload : raw
    requests.push({ url: String(url), rpc, method: raw.method, op: body.op, ...(body.op.startsWith('study') ? { payload: clone(body) } : {}) })
    if (scene === 'loading' && body.op === 'state') await new Promise(() => {})
    await new Promise(resolve => setTimeout(resolve, 20))
    if (scene === 'blank') return { ok: true, status: 200, async text() { return '' } }
    const payload = authRequired ? { ok: false, error: '需要先登录桌面端' } : handle(body)
    const result = rpc ? { type: 'server-response', rpcId: raw.rpcId, result: { ok: true, value: payload } } : payload
    return { ok: true, status: 200, statusText: 'OK', async text() { return JSON.stringify(result) } }
  }
  const captured = []
  const ctx = { connection: { rpc: { async call(channel, endpoint, payload) {
    const rpcId = id('rpc')
    const response = await window.fetch((channel + '/' + endpoint).slice(1), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }) })
    if (!response.ok) throw new Error('transport failure: HTTP ' + response.status)
    const envelope = JSON.parse(await response.text())
    if (envelope.type !== 'server-response' || envelope.rpcId !== rpcId) throw new Error('开发预览：无效的宿主 RPC 响应')
    return envelope.result
  } } }, sessions: { list: { getSnapshot: () => ({ ids: ['sess-1'], byId: {} }), subscribe: () => () => {} } }, slots: {
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
  window.__nbDev = { store, handle, requests, setAuthenticated(value) { authRequired = !value } }
  function when(selector, fn) { const start = now(); const timer = setInterval(() => { const node = document.querySelector(selector); if (node) { clearInterval(timer); fn(node) } else if (now() - start > 3000) clearInterval(timer) }, 30) }
  if (act === 'add') when('[data-action="open-add-source"]', node => node.click())
  if (act === 'artifact') when('.dsh-nb-art', node => node.click())
  if (act === 'ask') when('.dsh-nb-suggest button:not([data-action="hero-research"]):not(:disabled)', node => { node.click(); setTimeout(() => document.querySelector('.dsh-nb-send')?.click(), 40) })
  window.__nbProbe = () => ({ scene, workspaceId: document.querySelector('.dsh-nb-workbench')?.dataset.workspaceId, sources: document.querySelectorAll('.dsh-nb-source').length, messages: [...document.querySelectorAll('.dsh-nb-message')].map(node => node.className), error: document.querySelector('.dsh-nb-error')?.textContent || '', task: document.querySelector('.dsh-nb-task')?.textContent || '', preview: document.querySelector('.dsh-nb-preview')?.textContent || '', route: [...document.querySelectorAll('.dsh-nb-model-select')].map(node => JSON.stringify([node.dataset.provider, node.dataset.model])), mode: document.querySelector('.dsh-nb-mode button.on')?.textContent })
})()
