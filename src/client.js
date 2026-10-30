const PANEL_ID = 'notebook'
window.__ModuleLoader__.load({
  id: 'dsh-notebook',
  factory(require) {
    const React = require('react')
    const { useEffect, useState } = React
    const h = React.createElement
    const STUDIO = [
      ['study-guide', '学习指南', '提纲和自测'],
      ['briefing', '简报', '一页讲清'],
      ['report', '报告', '带来源引用'],
      ['flashcards', '闪卡', '正反面记忆'],
      ['quiz', '测验', '检查理解'],
      ['mind-map', '思维导图', '主题与分支'],
      ['data-table', '数据表', '抽出表格'],
    ]
    const SUGGEST = ['总结这些来源', '列出关键概念', '这些资料有什么分歧？']
    function ensureStyles() {
      let tag = document.getElementById('dsh-notebook-style')
      if (!tag) {
        tag = document.createElement('style')
        tag.id = 'dsh-notebook-style'
        document.head.appendChild(tag)
      }
      tag.textContent = ".dsh-nb{height:100%;min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr) 280px;color:#fff;font:14px/1.4 ui-sans-serif,system-ui,sans-serif;background:#000;background-image:radial-gradient(rgba(255,255,255,.22) .7px,transparent .8px);background-size:16px 16px}.dsh-nb *{box-sizing:border-box}.dsh-nb button,.dsh-nb input,.dsh-nb textarea,.dsh-nb select{font:inherit;color:inherit}.dsh-nb button{cursor:pointer}.dsh-nb-col{min-width:0;min-height:0;display:flex;flex-direction:column;background:transparent}.dsh-nb-head{height:56px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 20px;font-size:13px;font-weight:500;color:rgba(255,255,255,.72)}.dsh-nb-chip{border:1px solid rgba(255,255,255,.16);background:transparent;color:#fff;border-radius:999px;padding:6px 12px}.dsh-nb-chip:hover{background:#fff;color:#000}.dsh-nb-scroll{overflow:auto;padding:0 12px 16px}.dsh-nb-source{display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.08);background:transparent;padding:10px 8px;color:#fff}.dsh-nb-mark{width:22px;height:22px;border-radius:999px;display:grid;place-items:center;background:#fff;color:#000;flex:none;font-size:11px;font-weight:650}.dsh-nb-title{font-weight:500}.dsh-nb-meta{font-size:12px;color:rgba(255,255,255,.48)}.dsh-nb-check{width:14px;height:14px;margin:0;accent-color:#fff}.dsh-nb-form{display:grid;gap:8px;padding:0 20px 16px}.dsh-nb-field{width:100%;border:0;border-bottom:1px solid rgba(255,255,255,.16);border-radius:0;background:transparent;padding:8px 0;color:#fff}.dsh-nb-field:focus{outline:none;border-bottom-color:#fff}.dsh-nb-hero{margin:0;text-align:left;max-width:none;padding:8px 28px 28px}.dsh-nb-hero h2{font-size:56px;line-height:.95;font-weight:600;letter-spacing:-.045em;margin:0 0 16px;color:#fff}.dsh-nb-suggest{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start;margin-top:20px}.dsh-nb-suggest button{border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff;padding:8px 14px}.dsh-nb-suggest button:hover{background:#fff;color:#000}.dsh-nb-thread{flex:1;overflow:auto;padding:8px 28px 18px;display:flex;flex-direction:column;gap:16px}.dsh-nb-bubble{max-width:100%;padding:0;border-radius:0;white-space:pre-wrap;background:transparent}.dsh-nb-bubble.user{font-size:22px;line-height:1.15;letter-spacing:-.03em;font-weight:560}.dsh-nb-bubble.assistant{color:rgba(255,255,255,.72);font-size:14px}.dsh-nb-cites{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.dsh-nb-cites span{font-size:12px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.16);color:#fff}.dsh-nb-composer{margin:0 20px 20px;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:8px 8px 8px 16px;display:flex;gap:8px;align-items:center;background:#000}.dsh-nb-composer textarea{flex:1;border:0;resize:none;background:transparent;min-height:24px;max-height:96px;outline:none;color:#fff}.dsh-nb-send{width:32px;height:32px;border:0;border-radius:999px;background:#fff;color:#000}.dsh-nb-send:disabled{opacity:.3}.dsh-nb-studio{overflow:auto;padding:0 8px 16px;display:grid;grid-template-columns:1fr;gap:0}.dsh-nb-card{text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.08);border-radius:0;background:transparent;padding:14px 12px;min-height:0;color:#fff;display:flex;justify-content:space-between;gap:12px}.dsh-nb-card strong{margin:0;font-weight:560}.dsh-nb-card span{color:rgba(255,255,255,.48)}.dsh-nb-art{text-align:left;border:0;background:transparent;color:rgba(255,255,255,.72);padding:8px 12px}.dsh-nb-preview{margin:12px 20px;max-height:240px;overflow:auto;white-space:pre-wrap;color:rgba(255,255,255,.82)}.dsh-nb-error{margin:0 20px 8px;color:#fff}.dsh-nb-tabs{display:flex;gap:8px}.dsh-nb-tabs button{border-radius:999px;border:1px solid rgba(255,255,255,.16);background:transparent;color:#fff;padding:4px 10px}.dsh-nb-tabs button.on{background:#fff;color:#000}.dsh-nb-sea{position:relative;height:120px;margin:0 20px;overflow:hidden;background:transparent}.dsh-nb-sea.live{height:188px}.dsh-nb-sea svg.waves{position:absolute;left:0;bottom:0;width:200%;height:64px;animation:dsh-drift 9s linear infinite}.dsh-nb-sea.live svg.waves{animation-duration:4s}.dsh-nb-whale{position:absolute;width:150px;height:58px;top:16%;animation:dsh-cruise 11s ease-in-out infinite}.dsh-nb-sea.live .dsh-nb-whale{animation-duration:6s}.dsh-nb-caption{position:absolute;left:0;top:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55)}@keyframes dsh-drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes dsh-cruise{0%{transform:translate(0,10px) scaleX(1)}46%{transform:translate(62%,-4px) scaleX(1)}50%{transform:translate(66%,0) scaleX(-1)}96%{transform:translate(2%,14px) scaleX(-1)}100%{transform:translate(0,10px) scaleX(1)}}"
    }
    async function api(body) {
      const response = await fetch('/dsh-notebook/api', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const raw = await response.text()
      if (!raw) throw new Error('笔记本接口没有返回内容（HTTP ' + response.status + '）。请完全退出并重新打开桌面端。')
      let payload
      try { payload = JSON.parse(raw) } catch { throw new Error(raw.slice(0, 180)) }
      if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText)
      return payload
    }
    function foregroundSessionId(ctx) {
      const snapshot = ctx.sessions?.list?.getSnapshot?.()
      const rows = snapshot?.byId ? Object.values(snapshot.byId) : []
      const held = rows.find(row => (row.retainedBy?.mainView ?? 0) > 0)
      return held?.id || snapshot?.ids?.[0] || ''
    }
    function NotebookIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none' },
        h('rect', { x: 2.5, y: 1.5, width: 11, height: 13, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M5.5 1.8v12.4M8 5.2h3.2M8 8h3.2', stroke: 'currentColor', strokeWidth: 1.2 }))
    }
    function Orca() {
      return h('svg', { className: 'dsh-nb-whale', viewBox: '0 0 140 56' },
        h('path', { d: 'M28 30c8-16 34-20 62-12 18 5 30 8 36 4 4-2 8 2 6 6-6 8-22 10-40 8-22-2-48 2-58 6-8 3-14-2-6-12z', fill: '#07090b' }),
        h('path', { d: 'M46 34c16-6 36-6 54-2 4 6-8 12-24 12-16 0-30-4-30-10z', fill: '#f9fafb' }),
        h('path', { d: 'M62 16l8 10-16 2z', fill: '#07090b' }),
        h('path', { d: 'M22 32c-10-6-16-4-18 2 6 2 12 4 18 2z', fill: '#07090b' }),
        h('ellipse', { cx: 108, cy: 24, rx: 7, ry: 4, fill: '#f9fafb' }),
        h('circle', { cx: 112, cy: 23, r: 1.3, fill: '#07090b' }))
    }
    function DeepSea({ live, caption }) {
      const wave = 'M0 28 Q 40 8 80 28 T 160 28 T 240 28 T 320 28 T 400 28 V 70 H 0 Z'
      return h('div', { className: 'dsh-nb-sea' + (live ? ' live' : '') },
        h('div', { className: 'dsh-nb-caption' }, caption),
        h(Orca),
        h('svg', { className: 'waves', viewBox: '0 0 400 70', preserveAspectRatio: 'none' },
          h('path', { d: wave, fill: 'rgba(255,255,255,.16)' }),
          h('path', { d: wave, transform: 'translate(0 10)', fill: 'rgba(255,255,255,.07)' })))
    }
    function KindMark({ kind }) {
      const letter = kind === 'url' ? 'W' : kind === 'file' ? 'F' : kind === 'note' ? 'N' : 'T'
      return h('span', { className: 'dsh-nb-mark' }, letter)
    }
    function NotebookScreen({ sessionId }) {
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [title, setTitle] = useState('')
      const [draft, setDraft] = useState('')
      const [path, setPath] = useState('')
      const [url, setUrl] = useState('')
      const [adding, setAdding] = useState('')
      const [question, setQuestion] = useState('')
      const [thread, setThread] = useState([])
      const [artifact, setArtifact] = useState(null)
      const [busy, setBusy] = useState('')
      const [asking, setAsking] = useState(false)
      useEffect(() => { ensureStyles() }, [])
      async function load(id) {
        if (!id) { setState(null); return }
        try { const next = await api({ op: 'state', sessionId: id }); setState(next); setError('') }
        catch (err) { setError(err.message) }
      }
      useEffect(() => { setThread([]); setArtifact(null); load(sessionId) }, [sessionId])
      async function run(op, extra) {
        if (!sessionId) { setError('先打开一个对话'); return null }
        try { const result = await api({ op, sessionId, ...extra }); await load(sessionId); setError(''); return result }
        catch (err) { setError(err.message); return null }
      }
      async function ask(text) {
        const value = text.trim()
        if (!value) return
        setQuestion('')
        setAsking(true)
        setThread(items => [...items, { role: 'user', text: value }])
        const result = await run('ask', { text: value })
        setAsking(false)
        if (!result) return
        const note = result.sent ? '已发送到当前对话，回答在「对话」里，并只依据这些片段。' : '当前对话还不能直接接收消息。下面是检索到的片段。'
        const excerpts = (result.passages ?? []).slice(0, 3).map(passage => passage.title + '：' + passage.text.slice(0, 160)).join('\n\n')
        setThread(items => [...items, { role: 'assistant', text: note + (excerpts ? '\n\n' + excerpts : ''), passages: result.passages }])
      }
      const notebook = state?.notebook
      const sources = state?.sources ?? []
      const selected = sources.filter(source => source.enabled && source.status === 'ready').length
      const building = Boolean(busy) || asking || (Boolean(sessionId) && state === null)
      const caption = busy ? '虎鲸正在深海里整理这份资料' : asking ? '虎鲸正沿着来源下潜' : '深海巡游'
      return h('div', { className: 'dsh-nb' },
        h('section', { className: 'dsh-nb-col' },
          h('div', { className: 'dsh-nb-head' }, h('span', null, '来源'), h('button', { className: 'dsh-nb-chip', type: 'button', onClick: () => setAdding(adding ? '' : 'text') }, adding ? '关闭' : '+ 添加')),
          h('div', { className: 'dsh-nb-form' },
            h('input', { className: 'dsh-nb-field', placeholder: '新建笔记本名称', value: title, onChange: event => setTitle(event.target.value) }),
            h('button', { className: 'dsh-nb-chip', type: 'button', onClick: () => run('create', { title: title || '未命名笔记本', bind: true, grounding: 'sources-only' }) }, '新建并绑定'),
            h('select', { className: 'dsh-nb-field', value: state?.notebookId ?? '', onChange: event => { if (event.target.value) run('open', { notebookId: event.target.value }) } },
              h('option', { value: '' }, '打开已有笔记本'),
              ...(state?.notebooks ?? []).map(item => h('option', { key: item.id, value: item.id }, item.title))),
            adding ? h('div', { style: { display: 'grid', gap: 8 } },
              h('div', { className: 'dsh-nb-tabs' }, ['text', 'file', 'url'].map(kind => h('button', { key: kind, type: 'button', className: adding === kind ? 'on' : '', onClick: () => setAdding(kind) }, kind === 'text' ? '文本' : kind === 'file' ? '文件' : '网址'))),
              adding === 'text' ? h('textarea', { className: 'dsh-nb-field', style: { minHeight: 72 }, placeholder: '粘贴资料', value: draft, onChange: event => setDraft(event.target.value) }) : null,
              adding === 'file' ? h('input', { className: 'dsh-nb-field', placeholder: '文本文件绝对路径', value: path, onChange: event => setPath(event.target.value) }) : null,
              adding === 'url' ? h('input', { className: 'dsh-nb-field', placeholder: 'https://', value: url, onChange: event => setUrl(event.target.value) }) : null,
              h('button', { className: 'dsh-nb-chip', type: 'button', onClick: async () => {
                const ok = adding === 'file' ? await run('addFile', { path }) : adding === 'url' ? await run('addUrl', { url }) : await run('addText', { title: '粘贴文本', text: draft })
                if (ok) { setDraft(''); setAdding('') }
              } }, '加入来源'),
            ) : null,
          ),
          h('div', { className: 'dsh-nb-scroll' },
            sources.map(source => h('label', { key: source.id, className: 'dsh-nb-source' },
              h('input', { className: 'dsh-nb-check', type: 'checkbox', checked: source.enabled, onChange: event => run('setSources', { changes: [{ id: source.id, enabled: event.target.checked }] }) }),
              h(KindMark, { kind: source.kind }),
              h('span', { style: { minWidth: 0 } }, h('div', { className: 'dsh-nb-title' }, source.title), h('div', { className: 'dsh-nb-meta' }, (source.kind === 'url' ? '网页' : source.kind === 'file' ? '文件' : source.kind === 'note' ? '笔记' : '文本') + ' · ' + (source.status === 'ready' ? '可用' : source.status))))),
            sources.length === 0 ? h('p', { className: 'dsh-nb-meta', style: { padding: 8 } }, '添加文本、Markdown、CSV、JSON 或网页。只有勾选的来源会进入回答。') : null,
          ),
          h('div', { className: 'dsh-nb-meta', style: { padding: '8px 16px 14px' } }, selected + ' / ' + sources.length + ' 个来源已选'),
        ),
        h('section', { className: 'dsh-nb-col' },
          h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-title' }, notebook ? notebook.title : '笔记本'), notebook ? h('button', { className: 'dsh-nb-chip', type: 'button', onClick: () => run('update', { grounding: notebook.grounding === 'sources-only' ? 'sources-plus-tools' : 'sources-only' }) }, notebook.grounding === 'sources-only' ? '只依据来源' : '来源 + 工具') : null),
          error ? h('div', { className: 'dsh-nb-error' }, error) : null,
          h(DeepSea, { live: building, caption }),
          thread.length === 0 ? h('div', { className: 'dsh-nb-hero' },
            h('h2', null, notebook ? notebook.title : '深海里的笔记本'),
            h('div', { className: 'dsh-nb-meta' }, selected ? '已选 ' + selected + ' 个来源。提问时，虎鲸会带着这些资料下潜。' : '先在左侧勾选来源。'),
            notebook && !building ? h('div', { className: 'dsh-nb-suggest' }, SUGGEST.map(item => h('button', { key: item, type: 'button', onClick: () => ask(item) }, item))) : null,
          ) : h('div', { className: 'dsh-nb-thread' }, thread.map((item, index) => h('div', { key: index, className: 'dsh-nb-bubble ' + item.role },
            item.text,
            item.passages?.length ? h('div', { className: 'dsh-nb-cites' }, item.passages.map(passage => h('span', { key: passage.sourceId + ':' + passage.ordinal }, passage.title))) : null))),
          h('form', { className: 'dsh-nb-composer', onSubmit: event => { event.preventDefault(); ask(question) } },
            h('textarea', { rows: 1, placeholder: notebook ? '开始输入…' : '先绑定笔记本', value: question, onChange: event => setQuestion(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(question) } } }),
            h('button', { className: 'dsh-nb-send', type: 'submit', disabled: !question.trim() || !notebook, 'aria-label': '发送' }, '↑'),
          ),
        ),
        h('section', { className: 'dsh-nb-col' },
          h('div', { className: 'dsh-nb-head' }, 'Studio'),
          h('div', { className: 'dsh-nb-studio' },
            STUDIO.map(([kind, label, description]) => h('button', { key: kind, className: 'dsh-nb-card', type: 'button', disabled: !notebook || busy === kind, onClick: async () => { setBusy(kind); await run('generate', { kind, prompt: question }); setBusy('') } },
              h(KindMark, { kind }), h('strong', null, busy === kind ? '下潜整理中…' : label), h('span', null, description))),
            (state?.artifacts ?? []).map(item => h('button', { key: item.id, className: 'dsh-nb-art', type: 'button', onClick: async () => setArtifact((await api({ op: 'artifact', sessionId, id: item.id })).artifact) }, item.kind + ' · ' + (item.status === 'done' ? '完成' : item.status === 'failed' ? '失败' : '生成中'))),
          ),
          artifact ? h('pre', { className: 'dsh-nb-preview' }, artifact.body || artifact.error || artifact.status) : null,
        ),
      )
    }
    function NotebookView(props) {
      const sessionId = props.useSession(snapshot => snapshot.sessionId)
      return h(NotebookScreen, { sessionId })
    }
    function NotebookPanel(props) {
      const [sessionId, setSessionId] = useState(() => props.currentSessionId?.() || '')
      useEffect(() => props.watchSession?.(() => setSessionId(props.currentSessionId?.() || '')), [])
      return h(NotebookScreen, { sessionId })
    }
    return {
      name: 'dsh-notebook-client',
      inject: ['slots', 'layout', 'sessions'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 35, label: () => '笔记本' }, NotebookIcon))
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({
            name: 'main', key: PANEL_ID,
            inject: () => ({
              currentSessionId: () => foregroundSessionId(ctx),
              watchSession(listener) { const list = ctx.sessions?.list; return list?.subscribe ? list.subscribe(listener) : () => {} },
            }),
          }, NotebookPanel)
        })
        ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: PANEL_ID, order: 20, label: () => '笔记本' }, NotebookView))
      },
    }
  },
})