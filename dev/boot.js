/* Dev-only preview boot for src/client.js. Mocks the host module loader and /dsh-notebook/api. */
(function () {
  const params = new URLSearchParams(location.search)
  if (params.get('motion') === 'reduce') {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      if (String(query).includes('prefers-reduced-motion')) {
        return { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
      }
      return real(query)
    }
  }

  const full = {
    ok: true,
    notebooks: [
      { id: 'nb1', title: '深海资料' },
      { id: 'nb2', title: '经济笔记' },
    ],
    notebookId: 'nb1',
    notebook: { id: 'nb1', title: '深海资料', grounding: 'sources-only', instructions: '', style: 'default' },
    sources: [
      { id: 's1', title: '光合作用笔记.md', kind: 'file', enabled: true, status: 'ready' },
      { id: 's2', title: '供应链评论', kind: 'url', enabled: true, status: 'ready' },
      { id: 's3', title: '粘贴的实验记录', kind: 'text', enabled: false, status: 'ready' },
      { id: 's4', title: '会议纪要', kind: 'note', enabled: true, status: 'indexing' },
    ],
    artifacts: [
      { id: 'a1', kind: 'report', status: 'done' },
      { id: 'a2', kind: 'quiz', status: 'failed' },
    ],
  }
  const empty = { ok: true, notebooks: [], notebookId: null, notebook: null, sources: [], artifacts: [] }
  const scenes = { full, empty }

  window.fetch = async function (url, options) {
    const body = JSON.parse((options && options.body) || '{}')
    const delay = Number(params.get('delay') || 0)
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    if (params.get('fail') === '1' && body.op === 'state') {
      return json({ ok: false, error: '需要先登录桌面端' })
    }
    if (body.op === 'state') return json(scenes[params.get('scene')] || full)
    if (body.op === 'ask') {
      return json({
        ok: true,
        sent: true,
        passages: [
          { sourceId: 's1', ordinal: 0, title: '光合作用笔记.md', text: '叶绿体在光照下把二氧化碳和水变成糖，并释放氧气。' },
          { sourceId: 's2', ordinal: 1, title: '供应链评论', text: '价格上升时需求通常下降，供给则沿曲线增加。' },
        ],
      })
    }
    if (body.op === 'artifact') {
      return json({
        ok: true,
        artifact: {
          id: body.id,
          kind: body.id === 'a2' ? 'quiz' : 'report',
          status: 'done',
          body: '# 深海资料 · 报告\n\n来源只覆盖光合作用与供需两条线索。\n\n- 光合作用：光能转为糖\n- 供需：价格把两条曲线拉开\n\n结论应逐条回到勾选的来源，不要补出来源外的数字。',
        },
      })
    }
    return json({ ok: true })
  }

  function json(payload) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    }
  }

  window.__ModuleLoader__ = {
    load({ factory }) {
      window.__dshNotebookMod = factory((id) => {
        if (id === 'react') return window.React
        throw new Error('unexpected require ' + id)
      })
    },
  }

  const script = document.createElement('script')
  script.src = '../src/client.js'
  script.onload = mount
  document.body.appendChild(script)

  function mount() {
    const mod = window.__dshNotebookMod
    let Panel = null
    mod.apply({
      sessions: { list: { getSnapshot() { return { ids: [] } }, subscribe() { return function () {} } } },
      slots: {
        inject(_name, fn) {
          const result = fn()
          if (result && typeof result.next === 'function') {
            let step = result.next()
            while (!step.done) step = result.next()
          }
        },
        register(meta, component) {
          if (meta.name === 'main') Panel = component
          return component
        },
      },
    })
    const sessionId = params.get('session') === '0' ? '' : 'sess-1'
    ReactDOM.createRoot(document.getElementById('host')).render(
      React.createElement(Panel, {
        currentSessionId: () => sessionId,
        watchSession() { return function () {} },
      }),
    )
    drive()
  }

  async function drive() {
    const act = params.get('act')
    if (!act) {
      document.documentElement.dataset.ready = '1'
      return
    }
    for (let i = 0; i < 50; i++) {
      if (act === 'ask') {
        const button = document.querySelector('.dsh-nb-suggest button')
        if (button) {
          button.click()
          await waitFor(() => document.querySelector('.dsh-nb-cites'))
          document.documentElement.dataset.ready = '1'
          return
        }
      } else if (act === 'add') {
        const button = document.querySelector('.dsh-nb-head .dsh-nb-chip')
        if (button) {
          button.click()
          document.documentElement.dataset.ready = '1'
          return
        }
      } else if (act === 'artifact') {
        const button = document.querySelector('.dsh-nb-art')
        if (button) {
          button.click()
          await waitFor(() => document.querySelector('.dsh-nb-preview'))
          document.documentElement.dataset.ready = '1'
          return
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    document.documentElement.dataset.ready = 'missing'
  }

  async function waitFor(check) {
    for (let i = 0; i < 50; i++) {
      if (check()) return
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  }
})()
