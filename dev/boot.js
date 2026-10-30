/* Dev-only fixture host for the notebook panel. Not part of the plugin bundle. */
(function () {
  const params = new URLSearchParams(location.search)
  const scene = params.get('scene') || 'ready'
  const act = params.get('act') || ''
  if (params.get('chrome') === '0') document.body.classList.add('clean')

  const store = {
    notebooks: [
      { id: 'nb1', title: '深海样本', grounding: 'sources-only', instructions: '', style: 'learning' },
      { id: 'nb2', title: '插件架构笔记', grounding: 'sources-plus-tools', instructions: '', style: 'default' },
    ],
    binding: scene === 'fresh' || scene === 'nosession' ? null : 'nb1',
    sources: {
      nb1: scene === 'empty' || scene === 'fresh' ? [] : [
        { id: 's1', title: '潮汐与插件边界', kind: 'url', enabled: true, status: 'ready' },
        { id: 's2', title: 'notes/runtime.md', kind: 'file', enabled: true, status: 'ready' },
        { id: 's3', title: '粘贴的实验记录', kind: 'text', enabled: false, status: 'ready' },
        { id: 's4', title: '现场笔记', kind: 'note', enabled: true, status: 'indexing' },
      ],
      nb2: [],
    },
    artifacts: {
      nb1: scene === 'empty' || scene === 'fresh' ? [] : [
        { id: 'a1', notebook_id: 'nb1', kind: 'report', title: 'report', status: 'done', body: '插件是能力的最小单位。\n\n- 模型、工具、技能都可以替换\n- 引用只来自勾选的来源\n\n来源：潮汐与插件边界', error: '' },
        { id: 'a2', notebook_id: 'nb1', kind: 'quiz', title: 'quiz', status: 'failed', body: '', error: '模型没有返回内容' },
      ],
      nb2: [],
    },
  }

  function statePayload() {
    const notebookId = store.binding
    const notebook = store.notebooks.find((item) => item.id === notebookId) || null
    return {
      ok: true,
      notebooks: store.notebooks.map((item) => ({ id: item.id, title: item.title })),
      notebookId,
      notebook,
      sources: notebookId ? (store.sources[notebookId] || []) : [],
      artifacts: notebookId ? (store.artifacts[notebookId] || []).map((item) => ({
        id: item.id, kind: item.kind, status: item.status,
      })) : [],
    }
  }

  function handle(body) {
    if (scene === 'error' && body.op === 'state') {
      return { ok: false, error: '笔记本接口没有返回内容（HTTP 500）。请完全退出并重新打开桌面端。' }
    }
    if (body.op === 'state') return statePayload()
    if (body.op === 'create') {
      const notebook = {
        id: 'nb' + (store.notebooks.length + 1),
        title: body.title || '未命名笔记本',
        grounding: body.grounding || 'sources-only',
        instructions: '',
        style: 'default',
      }
      store.notebooks.push(notebook)
      store.sources[notebook.id] = []
      store.artifacts[notebook.id] = []
      if (body.bind) store.binding = notebook.id
      return { ok: true, notebook }
    }
    if (body.op === 'open') {
      if (!store.notebooks.some((item) => item.id === body.notebookId)) return { ok: false, error: 'notebook not found' }
      store.binding = body.notebookId
      return { ok: true }
    }
    const notebook = store.notebooks.find((item) => item.id === store.binding)
    if (!notebook) return { ok: false, error: 'this session is not bound to a notebook' }
    if (body.op === 'update') {
      if (body.grounding) notebook.grounding = body.grounding
      if (body.title) notebook.title = body.title
      return { ok: true, notebook }
    }
    if (body.op === 'addText') {
      const source = { id: 's' + Date.now(), title: body.title || '粘贴文本', kind: 'text', enabled: true, status: 'ready' }
      store.sources[notebook.id].push(source)
      return { ok: true, source }
    }
    if (body.op === 'addFile') {
      const source = { id: 's' + Date.now(), title: body.path || 'file', kind: 'file', enabled: true, status: 'ready' }
      store.sources[notebook.id].push(source)
      return { ok: true, source }
    }
    if (body.op === 'addUrl') {
      const source = { id: 's' + Date.now(), title: body.url || 'url', kind: 'url', enabled: true, status: 'ready' }
      store.sources[notebook.id].push(source)
      return { ok: true, source }
    }
    if (body.op === 'setSources') {
      for (const change of body.changes || []) {
        const source = (store.sources[notebook.id] || []).find((item) => item.id === change.id)
        if (source && typeof change.enabled === 'boolean') source.enabled = change.enabled
      }
      return { ok: true, sources: store.sources[notebook.id] }
    }
    if (body.op === 'ask') {
      const question = String(body.text || '').trim()
      if (!question) return { ok: false, error: '问题是空的' }
      return {
        ok: true,
        sent: scene !== 'unsent',
        passages: [
          { sourceId: 's1', ordinal: 1, title: '潮汐与插件边界', text: '插件是能力的边界。模型只看见被勾选的来源，其余世界保持安静。' },
          { sourceId: 's2', ordinal: 2, title: 'notes/runtime.md', text: '每一次运行都被记录，轨迹可以回放：步骤、工具和模型决定。' },
        ],
      }
    }
    if (body.op === 'generate') {
      const artifact = {
        id: 'a' + Date.now(),
        notebook_id: notebook.id,
        kind: body.kind,
        title: body.kind,
        status: 'done',
        body: '【' + body.kind + '】\n依据勾选来源整理。\n\n1. 能力都是插件\n2. 运行可以回放',
        error: '',
      }
      store.artifacts[notebook.id].unshift(artifact)
      return { ok: true, kind: 'background', jobId: 'job-preview', artifactId: artifact.id }
    }
    if (body.op === 'artifact') {
      const found = (store.artifacts[notebook.id] || []).find((item) => item.id === body.id)
      if (!found) return { ok: false, error: 'artifact not found' }
      return { ok: true, artifact: found }
    }
    return { ok: false, error: 'unknown operation' }
  }

  window.fetch = async function (url, options) {
    if (!String(url).includes('/dsh-notebook/api')) return Promise.reject(new Error('unexpected url ' + url))
    const body = JSON.parse(options.body || '{}')
    if (scene === 'loading' && body.op === 'state') {
      await new Promise(() => {})
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
    if (scene === 'blank') return { ok: true, status: 200, statusText: 'OK', async text() { return '' } }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() { return JSON.stringify(handle(body)) },
    }
  }

  const plugin = window.__plugins[0]
  const captured = []
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ ids: ['sess-1'], byId: {} }), subscribe: () => () => {} } },
    slots: {
      inject(_name, fn) {
        const result = fn()
        if (result && typeof result.next === 'function') {
          let step = result.next()
          while (!step.done) step = result.next()
        }
      },
      register(meta, component) {
        captured.push({ meta, component })
        return { meta, component }
      },
    },
  }
  plugin.apply(ctx)
  const main = captured.find((item) => item.meta.name === 'main' && item.meta.key === 'notebook')
  let sessionId = scene === 'nosession' ? '' : 'sess-1'
  const props = main.meta.inject ? main.meta.inject() : {}
  props.currentSessionId = () => sessionId
  props.watchSession = (listener) => {
    window.__setSession = (id) => { sessionId = id; listener() }
    return () => {}
  }
  window.ReactDOM.render(window.React.createElement(main.component, props), document.getElementById('app'))

  function when(selector, fn) {
    const start = Date.now()
    const timer = setInterval(() => {
      const node = document.querySelector(selector)
      if (node) {
        clearInterval(timer)
        fn(node)
      } else if (Date.now() - start > 3000) clearInterval(timer)
    }, 30)
  }
  if (act === 'add') when('.dsh-nb-head .dsh-nb-chip', (node) => node.click())
  if (act === 'ask') when('.dsh-nb-suggest button', (node) => node.click())
  if (act === 'artifact') when('.dsh-nb-art', (node) => node.click())
  if (act === 'ground') when('.dsh-nb-col.is-main .dsh-nb-chip, .dsh-nb-head .dsh-nb-chip:last-child', (node) => {
    const buttons = document.querySelectorAll('.dsh-nb-head .dsh-nb-chip')
    const toggle = buttons[buttons.length - 1]
    if (toggle && toggle.textContent.includes('来源')) toggle.click()
  })

  window.__nbProbe = function () {
    const active = document.activeElement
    return {
      scene,
      sources: document.querySelectorAll('.dsh-nb-source').length,
      hero: document.querySelector('.dsh-nb-hero h2')?.textContent || '',
      error: document.querySelector('.dsh-nb-error')?.textContent || '',
      bubbles: [...document.querySelectorAll('.dsh-nb-bubble')].map((node) => node.className),
      cites: document.querySelectorAll('.dsh-nb-cites span').length,
      preview: document.querySelector('.dsh-nb-preview')?.textContent?.slice(0, 80) || '',
      suggests: document.querySelectorAll('.dsh-nb-suggest button').length,
      tabs: document.querySelectorAll('.dsh-nb-tabs button').length,
      adding: !!document.querySelector('.dsh-nb-tabs'),
      grounding: [...document.querySelectorAll('.dsh-nb-head .dsh-nb-chip')].map((node) => node.textContent).join('|'),
      checked: [...document.querySelectorAll('.dsh-nb-check')].map((node) => node.checked),
      active: active ? (active.className || active.tagName) : '',
      styleBytes: document.getElementById('dsh-notebook-style')?.textContent.length || 0,
    }
  }
})()
