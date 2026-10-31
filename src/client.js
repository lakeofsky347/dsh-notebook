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
    const STUDIO_ICON = {
      'study-guide': 'M3.2 4.2h9.6M3.2 8h9.6M3.2 11.8h6',
      briefing: 'M4.2 2.6h4.4L12 6.1v7.3H4.2zM8.4 2.8v3.5H12',
      report: 'M3.2 3.6h9.6M3.2 6.7h9.6M3.2 9.8h9.6M3.2 12.8h5.4',
      flashcards: 'M2.8 4.4h7.2v8H2.8zM5.6 3.1H13v8',
      quiz: 'M8 11.6h.01M6.1 6.3a1.9 1.9 0 1 1 2.7 1.7c-.55.28-.8.72-.8 1.25',
      'mind-map': 'M8 8h.01M3.4 4h.01M12.6 4h.01M3.4 12h.01M12.6 12h.01M8 8 3.6 4.2M8 8l4.4-3.8M8 8 3.6 11.8M8 8l4.4 3.8',
      'data-table': 'M2.8 3.2h10.4v9.6H2.8zM2.8 6.4h10.4M2.8 9.6h10.4M6.4 6.4v6.4',
    }
    const SUGGEST = ['总结这些来源', '列出关键概念', '这些资料有什么分歧？']
    const PANEL_CSS = `
.dsh-nb {
  --nb-bg: #0a0a0b;
  --nb-bg-elev: #101012;
  --nb-bg-chip: #161618;
  --nb-fg: #ececef;
  --nb-muted: #a7a7b1;
  --nb-accent: #7aa2ff;
  --nb-accent-ink: #0b0c10;
  --nb-line: rgba(255, 255, 255, 0.08);
  --nb-line-strong: rgba(255, 255, 255, 0.14);
  --nb-danger: #ffc1c1;
  --nb-sans: Inter, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "WenQuanYi Micro Hei", "Droid Sans Fallback", ui-sans-serif, system-ui, sans-serif;
  --nb-mono: ui-monospace, "Cascadia Mono", "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, "WenQuanYi Micro Hei Mono", "Droid Sans Fallback", monospace;
  height: 100%;
  min-height: 0;
  color: var(--nb-fg);
  color-scheme: dark;
  font-family: var(--nb-sans);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
  background-color: var(--nb-bg);
  background-image: radial-gradient(rgba(255, 255, 255, 0.09) 0.55px, transparent 0.72px);
  background-size: 3px 3px;
  caret-color: var(--nb-accent);
  container-type: inline-size;
  container-name: notebook;
  -webkit-font-smoothing: antialiased;
}
.dsh-nb * { box-sizing: border-box; }
.dsh-nb h2, .dsh-nb p { margin: 0; }
.dsh-nb button, .dsh-nb input, .dsh-nb textarea, .dsh-nb select {
  font: inherit;
  color: inherit;
  letter-spacing: normal;
}
.dsh-nb button { cursor: pointer; background: transparent; border: 0; padding: 0; }
.dsh-nb button:disabled { cursor: not-allowed; }
.dsh-nb :focus { outline: none; }
.dsh-nb :focus-visible {
  outline: 2px solid var(--nb-accent);
  outline-offset: 2px;
}
.dsh-nb ::selection { background: rgba(122, 162, 255, 0.35); color: #fff; }
.dsh-nb-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(232px, 280px) minmax(0, 1fr) minmax(240px, 300px);
  overflow: hidden;
}
.dsh-nb-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
}
.dsh-nb-col.is-sources, .dsh-nb-col.is-main { border-right: 1px solid var(--nb-line); }
.dsh-nb-head {
  height: 52px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--nb-line);
}
.dsh-nb-kicker {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--nb-muted);
  font-family: var(--nb-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.dsh-nb-idx {
  color: var(--nb-accent);
  font-variant-numeric: tabular-nums;
}
.dsh-nb-head .dsh-nb-title {
  color: var(--nb-fg);
  font-family: var(--nb-sans);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-transform: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-nb-head .dsh-nb-chip { flex: none; }
.dsh-nb button.dsh-nb-chip {
  border: 1px solid var(--nb-line-strong);
  background: var(--nb-bg-chip);
  color: var(--nb-fg);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 500;
}
.dsh-nb button.dsh-nb-chip:hover:not(:disabled) {
  background: #222228;
  border-color: rgba(255, 255, 255, 0.28);
}
.dsh-nb button.dsh-nb-chip.primary {
  background: var(--nb-accent);
  border-color: transparent;
  color: var(--nb-accent-ink);
  font-weight: 600;
}
.dsh-nb button.dsh-nb-chip.primary:hover:not(:disabled) {
  background: #8eafff;
  color: var(--nb-accent-ink);
}
.dsh-nb button.dsh-nb-chip.is-on {
  border-color: rgba(122, 162, 255, 0.75);
  color: var(--nb-accent);
}
.dsh-nb-scroll, .dsh-nb-thread, .dsh-nb-studio, .dsh-nb-preview {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
}
.dsh-nb *::-webkit-scrollbar { width: 10px; height: 10px; }
.dsh-nb *::-webkit-scrollbar-track { background: transparent; }
.dsh-nb *::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 99px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.dsh-nb-scroll { overflow: auto; padding: 8px 10px 12px; flex: 1; min-height: 0; }
.dsh-nb-form { display: grid; gap: 8px; padding: 12px 16px 4px; }
.dsh-nb-add { display: grid; gap: 8px; }
.dsh-nb-field {
  width: 100%;
  border: 1px solid var(--nb-line-strong);
  border-radius: 8px;
  background: var(--nb-bg-elev);
  padding: 8px 10px;
  color: var(--nb-fg);
  min-height: 36px;
}
.dsh-nb-field::placeholder, .dsh-nb-composer textarea::placeholder { color: #8e8e98; }
.dsh-nb .dsh-nb-field:focus-visible {
  border-color: var(--nb-accent);
  outline-offset: 1px;
}
.dsh-nb-area { min-height: 72px; resize: vertical; line-height: 1.5; }
.dsh-nb select.dsh-nb-field {
  cursor: pointer;
  appearance: none;
  height: 38px;
  padding: 0 34px 0 10px;
  line-height: 38px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.4 6 6.2 11 1.4' fill='none' stroke='%23a7a7b1' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
}
.dsh-nb-field option { background: #141416; color: var(--nb-fg); }
.dsh-nb-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-nb .dsh-nb-tabs button {
  border-radius: 999px;
  border: 1px solid var(--nb-line-strong);
  background: transparent;
  color: var(--nb-muted);
  padding: 5px 10px;
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
}
.dsh-nb .dsh-nb-tabs button.on {
  background: var(--nb-accent);
  border-color: transparent;
  color: var(--nb-accent-ink);
  font-weight: 600;
}
.dsh-nb-source {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 9px 8px;
  color: var(--nb-fg);
  cursor: pointer;
}
.dsh-nb-source:hover { background: rgba(255, 255, 255, 0.035); }
.dsh-nb-mark {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  flex: none;
  border: 1px solid var(--nb-line-strong);
  background: transparent;
  color: var(--nb-muted);
  font-family: var(--nb-mono);
  font-size: 10px;
  font-weight: 600;
}
.dsh-nb-copy { min-width: 0; display: grid; gap: 2px; }
.dsh-nb-title { font-weight: 600; }
.dsh-nb-source .dsh-nb-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-nb-meta { font-size: 12px; line-height: 1.45; color: var(--nb-muted); }
.dsh-nb-empty { padding: 8px 10px; }
.dsh-nb-check {
  width: 15px;
  height: 15px;
  margin: 0;
  flex: none;
  accent-color: var(--nb-accent);
}
.dsh-nb-foot {
  flex: none;
  padding: 8px 16px 14px;
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--nb-muted);
}
.dsh-nb-hero { margin: 0; text-align: left; max-width: none; padding: 18px 28px 24px; }
.dsh-nb-col.is-main { container-type: inline-size; container-name: main; }
.dsh-nb-hero h2 {
  font-size: clamp(32px, 8cqi, 56px);
  line-height: 1.08;
  font-weight: 700;
  letter-spacing: -0.04em;
  margin: 0 0 14px;
  color: var(--nb-fg);
  text-wrap: pretty;
}
.dsh-nb-hero .dsh-nb-meta { max-width: 46em; font-size: 14px; line-height: 1.6; }
.dsh-nb-suggest { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-start; margin-top: 18px; }
.dsh-nb .dsh-nb-suggest button {
  border-radius: 999px;
  border: 1px solid var(--nb-line-strong);
  background: var(--nb-bg-chip);
  color: var(--nb-fg);
  padding: 8px 14px;
  font-size: 13px;
}
.dsh-nb .dsh-nb-suggest button:hover {
  background: #222228;
  border-color: rgba(122, 162, 255, 0.65);
}
.dsh-nb-thread {
  flex: 1;
  overflow: auto;
  padding: 16px 28px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
}
.dsh-nb-bubble { max-width: 100%; padding: 0; border-radius: 0; white-space: pre-wrap; background: transparent; }
.dsh-nb-bubble.user {
  font-size: 22px;
  line-height: 1.35;
  letter-spacing: -0.03em;
  font-weight: 600;
  color: var(--nb-fg);
}
.dsh-nb-bubble.assistant { color: #c8c8d0; font-size: 14px; line-height: 1.65; }
.dsh-nb-cites { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.dsh-nb-cites span {
  font-family: var(--nb-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--nb-line-strong);
  color: var(--nb-fg);
  background: rgba(16, 16, 18, 0.9);
}
.dsh-nb-composer {
  margin: auto 16px 16px;
  border: 1px solid var(--nb-line-strong);
  border-radius: 999px;
  padding: 6px 6px 6px 16px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  background: #0c0c0e;
  flex: none;
}
.dsh-nb-composer:focus-within {
  border-color: var(--nb-accent);
  box-shadow: 0 0 0 1px var(--nb-accent);
}
.dsh-nb-composer textarea {
  flex: 1;
  border: 0;
  resize: none;
  background: transparent;
  min-height: 24px;
  max-height: 96px;
  padding: 6px 0;
  color: var(--nb-fg);
  line-height: 1.45;
}
.dsh-nb-composer textarea:focus-visible { outline: none; }
.dsh-nb button.dsh-nb-send {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: #f3f3f5;
  color: #0b0c10;
  font-weight: 700;
  flex: none;
}
.dsh-nb button.dsh-nb-send:hover:not(:disabled) { background: #ffffff; }
.dsh-nb button.dsh-nb-send:disabled { background: #2a2a2e; color: #b1b1ba; }
.dsh-nb-studio {
  overflow: auto;
  padding: 8px 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
}
.dsh-nb button.dsh-nb-card {
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  padding: 11px 10px;
  color: var(--nb-fg);
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  width: 100%;
}
.dsh-nb button.dsh-nb-card:hover:not(:disabled) { background: rgba(255, 255, 255, 0.035); }
.dsh-nb button.dsh-nb-card:disabled:not(.is-busy) { color: #9a9aa4; }
.dsh-nb button.dsh-nb-card.is-busy {
  background: rgba(122, 162, 255, 0.1);
  border-color: rgba(122, 162, 255, 0.28);
  cursor: progress;
}
.dsh-nb-card strong {
  display: block;
  margin: 0;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
  line-height: 1.35;
}
.dsh-nb button.dsh-nb-card.is-busy strong { color: var(--nb-accent); }
.dsh-nb-card-copy { min-width: 0; display: grid; gap: 3px; }
.dsh-nb-card-copy span { color: var(--nb-muted); font-size: 12px; line-height: 1.45; font-weight: 400; }
.dsh-nb button.dsh-nb-card:disabled:not(.is-busy) .dsh-nb-card-copy span { color: #8d8d97; }
.dsh-nb-ico {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--nb-line-strong);
  display: grid;
  place-items: center;
  color: var(--nb-muted);
}
.dsh-nb-card.is-busy .dsh-nb-ico {
  color: var(--nb-accent);
  border-color: rgba(122, 162, 255, 0.7);
  background: rgba(122, 162, 255, 0.12);
}
.dsh-nb button.dsh-nb-art {
  text-align: left;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--nb-muted);
  padding: 8px 12px;
  width: 100%;
  font-family: var(--nb-mono);
  font-size: 12px;
  letter-spacing: 0.01em;
}
.dsh-nb button.dsh-nb-art:hover, .dsh-nb button.dsh-nb-art.is-on {
  background: rgba(255, 255, 255, 0.04);
  color: var(--nb-fg);
}
.dsh-nb-term {
  margin: 4px 12px 16px;
  border: 1px solid var(--nb-line-strong);
  border-radius: 12px;
  background: #0e0e10;
  overflow: hidden;
  flex: none;
}
.dsh-nb-term-bar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nb-line);
  font-family: var(--nb-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nb-muted);
}
.dsh-nb-preview {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 12px;
  white-space: pre-wrap;
  font-family: var(--nb-mono);
  font-size: 12px;
  line-height: 1.55;
  color: #d8d8e0;
  background: transparent;
}
.dsh-nb-error {
  margin: 10px 16px 0;
  padding: 8px 12px;
  border: 1px solid rgba(255, 176, 176, 0.38);
  border-radius: 8px;
  background: rgba(72, 18, 18, 0.45);
  color: var(--nb-danger);
  font-size: 13px;
  line-height: 1.45;
  flex: none;
}
.dsh-nb-sea {
  position: relative;
  height: 120px;
  margin: 8px 16px 0;
  overflow: hidden;
  flex: none;
}
.dsh-nb-sea.live { height: 148px; }
.dsh-nb-caption {
  position: absolute;
  left: 0;
  top: 2px;
  z-index: 1;
  max-width: 18em;
  margin: 0;
  font-family: var(--nb-mono);
  font-size: 11px;
  line-height: 1.45;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b7b7c0;
}
.dsh-nb-cloud {
  position: absolute;
  right: -4%;
  top: -12%;
  width: 100%;
  height: 130%;
  color: var(--nb-accent);
  pointer-events: none;
  animation: dsh-nb-drift 18s ease-in-out infinite alternate;
}
.dsh-nb-sea.live .dsh-nb-cloud {
  animation: dsh-nb-drift 7s ease-in-out infinite alternate, dsh-nb-glow 2.6s ease-in-out infinite;
}
@keyframes dsh-nb-drift {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-12px, 5px, 0); }
}
@keyframes dsh-nb-glow {
  from, to { opacity: 0.72; }
  50% { opacity: 1; }
}
@container notebook (max-width: 880px) {
  .dsh-nb-grid { display: block; overflow: auto; height: 100%; }
  .dsh-nb-col { border-right: 0; border-bottom: 1px solid var(--nb-line); min-height: 0; }
  .dsh-nb-scroll, .dsh-nb-thread, .dsh-nb-studio { flex: none; max-height: 320px; }
  .dsh-nb-hero { padding: 16px 16px 8px; }
  .dsh-nb-thread { padding: 12px 16px; }
}
@media (max-width: 880px) {
  .dsh-nb-grid { display: block; overflow: auto; height: 100%; }
  .dsh-nb-col { border-right: 0; border-bottom: 1px solid var(--nb-line); }
  .dsh-nb-scroll, .dsh-nb-thread, .dsh-nb-studio { flex: none; max-height: 320px; }
  .dsh-nb-hero { padding: 16px 16px 8px; }
  .dsh-nb-thread { padding: 12px 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-nb .dsh-nb-cloud { animation: none; }
}
@media (forced-colors: active) {
  .dsh-nb { background-image: none; }
  .dsh-nb .dsh-nb-cloud { display: none; }
}
`
    function ensureStyles() {
      let tag = document.getElementById('dsh-notebook-style')
      if (!tag) {
        tag = document.createElement('style')
        tag.id = 'dsh-notebook-style'
        document.head.appendChild(tag)
      }
      tag.textContent = PANEL_CSS
    }
    function buildCloud() {
      let seed = 0x51ed
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 4294967296
      }
      const dots = []
      const cols = 48
      const rows = 20
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = (x + 0.5) / cols
          const py = (y + 0.5) / rows
          const nx = (px - 0.68) / 0.4
          const ny = (py - 0.46) / 0.46
          const dist = nx * nx + ny * ny
          if (dist > 1) continue
          const fade = 1 - dist
          const n = rand()
          if (n > Math.pow(fade, 0.55) * 0.92) continue
          dots.push([
            Math.round(px * 2000) / 10,
            Math.round(py * 900) / 10,
            Math.round((0.45 + Math.pow(fade, 0.85) * (1.15 + n * 1.35)) * 100) / 100,
            Math.round((0.28 + fade * 0.62) * 100) / 100,
          ])
        }
      }
      return dots
    }
    const CLOUD = buildCloud()
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
    function DeepSea({ live, caption }) {
      return h('div', { className: 'dsh-nb-sea' + (live ? ' live' : '') },
        h('div', { className: 'dsh-nb-caption', role: 'status' }, caption),
        h('svg', { className: 'dsh-nb-cloud', viewBox: '0 0 200 90', preserveAspectRatio: 'xMaxYMid meet', 'aria-hidden': 'true', focusable: 'false' },
          CLOUD.map((dot, index) => h('circle', { key: index, cx: dot[0], cy: dot[1], r: dot[2], fill: 'currentColor', opacity: dot[3] }))))
    }
    function KindMark({ kind }) {
      const letter = kind === 'url' ? 'W' : kind === 'file' ? 'F' : kind === 'note' ? 'N' : 'T'
      return h('span', { className: 'dsh-nb-mark', 'aria-hidden': 'true' }, letter)
    }
    function StudioGlyph({ kind }) {
      return h('span', { className: 'dsh-nb-ico', 'aria-hidden': 'true' },
        h('svg', { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', focusable: 'false' },
          h('path', { d: STUDIO_ICON[kind] || 'M3 8h10', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' })))
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
        h('div', { className: 'dsh-nb-grid' },
        h('section', { className: 'dsh-nb-col is-sources' },
          h('div', { className: 'dsh-nb-head' },
            h('span', { className: 'dsh-nb-kicker' }, h('span', { className: 'dsh-nb-idx', 'aria-hidden': 'true' }, '01'), h('span', null, '来源')),
            h('button', { className: 'dsh-nb-chip', type: 'button', onClick: () => setAdding(adding ? '' : 'text') }, adding ? '关闭' : '+ 添加')),
          h('div', { className: 'dsh-nb-form' },
            h('input', { className: 'dsh-nb-field', placeholder: '新建笔记本名称', value: title, onChange: event => setTitle(event.target.value) }),
            h('button', { className: 'dsh-nb-chip primary', type: 'button', onClick: () => run('create', { title: title || '未命名笔记本', bind: true, grounding: 'sources-only' }) }, '新建并绑定'),
            h('select', { className: 'dsh-nb-field', value: state?.notebookId ?? '', onChange: event => { if (event.target.value) run('open', { notebookId: event.target.value }) } },
              h('option', { value: '' }, '打开已有笔记本'),
              ...(state?.notebooks ?? []).map(item => h('option', { key: item.id, value: item.id }, item.title))),
            adding ? h('div', { className: 'dsh-nb-add' },
              h('div', { className: 'dsh-nb-tabs' }, ['text', 'file', 'url'].map(kind => h('button', { key: kind, type: 'button', className: adding === kind ? 'on' : '', onClick: () => setAdding(kind) }, kind === 'text' ? '文本' : kind === 'file' ? '文件' : '网址'))),
              adding === 'text' ? h('textarea', { className: 'dsh-nb-field dsh-nb-area', placeholder: '粘贴资料', value: draft, onChange: event => setDraft(event.target.value) }) : null,
              adding === 'file' ? h('input', { className: 'dsh-nb-field', placeholder: '文本文件绝对路径', value: path, onChange: event => setPath(event.target.value) }) : null,
              adding === 'url' ? h('input', { className: 'dsh-nb-field', placeholder: 'https://', value: url, onChange: event => setUrl(event.target.value) }) : null,
              h('button', { className: 'dsh-nb-chip primary', type: 'button', onClick: async () => {
                const ok = adding === 'file' ? await run('addFile', { path }) : adding === 'url' ? await run('addUrl', { url }) : await run('addText', { title: '粘贴文本', text: draft })
                if (ok) { setDraft(''); setAdding('') }
              } }, '加入来源'),
            ) : null,
          ),
          h('div', { className: 'dsh-nb-scroll' },
            sources.map(source => h('label', { key: source.id, className: 'dsh-nb-source' },
              h('input', { className: 'dsh-nb-check', type: 'checkbox', checked: source.enabled, onChange: event => run('setSources', { changes: [{ id: source.id, enabled: event.target.checked }] }) }),
              h(KindMark, { kind: source.kind }),
              h('span', { className: 'dsh-nb-copy' }, h('div', { className: 'dsh-nb-title' }, source.title), h('div', { className: 'dsh-nb-meta' }, (source.kind === 'url' ? '网页' : source.kind === 'file' ? '文件' : source.kind === 'note' ? '笔记' : '文本') + ' · ' + (source.status === 'ready' ? '可用' : source.status))))),
            sources.length === 0 ? h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, '添加文本、Markdown、CSV、JSON 或网页。只有勾选的来源会进入回答。') : null,
          ),
          h('div', { className: 'dsh-nb-meta dsh-nb-foot' }, selected + ' / ' + sources.length + ' 个来源已选'),
        ),
        h('section', { className: 'dsh-nb-col is-main' },
          h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-kicker' }, h('span', { className: 'dsh-nb-title' }, notebook ? notebook.title : '笔记本')), notebook ? h('button', { className: 'dsh-nb-chip' + (notebook.grounding === 'sources-only' ? ' is-on' : ''), type: 'button', onClick: () => run('update', { grounding: notebook.grounding === 'sources-only' ? 'sources-plus-tools' : 'sources-only' }) }, notebook.grounding === 'sources-only' ? '只依据来源' : '来源 + 工具') : null),
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
        h('section', { className: 'dsh-nb-col is-studio' },
          h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-kicker' }, h('span', { className: 'dsh-nb-idx', 'aria-hidden': 'true' }, '02'), 'Studio')),
          h('div', { className: 'dsh-nb-studio' },
            STUDIO.map(([kind, label, description]) => h('button', { key: kind, className: 'dsh-nb-card' + (busy === kind ? ' is-busy' : ''), type: 'button', disabled: !notebook || busy === kind, onClick: async () => { setBusy(kind); await run('generate', { kind, prompt: question }); setBusy('') } },
              h(StudioGlyph, { kind }),
              h('span', { className: 'dsh-nb-card-copy' }, h('strong', null, busy === kind ? '下潜整理中…' : label), h('span', null, description)))),
            (state?.artifacts ?? []).map(item => h('button', { key: item.id, className: 'dsh-nb-art' + (artifact && artifact.id === item.id ? ' is-on' : ''), type: 'button', onClick: async () => setArtifact((await api({ op: 'artifact', sessionId, id: item.id })).artifact) }, item.kind + ' · ' + (item.status === 'done' ? '完成' : item.status === 'failed' ? '失败' : '生成中'))),
          ),
          artifact ? h('div', { className: 'dsh-nb-term' },
            h('div', { className: 'dsh-nb-term-bar' }, h('span', null, artifact.kind || 'output'), h('span', null, artifact.status || '')),
            h('pre', { className: 'dsh-nb-preview' }, artifact.body || artifact.error || artifact.status),
          ) : null,
        ),
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
