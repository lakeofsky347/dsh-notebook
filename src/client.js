const PANEL_ID = 'notebook'
window.__ModuleLoader__.load({
  id: 'dsh-notebook',
  factory(require) {
    const React = require('react')
    const { useEffect, useRef, useState } = React
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
      tag.textContent = STYLES
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
    function hash(x, y) {
      let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
      n = Math.imul(n ^ (n >>> 13), 1274126177)
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295
    }
    function HalftoneField({ live }) {
      const ref = useRef(null)
      useEffect(() => {
        const canvas = ref.current
        if (!canvas) return undefined
        const context = canvas.getContext('2d')
        if (!context) return undefined
        let raf = 0
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const started = performance.now()
        function paint(now) {
          const rect = canvas.getBoundingClientRect()
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const width = Math.max(1, Math.floor(rect.width * dpr))
          const height = Math.max(1, Math.floor(rect.height * dpr))
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
          }
          context.clearRect(0, 0, width, height)
          const cell = Math.max(4, Math.round(4.5 * dpr))
          const cols = Math.ceil(width / cell)
          const rows = Math.ceil(height / cell)
          const t = reduce ? 0 : (now - started) / (live ? 700 : 1400)
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const nx = (x + 0.5) / cols
              const ny = (y + 0.5) / rows
              const drift = reduce ? 0 : Math.sin(t * 0.7 + ny * 2.4) * 0.035
              const dx = nx - (0.82 + drift)
              const dy = ny - 0.42
              const blob = Math.exp(-(dx * dx * 3.4 + dy * dy * 6.2))
              const seed = hash(x, y)
              const gate = blob * (live ? 0.92 : 0.72)
              if (seed < gate) {
                const tone = 0.28 + blob * 0.72
                context.fillStyle = 'rgba(124,176,255,' + tone.toFixed(3) + ')'
                const size = cell * (0.42 + seed * 0.58)
                context.fillRect(x * cell, y * cell, size, size)
              }
            }
          }
        }
        function frame(now) {
          paint(now)
          if (!reduce) raf = requestAnimationFrame(frame)
        }
        frame(started)
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => paint(performance.now())) : null
        if (observer) observer.observe(canvas)
        return () => {
          cancelAnimationFrame(raf)
          if (observer) observer.disconnect()
        }
      }, [live])
      return h('canvas', { ref, className: 'dsh-nb-halftone', 'aria-hidden': 'true' })
    }
    function DeepSea({ live, caption }) {
      return h('div', { className: 'dsh-nb-sea' + (live ? ' live' : '') },
        h(HalftoneField, { live }),
        h('div', { className: 'dsh-nb-caption' }, caption))
    }
    function KindMark({ kind }) {
      const letter = kind === 'url' ? 'W' : kind === 'file' ? 'F' : kind === 'note' ? 'N' : 'T'
      return h('span', { className: 'dsh-nb-mark', 'aria-hidden': 'true' }, letter)
    }
    function CopyButton({ text }) {
      const [copied, setCopied] = useState(false)
      useEffect(() => {
        if (!copied) return undefined
        const id = setTimeout(() => setCopied(false), 1400)
        return () => clearTimeout(id)
      }, [copied])
      return h('button', {
        type: 'button',
        className: 'dsh-nb-copy',
        onClick() {
          const value = String(text ?? '')
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => {})
          }
        },
      }, copied ? '已复制' : '复制')
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
          h('div', { className: 'dsh-nb-head' },
            h('span', { className: 'dsh-nb-kicker' }, h('span', { className: 'dsh-nb-idx', 'aria-hidden': 'true' }, '01'), '来源'),
            h('button', { className: 'dsh-nb-chip dsh-nb-light', type: 'button', onClick: () => setAdding(adding ? '' : 'text') }, adding ? '关闭' : '+ 添加')),
          h('div', { className: 'dsh-nb-form' },
            h('input', { className: 'dsh-nb-field', placeholder: '新建笔记本名称', value: title, onChange: event => setTitle(event.target.value) }),
            h('button', { className: 'dsh-nb-chip dsh-nb-primary', type: 'button', onClick: () => run('create', { title: title || '未命名笔记本', bind: true, grounding: 'sources-only' }) }, '新建并绑定'),
            h('select', { className: 'dsh-nb-field', value: state?.notebookId ?? '', onChange: event => { if (event.target.value) run('open', { notebookId: event.target.value }) } },
              h('option', { value: '' }, '打开已有笔记本'),
              ...(state?.notebooks ?? []).map(item => h('option', { key: item.id, value: item.id }, item.title))),
            adding ? h('div', { className: 'dsh-nb-add' },
              h('div', { className: 'dsh-nb-tabs' }, ['text', 'file', 'url'].map(kind => h('button', { key: kind, type: 'button', className: adding === kind ? 'on' : '', onClick: () => setAdding(kind) }, kind === 'text' ? '文本' : kind === 'file' ? '文件' : '网址'))),
              adding === 'text' ? h('textarea', { className: 'dsh-nb-field dsh-nb-area', placeholder: '粘贴资料', value: draft, onChange: event => setDraft(event.target.value) }) : null,
              adding === 'file' ? h('input', { className: 'dsh-nb-field', placeholder: '文本文件绝对路径', value: path, onChange: event => setPath(event.target.value) }) : null,
              adding === 'url' ? h('input', { className: 'dsh-nb-field', placeholder: 'https://', value: url, onChange: event => setUrl(event.target.value) }) : null,
              h('button', { className: 'dsh-nb-chip dsh-nb-primary', type: 'button', onClick: async () => {
                const ok = adding === 'file' ? await run('addFile', { path }) : adding === 'url' ? await run('addUrl', { url }) : await run('addText', { title: '粘贴文本', text: draft })
                if (ok) { setDraft(''); setAdding('') }
              } }, '加入来源'),
            ) : null,
          ),
          h('div', { className: 'dsh-nb-scroll' },
            sources.map(source => h('label', { key: source.id, className: 'dsh-nb-source' },
              h('input', { className: 'dsh-nb-check', type: 'checkbox', checked: source.enabled, onChange: event => run('setSources', { changes: [{ id: source.id, enabled: event.target.checked }] }) }),
              h(KindMark, { kind: source.kind }),
              h('span', { className: 'dsh-nb-source-text' }, h('div', { className: 'dsh-nb-title' }, source.title), h('div', { className: 'dsh-nb-meta' }, (source.kind === 'url' ? '网页' : source.kind === 'file' ? '文件' : source.kind === 'note' ? '笔记' : '文本') + ' · ' + (source.status === 'ready' ? '可用' : source.status))))),
            sources.length === 0 ? h('p', { className: 'dsh-nb-empty' }, '添加文本、Markdown、CSV、JSON 或网页。只有勾选的来源会进入回答。') : null,
          ),
          h('div', { className: 'dsh-nb-count' }, selected + ' / ' + sources.length + ' 个来源已选'),
        ),
        h('section', { className: 'dsh-nb-col' },
          h('div', { className: 'dsh-nb-head' },
            h('span', { className: 'dsh-nb-title' }, notebook ? notebook.title : '笔记本'),
            notebook ? h('button', { className: 'dsh-nb-chip', type: 'button', onClick: () => run('update', { grounding: notebook.grounding === 'sources-only' ? 'sources-plus-tools' : 'sources-only' }) }, notebook.grounding === 'sources-only' ? '只依据来源' : '来源 + 工具') : null),
          error ? h('div', { className: 'dsh-nb-error', role: 'alert' }, error) : null,
          h(DeepSea, { live: building, caption }),
          h('div', { className: 'dsh-nb-stage' },
            thread.length === 0 ? h('div', { className: 'dsh-nb-hero' },
              notebook
                ? h('h2', null, notebook.title)
                : h('h2', null, '深海里的', h('span', { className: 'dsh-nb-accent' }, '笔记本')),
              h('div', { className: 'dsh-nb-meta' }, selected ? '已选 ' + selected + ' 个来源。提问时，虎鲸会带着这些资料下潜。' : '先在左侧勾选来源。'),
              notebook && !building ? h('div', { className: 'dsh-nb-suggest' }, SUGGEST.map(item => h('button', { key: item, type: 'button', onClick: () => ask(item) }, item))) : null,
            ) : h('div', { className: 'dsh-nb-thread' }, thread.map((item, index) => h('div', { key: index, className: 'dsh-nb-bubble ' + item.role },
              item.text,
              item.passages?.length ? h('div', { className: 'dsh-nb-cites' }, item.passages.map(passage => h('span', { key: passage.sourceId + ':' + passage.ordinal }, passage.title))) : null))),
          ),
          h('form', { className: 'dsh-nb-composer', onSubmit: event => { event.preventDefault(); ask(question) } },
            h('textarea', { rows: 1, placeholder: notebook ? '开始输入…' : '先绑定笔记本', value: question, onChange: event => setQuestion(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(question) } } }),
            h('button', { className: 'dsh-nb-send', type: 'submit', disabled: !question.trim() || !notebook, 'aria-label': '发送' }, '↑'),
          ),
        ),
        h('section', { className: 'dsh-nb-col' },
          h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-kicker' }, h('span', { className: 'dsh-nb-idx', 'aria-hidden': 'true' }, '02'), h('span', { className: 'dsh-nb-latin' }, 'Studio'))),
          h('div', { className: 'dsh-nb-studio' },
            STUDIO.map(([kind, label, description], index) => h('button', { key: kind, className: 'dsh-nb-card' + (busy === kind ? ' is-busy' : ''), type: 'button', disabled: !notebook || busy === kind, onClick: async () => { setBusy(kind); await run('generate', { kind, prompt: question }); setBusy('') } },
              h('span', { className: 'dsh-nb-mark', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
              h('strong', null, busy === kind ? '下潜整理中…' : label),
              h('span', null, description))),
            (state?.artifacts ?? []).map(item => h('button', { key: item.id, className: 'dsh-nb-art' + (artifact?.id === item.id ? ' on' : ''), type: 'button', onClick: async () => setArtifact((await api({ op: 'artifact', sessionId, id: item.id })).artifact) }, item.kind + ' · ' + (item.status === 'done' ? '完成' : item.status === 'failed' ? '失败' : '生成中'))),
          ),
          artifact ? h('div', { className: 'dsh-nb-terminal' },
            h('div', { className: 'dsh-nb-terminal-bar' },
              h('span', null, (artifact.kind || 'artifact') + (artifact.status ? ' · ' + artifact.status : '')),
              h(CopyButton, { text: artifact.body || artifact.error || artifact.status || '' })),
            h('pre', { className: 'dsh-nb-preview' }, artifact.body || artifact.error || artifact.status),
          ) : null,
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

const STYLES = `
.dsh-nb {
  --nb-bg: #070709;
  --nb-fg: #eceef2;
  --nb-muted: #b7b7c0;
  --nb-faint: #9a9aa6;
  --nb-line: rgba(255,255,255,0.08);
  --nb-line-strong: rgba(255,255,255,0.14);
  --nb-accent: #6ca7ff;
  --nb-accent-ink: #0b1020;
  --nb-surface: #121316;
  --nb-danger: #ffd0d0;
  --nb-sans: Inter, "Helvetica Neue", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei", "Droid Sans Fallback", ui-sans-serif, system-ui, sans-serif;
  --nb-mono: ui-monospace, "Cascadia Mono", "SFMono-Regular", "Noto Sans Mono", "Sarasa Mono SC", "WenQuanYi Micro Hei Mono", Menlo, Consolas, monospace;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr) minmax(240px, 300px);
  color: var(--nb-fg);
  font: 14px/1.5 var(--nb-sans);
  background-color: var(--nb-bg);
  background-image: radial-gradient(rgba(255,255,255,0.11) 0.7px, transparent 0.85px);
  background-size: 12px 12px;
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
}
.dsh-nb * { box-sizing: border-box; }
.dsh-nb button, .dsh-nb input, .dsh-nb textarea, .dsh-nb select { font: inherit; }
.dsh-nb input, .dsh-nb textarea, .dsh-nb select { color: inherit; }
.dsh-nb button { cursor: pointer; color: var(--nb-fg); }
.dsh-nb button:disabled { cursor: not-allowed; opacity: 1; }
.dsh-nb button:focus-visible, .dsh-nb input:focus-visible, .dsh-nb select:focus-visible, .dsh-nb textarea:focus-visible {
  outline: 2px solid var(--nb-accent);
  outline-offset: 2px;
}
.dsh-nb, .dsh-nb * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.dsh-nb::-webkit-scrollbar, .dsh-nb *::-webkit-scrollbar { width: 10px; height: 10px; }
.dsh-nb::-webkit-scrollbar-thumb, .dsh-nb *::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.18);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}
.dsh-nb::-webkit-scrollbar-track, .dsh-nb *::-webkit-scrollbar-track { background: transparent; }
.dsh-nb-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}
.dsh-nb-col + .dsh-nb-col { border-left: 1px solid var(--nb-line); }
.dsh-nb-head {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  flex-wrap: wrap;
}
.dsh-nb-kicker {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  color: var(--nb-fg);
  font-size: 14px;
  font-weight: 600;
}
.dsh-nb-idx {
  color: var(--nb-accent);
  font-family: var(--nb-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
}
.dsh-nb-latin {
  font-family: var(--nb-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nb-muted);
}
.dsh-nb-head .dsh-nb-title {
  font-family: var(--nb-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--nb-muted);
}
.dsh-nb-chip {
  border: 1px solid var(--nb-line-strong);
  background: #16171b;
  color: var(--nb-fg);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.2;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}
.dsh-nb button.dsh-nb-chip { color: var(--nb-fg); }
.dsh-nb button.dsh-nb-chip:hover { background: #22232a; border-color: rgba(255,255,255,0.24); color: var(--nb-fg); }
.dsh-nb button.dsh-nb-primary,
.dsh-nb button.dsh-nb-primary:hover,
.dsh-nb button.dsh-nb-primary:focus-visible,
.dsh-nb button.dsh-nb-primary:active {
  background: var(--nb-accent);
  color: var(--nb-accent-ink);
  -webkit-text-fill-color: var(--nb-accent-ink);
  border-color: transparent;
  font-weight: 600;
}
.dsh-nb button.dsh-nb-primary:hover,
.dsh-nb button.dsh-nb-primary:focus-visible { background: #8eb9ff; }
.dsh-nb button.dsh-nb-light,
.dsh-nb button.dsh-nb-light:hover,
.dsh-nb button.dsh-nb-light:focus-visible,
.dsh-nb button.dsh-nb-light:active {
  background: #f4f5f7;
  color: #121318;
  -webkit-text-fill-color: #121318;
  border-color: transparent;
  font-weight: 600;
}
.dsh-nb button.dsh-nb-light:hover,
.dsh-nb button.dsh-nb-light:focus-visible { background: #ffffff; }
.dsh-nb-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 10px 12px;
}
.dsh-nb-source {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  padding: 10px 8px;
  color: var(--nb-fg);
  cursor: pointer;
}
.dsh-nb-source:hover { background: rgba(255,255,255,0.03); }
.dsh-nb-source:has(input:checked) {
  background: rgba(108, 167, 255, 0.08);
  border-color: rgba(108, 167, 255, 0.32);
}
.dsh-nb-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  border: 1px solid var(--nb-line-strong);
  background: rgba(255,255,255,0.03);
  color: var(--nb-muted);
  font-family: var(--nb-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.dsh-nb-source:has(input:checked) .dsh-nb-mark {
  color: var(--nb-accent);
  border-color: rgba(108, 167, 255, 0.45);
  background: rgba(108, 167, 255, 0.12);
}
.dsh-nb-source-text { min-width: 0; }
.dsh-nb-title { font-weight: 600; letter-spacing: -0.011em; }
.dsh-nb-meta { margin-top: 1px; font-size: 12px; line-height: 1.45; color: var(--nb-faint); }
.dsh-nb-check { width: 15px; height: 15px; margin: 0; accent-color: var(--nb-accent); }
.dsh-nb-form { display: grid; gap: 8px; padding: 0 16px 12px; }
.dsh-nb-form .dsh-nb-chip { justify-self: start; }
.dsh-nb-add { display: grid; gap: 8px; }
.dsh-nb-field {
  width: 100%;
  border: 1px solid var(--nb-line-strong);
  border-radius: 8px;
  background: rgba(0,0,0,0.35);
  padding: 8px 10px;
  color: var(--nb-fg);
}
.dsh-nb-field::placeholder, .dsh-nb-composer textarea::placeholder { color: var(--nb-faint); opacity: 1; }
.dsh-nb-area { min-height: 72px; resize: vertical; }
select.dsh-nb-field {
  appearance: none;
  padding-right: 28px;
  background-image: linear-gradient(45deg, transparent 50%, #9a9aa6 50%), linear-gradient(135deg, #9a9aa6 50%, transparent 50%);
  background-position: calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.dsh-nb-field option { background: #121316; color: var(--nb-fg); }
.dsh-nb-count {
  padding: 10px 16px 14px;
  border-top: 1px solid var(--nb-line);
  color: var(--nb-faint);
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.dsh-nb-empty { margin: 0; padding: 12px 8px; color: var(--nb-muted); font-size: 13px; line-height: 1.55; }
.dsh-nb-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.dsh-nb-tabs button {
  border-radius: 999px;
  border: 1px solid var(--nb-line-strong);
  background: #141518;
  color: var(--nb-fg);
  padding: 4px 10px;
  font-size: 12px;
}
.dsh-nb-tabs button.on,
.dsh-nb-tabs button.on:hover,
.dsh-nb-tabs button.on:focus-visible {
  background: var(--nb-accent);
  color: var(--nb-accent-ink);
  -webkit-text-fill-color: var(--nb-accent-ink);
  border-color: transparent;
  font-weight: 600;
}
.dsh-nb-stage { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.dsh-nb-hero { margin: 0; padding: 18px 28px 8px; }
.dsh-nb-hero h2 {
  margin: 0 0 12px;
  max-width: 16ch;
  font-size: clamp(36px, 4.4vw, 60px);
  line-height: 0.96;
  font-weight: 700;
  letter-spacing: -0.045em;
  color: var(--nb-fg);
}
.dsh-nb-accent { color: var(--nb-accent); }
.dsh-nb-hero .dsh-nb-meta { max-width: 42em; font-size: 14px; color: var(--nb-muted); }
.dsh-nb-suggest { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.dsh-nb-suggest button {
  border-radius: 999px;
  border: 1px solid var(--nb-line-strong);
  background: #141518;
  color: var(--nb-fg);
  padding: 8px 14px;
  transition: background-color .15s ease, border-color .15s ease;
}
.dsh-nb-suggest button:hover { background: #1c1d22; border-color: rgba(255,255,255,0.28); }
.dsh-nb-thread {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 28px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dsh-nb-bubble { max-width: 100%; padding: 0; border-radius: 0; white-space: pre-wrap; background: transparent; }
.dsh-nb-bubble.user {
  font-size: clamp(22px, 2.4vw, 32px);
  line-height: 1.15;
  letter-spacing: -0.035em;
  font-weight: 700;
  color: var(--nb-fg);
}
.dsh-nb-bubble.assistant { color: rgba(236,238,242,0.78); font-size: 14px; line-height: 1.6; max-width: 68ch; }
.dsh-nb-cites { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.dsh-nb-cites span {
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(108,167,255,0.4);
  background: rgba(108,167,255,0.1);
  color: #d5e2ff;
}
.dsh-nb-composer {
  margin: 12px 20px 20px;
  border: 1px solid var(--nb-line-strong);
  border-radius: 16px;
  padding: 8px 8px 8px 16px;
  display: flex;
  gap: 8px;
  align-items: center;
  background: #101114;
}
.dsh-nb-composer:focus-within {
  border-color: var(--nb-accent);
  box-shadow: 0 0 0 3px rgba(108,167,255,0.28);
}
.dsh-nb-composer textarea {
  flex: 1;
  border: 0;
  resize: none;
  background: transparent;
  min-height: 24px;
  max-height: 96px;
  color: var(--nb-fg);
}
.dsh-nb-composer textarea:focus-visible { outline: none; }
.dsh-nb button.dsh-nb-send,
.dsh-nb button.dsh-nb-send:hover,
.dsh-nb button.dsh-nb-send:focus-visible {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: var(--nb-accent);
  color: var(--nb-accent-ink);
  -webkit-text-fill-color: var(--nb-accent-ink);
  font-weight: 700;
  flex: none;
}
.dsh-nb button.dsh-nb-primary:disabled,
.dsh-nb button.dsh-nb-light:disabled,
.dsh-nb button.dsh-nb-send:disabled,
.dsh-nb button.dsh-nb-primary:disabled:hover,
.dsh-nb button.dsh-nb-light:disabled:hover,
.dsh-nb button.dsh-nb-send:disabled:hover {
  background: #1c1d22;
  color: var(--nb-muted);
  -webkit-text-fill-color: var(--nb-muted);
  border-color: var(--nb-line);
  opacity: 1;
  transition: none;
}
.dsh-nb-studio {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-nb-card {
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  padding: 12px 10px;
  color: var(--nb-fg);
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 2px;
  align-items: center;
  transition: background-color .15s ease, border-color .15s ease;
}
.dsh-nb-card .dsh-nb-mark { grid-row: 1 / span 2; }
.dsh-nb-card strong { font-weight: 600; font-size: 14px; letter-spacing: -0.011em; }
.dsh-nb-card > span { color: var(--nb-muted); font-size: 12px; line-height: 1.45; }
.dsh-nb-card:hover:not(:disabled) { background: rgba(255,255,255,0.035); border-color: var(--nb-line); }
.dsh-nb-card.is-busy {
  background: rgba(108,167,255,0.1);
  border-color: rgba(108,167,255,0.45);
  color: var(--nb-fg);
}
.dsh-nb-card:disabled:not(.is-busy) { color: var(--nb-faint); }
.dsh-nb-card:disabled:not(.is-busy) > span { color: var(--nb-faint); }
.dsh-nb-art {
  width: 100%;
  text-align: left;
  margin-top: 6px;
  border: 1px solid var(--nb-line);
  border-radius: 8px;
  background: var(--nb-surface);
  color: #d0d2da;
  padding: 8px 10px;
  font-family: var(--nb-mono);
  font-size: 12px;
}
.dsh-nb-art:hover, .dsh-nb-art.on { border-color: rgba(108,167,255,0.5); color: var(--nb-fg); }
.dsh-nb-terminal {
  margin: 4px 12px 14px;
  border: 1px solid var(--nb-line);
  border-radius: 10px;
  background: #0c0d10;
  overflow: hidden;
  flex: none;
}
.dsh-nb-terminal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--nb-line);
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--nb-faint);
}
.dsh-nb button.dsh-nb-copy,
.dsh-nb button.dsh-nb-copy:hover,
.dsh-nb button.dsh-nb-copy:focus-visible {
  border: 1px solid var(--nb-line-strong);
  background: #16181c;
  color: var(--nb-fg);
  -webkit-text-fill-color: var(--nb-fg);
  border-radius: 999px;
  padding: 3px 10px;
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: none;
}
.dsh-nb button.dsh-nb-copy:hover,
.dsh-nb button.dsh-nb-copy:focus-visible { border-color: var(--nb-accent); }
.dsh-nb-preview {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 12px;
  white-space: pre-wrap;
  font-family: var(--nb-mono);
  font-size: 12px;
  line-height: 1.55;
  color: #d9dbe3;
}
.dsh-nb-error {
  margin: 0 16px 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,160,160,0.38);
  background: rgba(255,90,90,0.08);
  color: var(--nb-danger);
  font-size: 13px;
  line-height: 1.45;
}
.dsh-nb-sea {
  position: relative;
  height: 92px;
  margin: 0 8px;
  overflow: hidden;
  background: transparent;
  transition: height .2s ease;
}
.dsh-nb-sea.live { height: 132px; }
.dsh-nb-halftone { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
.dsh-nb-caption {
  position: relative;
  z-index: 1;
  padding: 12px 14px;
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #e4e7ef;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85);
}
@media (prefers-reduced-motion: reduce) {
  .dsh-nb-sea, .dsh-nb-chip, .dsh-nb-card, .dsh-nb-suggest button { transition: none; }
}
@media (max-width: 860px) {
  .dsh-nb { display: flex; flex-direction: column; overflow: auto; height: 100%; }
  .dsh-nb-col { overflow: visible; flex: none; }
  .dsh-nb-col + .dsh-nb-col { border-left: 0; border-top: 1px solid var(--nb-line); }
  .dsh-nb-scroll { max-height: 280px; flex: none; }
  .dsh-nb-thread { max-height: 320px; flex: none; }
  .dsh-nb-stage { flex: none; max-height: 420px; }
  .dsh-nb-studio { max-height: 320px; flex: none; }
  .dsh-nb-hero { padding: 16px; }
  .dsh-nb-hero h2 { font-size: 34px; }
  .dsh-nb-bubble.user { font-size: 22px; }
  .dsh-nb-composer { margin: 12px 12px 16px; }
  .dsh-nb-sea { margin: 8px 12px 0; }
  .dsh-nb-thread { padding: 8px 16px 16px; }
}
`
