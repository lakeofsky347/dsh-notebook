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
  height: 248px;
  margin: 0;
  overflow: hidden;
  flex: none;
  background: radial-gradient(ellipse at 55% 55%, rgba(38, 75, 133, .09), transparent 66%);
}
.dsh-nb-caption {
  position: absolute;
  left: 24px;
  top: 16px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(66%, 27em);
  margin: 0;
  pointer-events: none;
  font-family: var(--nb-sans);
  font-size: 11px;
  line-height: 1.5;
  color: #a9bcd9;
}
.dsh-nb-sea-dot { width: 4px; height: 4px; background: #9dc0fb; border-radius: 50%; flex: none; }
.dsh-nb .dsh-nb-particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  animation: none;
}
.dsh-nb-sea.is-compact { height: 82px; border-bottom: 1px solid var(--nb-line); }
.dsh-nb-sea.is-compact .dsh-nb-caption { top: 31px; max-width: 55%; }
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
    const WORKBENCH_CSS = `
.dsh-nb-workbench { display: flex; flex-direction: column; }
.dsh-nb-workbench .dsh-nb-grid { flex: 1; height: auto; grid-template-columns: minmax(240px, 270px) minmax(310px, 1fr) minmax(260px, 320px); }
.dsh-nb-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding: 12px 16px; background: #0e0e11; border-bottom: 1px solid var(--nb-line); flex: none; }
.dsh-nb-toolbar-brand { display: flex; gap: 9px; align-items: center; color: var(--nb-fg); }
.dsh-nb-toolbar-brand strong { font-size: 16px; letter-spacing: -.02em; }
.dsh-nb-toolbar-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.dsh-nb-toolbar-controls .dsh-nb-field { width: 190px; max-width: 100%; }
.dsh-nb-route { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%; }
.dsh-nb-route .dsh-nb-field { width: auto; min-width: 160px; max-width: 280px; flex: 1; }
.dsh-nb-mode { display: flex; align-items: center; border: 1px solid var(--nb-line-strong); border-radius: 8px; padding: 3px; background: #101014; }
.dsh-nb .dsh-nb-mode button { padding: 5px 12px; color: var(--nb-muted); border-radius: 5px; font-size: 12px; }
.dsh-nb .dsh-nb-mode button.on { background: #263555; color: #cbdcff; }
.dsh-nb .dsh-nb-mode button:disabled { opacity: .65; }
.dsh-nb-inline, .dsh-nb-renamebar { display: flex; gap: 8px; align-items: center; }
.dsh-nb-inline .dsh-nb-field { min-width: 0; }
.dsh-nb-inline .dsh-nb-chip { flex: none; }
.dsh-nb-renamebar { padding: 10px 16px; border-bottom: 1px solid var(--nb-line); }
.dsh-nb-renamebar .dsh-nb-field { max-width: 360px; }
.dsh-nb-error, .dsh-nb-notice { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin: 0; padding: 9px 16px; border-radius: 0; flex: none; }
.dsh-nb-error .dsh-nb-chip { flex: none; }
.dsh-nb-notice { background: #142036; border-bottom: 1px solid #283d5c; color: #ccddfa; font-size: 12px; }
.dsh-nb-source-open { display: flex; gap: 9px; text-align: left; align-items: center; min-width: 0; flex: 1; }
.dsh-nb-source-open .dsh-nb-copy { overflow: hidden; }
.dsh-nb-source.is-active { background: rgba(122, 162, 255, .10); border-color: rgba(122, 162, 255, .25); }
.dsh-nb-workbench .dsh-nb-thread { padding: 18px 24px; gap: 20px; }
.dsh-nb-workbench .dsh-nb-hero { padding: 12px 0 22px; }
.dsh-nb-workbench .dsh-nb-hero h2 { font-size: clamp(28px, 6cqi, 43px); margin-top: 18px; }
.dsh-nb-workbench .dsh-nb-sea { margin: 0; }
.dsh-nb-message { min-width: 0; }
.dsh-nb-message-meta { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; color: var(--nb-muted); font-size: 11px; }
.dsh-nb-message.user .dsh-nb-message-meta { color: #a9c1fb; }
.dsh-nb-message-body { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; font-size: 14px; }
.dsh-nb-message.user { padding: 12px 14px; background: #151923; border: 1px solid #273147; border-radius: 10px; }
.dsh-nb-message.tool { border-left: 2px solid #435578; padding: 8px 12px; background: rgba(20, 27, 39, .6); border-radius: 0 8px 8px 0; }
.dsh-nb-message.tool .dsh-nb-message-body { max-height: 170px; overflow: auto; font-size: 12px; color: #b4becf; }
.dsh-nb-message.system .dsh-nb-message-body { color: var(--nb-muted); font-size: 12px; }
.dsh-nb-message.is-failed .dsh-nb-message-body { color: var(--nb-danger); }
.dsh-nb-task { display: flex; align-items: center; gap: 9px; color: #abc7ff; font-size: 12px; padding: 6px 0; }
.dsh-nb-pulse { width: 7px; height: 7px; background: var(--nb-accent); border-radius: 50%; flex: none; animation: dsh-nb-glow 1.3s ease-in-out infinite; }
.dsh-nb-workbench .dsh-nb-composer { margin: 0 16px; padding: 10px 10px 10px 14px; border-radius: 14px; }
.dsh-nb-workbench .dsh-nb-composer textarea { min-height: 54px; max-height: 160px; }
.dsh-nb-composer-hint { padding: 7px 18px 12px; color: #9494a1; font-size: 10px; flex: none; }
.dsh-nb button.dsh-nb-stop { border-color: #775152; color: #ffd0d0; }
.dsh-nb button.dsh-nb-chip:disabled { opacity: .55; }
.dsh-nb-art-heading { color: var(--nb-muted); font-size: 11px; padding: 16px 12px 5px; border-top: 1px solid var(--nb-line); margin-top: 8px; }
.dsh-nb-workbench .dsh-nb-term { margin: 8px 4px; }
.dsh-nb-workbench .dsh-nb-preview { max-height: 420px; font-family: var(--nb-sans); }
.dsh-nb-source-detail { padding: 14px; min-height: 0; overflow: auto; flex: 1; }
.dsh-nb-source-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.dsh-nb-source-tools .dsh-nb-field { flex: 1; min-width: 120px; }
.dsh-nb button.dsh-nb-chip.danger { color: #ffc2c2; border-color: #694348; }
.dsh-nb-source-body { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.7 var(--nb-sans); color: #d1d1da; margin: 14px 0; }
@container notebook (max-width: 960px) {
  .dsh-nb-workbench .dsh-nb-grid { display: block; overflow: auto; }
  .dsh-nb-workbench .dsh-nb-col { border-right: 0; border-bottom: 1px solid var(--nb-line); }
  .dsh-nb-workbench .dsh-nb-thread { min-height: 300px; max-height: 520px; }
  .dsh-nb-workbench .dsh-nb-studio { max-height: 600px; }
  .dsh-nb-workbench .dsh-nb-source-detail { max-height: 520px; }
}
@media (max-width: 600px) {
  .dsh-nb-sea { height: 228px; }
  .dsh-nb-caption { left: 16px; }
  .dsh-nb-toolbar { padding: 10px; gap: 10px; }
  .dsh-nb-toolbar-controls { margin-left: 0; width: 100%; }
  .dsh-nb-toolbar-controls .dsh-nb-field { flex: 1; }
  .dsh-nb-route .dsh-nb-field { min-width: 130px; max-width: none; }
  .dsh-nb-mode { width: 100%; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) { .dsh-nb .dsh-nb-pulse { animation: none; } }
`
    function ensureStyles() {
      let tag = document.getElementById('dsh-notebook-style')
      if (!tag) {
        tag = document.createElement('style')
        tag.id = 'dsh-notebook-style'
        document.head.appendChild(tag)
      }
      tag.textContent = PANEL_CSS + WORKBENCH_CSS
    }
    // Canvas owns its animation lifecycle; React only supplies semantic activity.
    function createParticleSea(canvas, surface, initial) {
      const context = canvas.getContext('2d', { alpha: true })
      if (!context) { canvas.dataset.motion = 'paused'; return { update() {}, dispose() {} } }
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
      const forced = window.matchMedia('(forced-colors: active)')
      const palette = ['#507fc4', '#6396e4', '#7eaff9', '#a7c8ff', '#dbe9ff']
      const profiles = { idle: { speed: .38, spread: .08 }, thinking: { speed: .7, spread: .2 }, collecting: { speed: 1.16, spread: .39 }, writing: { speed: .88, spread: .12 } }
      let config = initial
      let width = 0, height = 0, points = [], frame = 0, lastPaint = 0, elapsed = 2.4
      let visible = true, dead = false, speed = .38, spread = .08
      const pointer = { x: -1000, y: -1000, active: false }
      const glow = document.createElement('canvas')
      glow.width = glow.height = 40
      const glowContext = glow.getContext('2d')
      if (glowContext) {
        const gradient = glowContext.createRadialGradient(20, 20, 0, 20, 20, 20)
        gradient.addColorStop(0, 'rgba(135,185,255,.5)')
        gradient.addColorStop(.24, 'rgba(104,160,255,.16)')
        gradient.addColorStop(1, 'rgba(70,130,255,0)')
        glowContext.fillStyle = gradient; glowContext.fillRect(0, 0, 40, 40)
      }
      function seedPoints(count) {
        let seed = 0x51ed
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
        const result = []
        for (let i = 0; i < count; i++) {
          const u = random(), v = random(), side = random() > .5 ? 1 : -1
          let x, y, z
          const part = i / count
          if (part < .72) {
            // A tapered volumetric body: tail at left, rounded head at right.
            x = -.79 + u * 1.5
            const radius = Math.pow(Math.sin(Math.PI * u), .6) * (.13 + .13 * u)
            const angle = v * Math.PI * 2
            const shell = .69 + random() * .31
            y = Math.cos(angle) * radius * shell + .04 * Math.sin(u * Math.PI)
            z = Math.sin(angle) * radius * .76 * shell
          } else if (part < .85) {
            // Two curved tail flukes joined to the body's narrow peduncle.
            const reach = Math.sqrt(u)
            x = -.72 - reach * .42 + v * .17 * reach
            y = side * reach * (.17 + .10 * v) - .025
            z = Math.sin(v * Math.PI) * .07 * reach
          } else if (part < .93) {
            // Swept dorsal fin, including a little thickness in depth.
            const reach = Math.sqrt(u)
            x = -.16 + v * .33 * (1 - reach) - .09 * reach
            y = -.15 - reach * .36
            z = (random() - .5) * .055 * (1 - reach)
          } else {
            const reach = Math.sqrt(u)
            x = .32 - reach * .32 + v * .17 * (1 - reach)
            y = .12 + reach * .31
            z = side * (.10 + reach * .17)
          }
          const color = y > .075 && x > -.4 ? (random() > .3 ? 4 : 3) : Math.min(4, Math.floor(random() * 4))
          result.push({ x, y, z, u, v, phase: random() * Math.PI * 2, waveX: (random() - .5) * 2.45, waveY: (random() - .5) * .28, waveZ: (random() - .5) * .6, color, alpha: .48 + random() * .48, size: .7 + random() * .7, ox: 0, oy: 0, vx: 0, vy: 0 })
        }
        return result
      }
      function draw(dt = 0, still = false) {
        if (!width || !height || dead) return
        const profile = profiles[config.activity] || profiles.idle
        const target = config.mode === 'sources' ? { speed: profile.speed * .87, spread: Math.max(0, profile.spread - .035) } : profile
        const step = still ? 1 : Math.min(1, dt * 3)
        speed += (target.speed - speed) * step
        spread += (target.spread - spread) * step
        if (!still) elapsed += dt * speed
        const t = still ? 2.4 : elapsed
        context.clearRect(0, 0, width, height)
        if (forced.matches) return
        const scale = Math.min(width * (config.compact ? .24 : .42), height * (config.compact ? .9 : 1.04))
        const centerX = width * (config.compact ? .77 : .53)
        const centerY = height * (config.compact ? .52 : .54)
        const yaw = -.23 + Math.sin(t * .43) * .3
        const roll = -.035 + Math.sin(t * .57) * .055
        const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw), cosRoll = Math.cos(roll), sinRoll = Math.sin(roll)
        const morph = spread + Math.pow((Math.sin(t * .29) + 1) * .5, 3) * .11
        const spring = still ? 1 : Math.min(1.7, dt * 30)
        for (const point of points) {
          const tail = Math.max(0, -point.x - .15)
          const undulation = Math.sin(t * 2.1 + point.x * 3.2)
          const wx = point.waveX + Math.sin(t * .65 + point.phase) * .05
          const wy = Math.sin(point.waveX * 3.5 - t * 1.5) * .17 + point.waveY
          const wz = Math.cos(point.waveX * 2.5 - t) * .18 + point.waveZ
          let x = point.x * (1 - morph) + wx * morph
          let y = (point.y + undulation * (.018 + tail * .085)) * (1 - morph) + wy * morph
          let z = (point.z + Math.cos(t * 1.7 + point.x * 3.4) * tail * .075) * (1 - morph) + wz * morph
          // Slow perspective rotation and per-particle waves preserve the volume.
          const turnedX = x * cosYaw + z * sinYaw
          z = z * cosYaw - x * sinYaw
          x = turnedX * cosRoll - y * sinRoll
          y = y * cosRoll + turnedX * sinRoll
          const perspective = 2.8 / (2.8 - z)
          const homeX = centerX + x * scale * perspective
          const homeY = centerY + y * scale * perspective
          if (still) { point.ox = point.oy = point.vx = point.vy = 0 }
          else {
            if (pointer.active) {
              const dx = homeX + point.ox - pointer.x, dy = homeY + point.oy - pointer.y
              const distance = Math.sqrt(dx * dx + dy * dy)
              const radius = config.compact ? 58 : Math.min(105, width * .22)
              if (distance < radius) {
                const strength = Math.pow(1 - distance / radius, 2) * 5.8 * spring
                point.vx += dx / Math.max(1, distance) * strength
                point.vy += dy / Math.max(1, distance) * strength
              }
            }
            point.vx = (point.vx - point.ox * .055 * spring) * Math.pow(.83, spring)
            point.vy = (point.vy - point.oy * .055 * spring) * Math.pow(.83, spring)
            point.ox += point.vx * spring; point.oy += point.vy * spring
          }
          const px = homeX + point.ox, py = homeY + point.oy
          const depth = Math.max(.45, Math.min(1, .78 + z * .55))
          const radius = point.size * perspective * (config.compact ? .77 : 1)
          context.globalAlpha = point.alpha * depth * (config.compact ? .8 : 1)
          context.fillStyle = palette[point.color]
          context.beginPath(); context.arc(px, py, radius, 0, Math.PI * 2); context.fill()
          if (glowContext && point.color >= 3 && point.u < .09) {
            context.globalAlpha = .38 * depth
            context.drawImage(glow, px - radius * 5, py - radius * 5, radius * 10, radius * 10)
          }
        }
        context.globalAlpha = 1
      }
      function tick(timestamp) {
        frame = 0
        if (dead || !visible || document.hidden || reduced.matches || forced.matches) { synchronize(); return }
        if (!lastPaint || timestamp - lastPaint >= 1000 / 30 - .5) {
          const dt = lastPaint ? Math.min(.08, (timestamp - lastPaint) / 1000) : 1 / 30
          lastPaint = timestamp
          draw(dt)
        }
        frame = requestAnimationFrame(tick)
      }
      function synchronize() {
        if (dead) return
        if (frame) { cancelAnimationFrame(frame); frame = 0 }
        lastPaint = 0
        canvas.dataset.particleMode = config.activity
        const paused = !visible || document.hidden || forced.matches || !width || !height
        canvas.dataset.motion = paused ? 'paused' : reduced.matches ? 'reduced' : 'running'
        if (forced.matches) { context.clearRect(0, 0, width, height); return }
        if (reduced.matches) { draw(0, true); return }
        if (!paused) { draw(0); frame = requestAnimationFrame(tick) }
      }
      function resize() {
        const bounds = surface.getBoundingClientRect()
        const nextWidth = Math.max(0, Math.round(bounds.width)), nextHeight = Math.max(0, Math.round(bounds.height))
        if (nextWidth === width && nextHeight === height) return
        width = nextWidth; height = nextHeight
        const dpr = Math.min(1.5, window.devicePixelRatio || 1)
        canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr))
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        const count = Math.min(1350, Math.max(700, Math.round(width * (config.compact ? 1.25 : 1.85))))
        if (points.length !== count) points = seedPoints(count)
        canvas.dataset.particleCount = String(points.length)
        synchronize()
      }
      function move(event) {
        if (reduced.matches || forced.matches || event.pointerType === 'touch') return
        const bounds = surface.getBoundingClientRect()
        pointer.x = event.clientX - bounds.left; pointer.y = event.clientY - bounds.top; pointer.active = true
      }
      function leave() { pointer.active = false }
      const mediaListen = (query, listener) => {
        if (query.addEventListener) { query.addEventListener('change', listener); return () => query.removeEventListener('change', listener) }
        query.addListener(listener); return () => query.removeListener(listener)
      }
      const unreduce = mediaListen(reduced, synchronize), unforce = mediaListen(forced, synchronize)
      const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
      resizer?.observe(surface)
      if (!resizer) window.addEventListener('resize', resize, { passive: true })
      const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1]
        visible = entry.isIntersecting && entry.intersectionRatio > .01
        synchronize()
      }, { threshold: [0, .01] }) : null
      intersection?.observe(surface)
      surface.addEventListener('pointermove', move, { passive: true }); surface.addEventListener('pointerleave', leave, { passive: true })
      document.addEventListener('visibilitychange', synchronize)
      resize()
      return {
        update(next) { const compactChanged = config.compact !== next.compact; config = next; if (compactChanged) resize(); synchronize() },
        dispose() {
          dead = true
          if (frame) cancelAnimationFrame(frame)
          resizer?.disconnect(); intersection?.disconnect(); unreduce(); unforce()
          surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', leave)
          document.removeEventListener('visibilitychange', synchronize)
          if (!resizer) window.removeEventListener('resize', resize)
          points = []; canvas.dataset.motion = 'paused'
          context.clearRect(0, 0, width, height)
        },
      }
    }
    const STORAGE_KEY = 'dsh-notebook.workspace'
    function rememberedWorkspace() {
      try { return localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
    }
    async function api(body) {
      const response = await fetch('/dsh-notebook/api', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const raw = await response.text()
      if (!raw) throw new Error('笔记本接口没有返回内容（HTTP ' + response.status + '）。请重新打开插件。')
      let payload
      try { payload = JSON.parse(raw) } catch { throw new Error('接口返回了无法读取的内容：' + raw.slice(0, 180)) }
      if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText || '请求失败')
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
    function DeepSea({ activity = 'idle', caption, compact = false, mode = 'research' }) {
      const canvasRef = useRef(null), surfaceRef = useRef(null), controllerRef = useRef(null)
      useEffect(() => {
        if (!canvasRef.current || !surfaceRef.current) return
        const controller = createParticleSea(canvasRef.current, surfaceRef.current, { activity, compact, mode })
        controllerRef.current = controller
        return () => { controller.dispose(); controllerRef.current = null }
      }, [])
      useEffect(() => { controllerRef.current?.update({ activity, compact, mode }) }, [activity, compact, mode])
      return h('div', { className: 'dsh-nb-sea' + (compact ? ' is-compact' : ''), ref: surfaceRef },
        h('canvas', { className: 'dsh-nb-particles dsh-nb-cloud', ref: canvasRef, 'aria-hidden': 'true', 'data-particle-mode': activity }),
        h('div', { className: 'dsh-nb-caption', role: 'status' }, h('span', { className: 'dsh-nb-sea-dot', 'aria-hidden': 'true' }), caption))
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
    function pendingArtifact(item) { return ['pending', 'queued', 'running'].includes(item.status) }
    const TOOL_LABELS = {
      web_search: '搜索网页', web_fetch: '读取网页', notebook_list: '查看笔记本', notebook_create: '创建笔记本', notebook_open: '打开笔记本', notebook_update: '更新笔记本',
      notebook_add_source: '保存来源', notebook_set_sources: '调整来源', notebook_note: '保存笔记', notebook_search: '检索资料', notebook_source: '读取来源', notebook_sources: '查看来源',
      notebook_generate: '生成产物', notebook_rename_source: '重命名来源', notebook_delete_source: '删除来源', notebook_artifacts: '查看产物', notebook_artifact: '读取产物',
    }
    function phaseLabel(phase) {
      if (!phase) return '正在处理你的问题…'
      if (phase.startsWith('tool:')) return '正在' + (TOOL_LABELS[phase.slice(5)] || '执行工具') + '…'
      return ({ preparing: '正在准备研究计划…', thinking: '正在思考…', answering: '正在生成回答…', stopping: '正在停止运行…', running: '正在运行…', done: '已完成', completed: '已完成', failed: '运行失败', cancelled: '已停止' })[phase] || phase
    }

    function NotebookScreen({ sessionId }) {
      const [workspaceId, setWorkspaceId] = useState(rememberedWorkspace)
      const [state, setState] = useState(null)
      const [catalog, setCatalog] = useState(null)
      const [catalogError, setCatalogError] = useState('')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [pending, setPending] = useState({})
      const [question, setQuestion] = useState('')
      const [adding, setAdding] = useState('')
      const [sourceTitle, setSourceTitle] = useState('')
      const [draft, setDraft] = useState('')
      const [path, setPath] = useState('')
      const [url, setUrl] = useState('')
      const [notebookTitle, setNotebookTitle] = useState('')
      const [sourceFilter, setSourceFilter] = useState('')
      const [rightTab, setRightTab] = useState('studio')
      const [source, setSource] = useState(null)
      const [sourceName, setSourceName] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)
      const [artifactId, setArtifactId] = useState('')
      const [artifact, setArtifact] = useState(null)
      const [renamingWorkspace, setRenamingWorkspace] = useState(false)
      const [workspaceTitle, setWorkspaceTitle] = useState('')
      const active = useRef(workspaceId)
      const stateSequence = useRef(0)
      const detailSequence = useRef(0)
      const sourceSequence = useRef(0)
      const initialization = useRef(null)
      const defaultRoute = useRef('')
      const mounted = useRef(false)
      const threadRef = useRef(null)
      const hostSession = useRef(sessionId)
      hostSession.current = sessionId
      const notebookScope = useRef('')
      notebookScope.current = state?.notebookId || ''
      const notebook = state?.notebook
      const workspace = state?.workspace
      const sources = state?.sources ?? []
      const artifacts = state?.artifacts ?? []
      const messages = (state?.messages ?? []).filter(item => !(item.role === 'assistant' && ['done', 'completed'].includes(item.status) && !String(item.text || '').trim()))
      const task = state?.task
      const running = task?.status === 'running' || Boolean(pending.chat)
      const selected = sources.filter(item => item.enabled && item.status === 'ready').length
      const providers = catalog?.providers ?? []
      const usableProviders = providers.filter(item => item.models?.length)
      const inherited = state?.selectedRoute || catalog?.selectedRoute || {}
      const providerId = workspace?.provider || inherited.provider || usableProviders[0]?.id || ''
      const provider = providers.find(item => item.id === providerId)
      const modelId = workspace?.model || (inherited.provider === providerId ? inherited.model : '') || provider?.models?.[0]?.id || ''
      const mode = workspace?.mode || 'research'
      const hasRoute = Boolean(providerId && modelId && provider?.models?.some(item => item.id === modelId))
      const busyStudio = artifacts.some(pendingArtifact) || Object.keys(pending).some(key => key.startsWith('generate:') && pending[key])
      const canSend = Boolean(workspaceId && hasRoute && question.trim() && !running && (mode === 'research' || (notebook && selected)))
      function chooseWorkspace(id) {
        active.current = id
        setWorkspaceId(id)
      }
      async function refresh(target, quiet = false) {
        const sequence = ++stateSequence.current
        try {
          const next = await api({ op: 'state', sessionId: hostSession.current || undefined, ...(target ? { workspaceId: target } : {}) })
          if (!mounted.current || active.current !== target || sequence !== stateSequence.current) return null
          const actualId = next.workspaceId || next.workspace?.id || ''
          if (actualId && actualId !== target) { chooseWorkspace(actualId); return next }
          if (!actualId && !(next.workspaces?.length)) {
            if (!initialization.current) initialization.current = api({ op: 'workspaceCreate' }).finally(() => { initialization.current = null })
            const created = await initialization.current
            if (mounted.current && active.current === target) chooseWorkspace(created.workspaceId || created.workspace.id)
            return null
          }
          if (!actualId && next.workspaces?.[0]?.id) { chooseWorkspace(next.workspaces[0].id); return next }
          setState(next)
          if (!quiet) setError('')
          return next
        } catch (err) {
          if (mounted.current && active.current === target && sequence === stateSequence.current) {
            if (target && /workspace not found/i.test(err.message)) {
              try { localStorage.removeItem(STORAGE_KEY) } catch {}
              chooseWorkspace('')
            } else setError(err.message)
          }
          return null
        }
      }
      async function run(op, extra = {}, key = op) {
        const target = active.current
        if (!target) { setError('工作台正在准备，请稍后重试。'); return null }
        setPending(items => ({ ...items, [key]: true }))
        setError(''); setNotice('')
        try {
          const result = await api({ op, workspaceId: target, ...extra })
          if (mounted.current && active.current === target) await refresh(target, true)
          return active.current === target ? result : null
        } catch (err) {
          if (mounted.current && active.current === target) setError(err.message)
          return null
        } finally {
          if (mounted.current && active.current === target) setPending(items => ({ ...items, [key]: false }))
        }
      }
      async function loadCatalog() {
        setCatalogError('')
        try { const next = await api({ op: 'catalog' }); if (mounted.current) setCatalog(next) }
        catch (err) { if (mounted.current) setCatalogError(err.message) }
      }
      useEffect(() => {
        mounted.current = true
        ensureStyles()
        loadCatalog()
        return () => { mounted.current = false; stateSequence.current++; detailSequence.current++; sourceSequence.current++ }
      }, [])
      useEffect(() => {
        active.current = workspaceId
        setState(null); setPending({}); setError(''); setNotice(''); setQuestion(''); setSource(null); setArtifact(null); setArtifactId(''); setRenamingWorkspace(false); setAdding(''); setSourceTitle(''); setDraft(''); setPath(''); setUrl(''); setNotebookTitle(''); setSourceFilter('')
        try { if (workspaceId) localStorage.setItem(STORAGE_KEY, workspaceId) } catch {}
        refresh(workspaceId)
        const timer = setInterval(() => refresh(workspaceId, true), 2000)
        return () => { clearInterval(timer); stateSequence.current++; detailSequence.current++; sourceSequence.current++ }
      }, [workspaceId])
      useEffect(() => {
        detailSequence.current++; sourceSequence.current++
        setArtifactId(''); setArtifact(null); setSource(null); setSourceName(''); setConfirmDelete(false)
      }, [state?.notebookId])
      useEffect(() => {
        if (!workspace?.id || (workspace.provider && workspace.model) || !hasRoute) return
        const key = workspace.id + ':' + providerId + ':' + modelId
        if (defaultRoute.current === key) return
        defaultRoute.current = key
        run('workspaceUpdate', { provider: providerId, model: modelId })
      }, [workspace?.id, workspace?.provider, workspace?.model, providerId, modelId])
      useEffect(() => {
        if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
      }, [messages.length, messages[messages.length - 1]?.text, task?.phase])
      useEffect(() => {
        if (!artifactId || !workspaceId || !artifacts.some(item => item.id === artifactId)) return
        const target = workspaceId
        const sequence = ++detailSequence.current
        api({ op: 'artifact', workspaceId: target, id: artifactId }).then(result => {
          if (mounted.current && active.current === target && detailSequence.current === sequence) setArtifact(result.artifact)
        }).catch(err => { if (mounted.current && active.current === target && detailSequence.current === sequence) setError(err.message) })
      }, [workspaceId, artifactId, state?.artifacts])
      async function createWorkspace() {
        const target = active.current
        setPending(items => ({ ...items, workspaceCreate: true })); setError('')
        try {
          const result = await api({ op: 'workspaceCreate' })
          if (mounted.current && active.current === target) chooseWorkspace(result.workspaceId || result.workspace.id)
        } catch (err) { setError(err.message) }
        finally { if (mounted.current) setPending(items => ({ ...items, workspaceCreate: false })) }
      }
      async function ask(text) {
        const value = text.trim()
        if (!value || running || !workspaceId) return
        if (!hasRoute) { setError('请先选择可用的模型。'); return }
        if (mode === 'sources' && (!notebook || !selected)) { setError('资料问答需要先添加并勾选可用来源。'); return }
        const target = workspaceId
        setQuestion('')
        const result = await run('chat', { text: value, provider: providerId, model: modelId, mode })
        if (!result && active.current === target) setQuestion(value)
      }
      async function viewSource(id) {
        const target = workspaceId
        const sequence = ++sourceSequence.current
        const targetNotebook = notebookScope.current
        setRightTab('source'); setSource(null); setConfirmDelete(false)
        try {
          const result = await api({ op: 'source', workspaceId: target, id })
          if (mounted.current && active.current === target && notebookScope.current === targetNotebook && sequence === sourceSequence.current) { setSource(result.source); setSourceName(result.source.title || '') }
        } catch (err) { if (mounted.current && active.current === target && notebookScope.current === targetNotebook && sequence === sourceSequence.current) setError(err.message) }
      }
      async function addSource() {
        const result = adding === 'file' ? await run('addFile', { path }) : adding === 'url' ? await run('addUrl', { url }) : await run('addText', { title: sourceTitle || '粘贴文本', text: draft })
        if (result) { setDraft(''); setPath(''); setUrl(''); setSourceTitle(''); setAdding('') }
      }
      const filtered = sources.filter(item => !sourceFilter || (item.title || '').toLowerCase().includes(sourceFilter.toLowerCase()))
      const particleActivity = busyStudio || (running && task?.phase === 'answering') ? 'writing' : running && task?.phase?.startsWith('tool:') ? 'collecting' : running || !state ? 'thinking' : 'idle'
      const caption = running ? phaseLabel(task?.phase) : busyStudio ? '正在整理 Studio 产物' : state ? '工作台已就绪' : '正在读取工作台…'
      const chip = (label, onClick, extra = {}) => h('button', { className: 'dsh-nb-chip', type: 'button', onClick, ...extra }, label)
      return h('div', { className: 'dsh-nb dsh-nb-workbench' },
        h('header', { className: 'dsh-nb-toolbar' },
          h('div', { className: 'dsh-nb-toolbar-brand' }, h(NotebookIcon, { size: 20 }), h('strong', null, 'Notebook'), h('span', { className: 'dsh-nb-meta' }, '研究工作台')),
          h('div', { className: 'dsh-nb-toolbar-controls' },
            h('select', { className: 'dsh-nb-field dsh-nb-workspaces', 'aria-label': '工作台会话', value: workspaceId, onChange: event => chooseWorkspace(event.target.value) },
              !workspaceId ? h('option', { value: '' }, '准备工作台…') : null,
              ...(state?.workspaces ?? (workspaceId ? [{ id: workspaceId, title: '正在读取…' }] : [])).map(item => h('option', { key: item.id, value: item.id }, item.title))),
            chip('+ 新会话', createWorkspace, { disabled: pending.workspaceCreate, 'data-action': 'new-workspace' }),
            chip('重命名', () => { setWorkspaceTitle(workspace?.title || ''); setRenamingWorkspace(!renamingWorkspace) }, { disabled: !workspace }),
            chip('关联当前对话', async () => { if (await run('bindSession', { sessionId })) setNotice('已将这个笔记本关联到当前宿主对话。') }, { disabled: !sessionId || !notebook || pending.bindSession, title: sessionId ? '把当前笔记本绑定到宿主对话' : '先在宿主中打开一个对话', 'data-action': 'bind-session' }),
          ),
          h('div', { className: 'dsh-nb-route' },
            h('select', { className: 'dsh-nb-field', 'aria-label': '模型提供方', value: providerId, disabled: !workspace || running, onChange: event => {
              const next = providers.find(item => item.id === event.target.value)
              if (next?.models?.length) run('workspaceUpdate', { provider: next.id, model: next.models[0].id })
            } },
              !providerId ? h('option', { value: '' }, '无可用提供方') : null,
              providerId && !provider ? h('option', { value: providerId }, providerId + '（暂不可用）') : null,
              ...providers.map(item => h('option', { key: item.id, value: item.id, disabled: !item.models?.length }, item.name || item.id))),
            h('select', { className: 'dsh-nb-field', 'aria-label': '对话模型', value: modelId, disabled: !workspace || !provider?.models?.length || running, onChange: event => run('workspaceUpdate', { provider: providerId, model: event.target.value }) },
              !modelId ? h('option', { value: '' }, '无可用模型') : null,
              modelId && !provider?.models?.some(item => item.id === modelId) ? h('option', { value: modelId }, modelId + '（暂不可用）') : null,
              ...(provider?.models ?? []).map(item => h('option', { key: item.id, value: item.id }, item.name || item.id))),
            h('div', { className: 'dsh-nb-mode', role: 'group', 'aria-label': '工作模式' },
              ['sources', 'research'].map(value => h('button', { key: value, type: 'button', className: mode === value ? 'on' : '', disabled: !workspace || running, 'aria-pressed': mode === value, onClick: () => run('workspaceUpdate', { mode: value }), 'data-mode': value }, value === 'sources' ? '资料问答' : '搜集构建')))),
        ),
        renamingWorkspace ? h('form', { className: 'dsh-nb-renamebar', onSubmit: async event => { event.preventDefault(); if (workspaceTitle.trim() && await run('workspaceUpdate', { title: workspaceTitle.trim() })) setRenamingWorkspace(false) } },
          h('input', { className: 'dsh-nb-field', 'aria-label': '工作台名称', value: workspaceTitle, onChange: event => setWorkspaceTitle(event.target.value) }), h('button', { className: 'dsh-nb-chip primary', type: 'submit', disabled: !workspaceTitle.trim() }, '保存名称'), chip('取消', () => setRenamingWorkspace(false))) : null,
        error ? h('div', { className: 'dsh-nb-error', role: 'alert' }, h('span', null, error), chip('关闭', () => setError(''))) : null,
        notice ? h('div', { className: 'dsh-nb-notice', role: 'status' }, notice) : null,
        catalogError || (!hasRoute && catalog) ? h('div', { className: 'dsh-nb-notice' }, h('span', null, catalogError || '没有可用模型。请先在 DSH 模型设置中配置提供方，再刷新模型目录。'), chip('刷新模型', loadCatalog)) : null,
        provider?.error ? h('div', { className: 'dsh-nb-notice' }, provider.error) : null,
        mode === 'research' && state?.capabilities?.search === false ? h('div', { className: 'dsh-nb-notice' }, '当前未启用网页搜索，可提供网址或本地路径。') : null,
        h('div', { className: 'dsh-nb-grid' },
          h('section', { className: 'dsh-nb-col is-sources' },
            h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-kicker' }, h('span', { className: 'dsh-nb-idx', 'aria-hidden': 'true' }, '01'), '笔记本与来源'), chip(adding ? '关闭' : '+ 来源', () => setAdding(adding ? '' : 'text'), { disabled: !notebook })),
            h('div', { className: 'dsh-nb-form' },
              h('select', { className: 'dsh-nb-field', 'aria-label': '当前笔记本', disabled: running || !workspace, value: state?.notebookId || '', onChange: async event => { if (event.target.value && await run('open', { notebookId: event.target.value })) { setSource(null); setArtifact(null); setArtifactId('') } } },
                h('option', { value: '' }, '选择笔记本'), ...(state?.notebooks ?? []).map(item => h('option', { key: item.id, value: item.id }, item.title))),
              h('form', { className: 'dsh-nb-inline', onSubmit: async event => { event.preventDefault(); if (await run('create', { title: notebookTitle.trim() || '未命名笔记本', bind: true, grounding: mode === 'sources' ? 'sources-only' : 'sources-plus-tools' })) setNotebookTitle('') } },
                h('input', { className: 'dsh-nb-field', placeholder: '新笔记本名称', 'aria-label': '新笔记本名称', value: notebookTitle, onChange: event => setNotebookTitle(event.target.value) }), h('button', { className: 'dsh-nb-chip', type: 'submit', disabled: !workspace || pending.create || running }, '新建')),
              adding ? h('div', { className: 'dsh-nb-add' },
                h('div', { className: 'dsh-nb-tabs' }, ['text', 'file', 'url'].map(kind => h('button', { key: kind, type: 'button', className: adding === kind ? 'on' : '', onClick: () => setAdding(kind) }, kind === 'text' ? '文本' : kind === 'file' ? '文件' : '网址'))),
                adding === 'text' ? h('input', { className: 'dsh-nb-field', 'aria-label': '来源标题', placeholder: '来源标题（可选）', value: sourceTitle, onChange: event => setSourceTitle(event.target.value) }) : null,
                adding === 'text' ? h('textarea', { className: 'dsh-nb-field dsh-nb-area', 'aria-label': '来源内容', placeholder: '粘贴资料', value: draft, onChange: event => setDraft(event.target.value) }) : null,
                adding === 'file' ? h('input', { className: 'dsh-nb-field', 'aria-label': '文本文件绝对路径', placeholder: '文本文件绝对路径', value: path, onChange: event => setPath(event.target.value) }) : null,
                adding === 'url' ? h('input', { className: 'dsh-nb-field', 'aria-label': '来源网址', placeholder: 'https://', value: url, onChange: event => setUrl(event.target.value) }) : null,
                chip('加入来源', addSource, { className: 'dsh-nb-chip primary', disabled: Boolean(pending.addText || pending.addFile || pending.addUrl) || !(adding === 'file' ? path.trim() : adding === 'url' ? url.trim() : draft.trim()), 'data-action': 'add-source' })) : null,
              sources.length ? h('input', { className: 'dsh-nb-field', type: 'search', placeholder: '查找来源', 'aria-label': '查找来源', value: sourceFilter, onChange: event => setSourceFilter(event.target.value) }) : null),
            h('div', { className: 'dsh-nb-scroll' },
              filtered.map(item => h('div', { key: item.id, className: 'dsh-nb-source' + (source?.id === item.id ? ' is-active' : '') },
                h('input', { className: 'dsh-nb-check', type: 'checkbox', 'aria-label': '使用来源：' + item.title, checked: item.enabled, disabled: pending.setSources, onChange: event => run('setSources', { changes: [{ id: item.id, enabled: event.target.checked }] }) }),
                h('button', { className: 'dsh-nb-source-open', type: 'button', onClick: () => viewSource(item.id), title: '查看来源原文' }, h(KindMark, { kind: item.kind }), h('span', { className: 'dsh-nb-copy' }, h('span', { className: 'dsh-nb-title' }, item.title), h('span', { className: 'dsh-nb-meta' }, (item.kind === 'url' ? '网页' : item.kind === 'file' ? '文件' : item.kind === 'note' ? '笔记' : '文本') + ' · ' + (item.status === 'ready' ? '可用' : item.status)))))),
              !sources.length ? h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, notebook ? '添加文本、Markdown、CSV、JSON 或网页，也可以让模型在「搜集构建」中收集资料。' : '新建笔记本，或在「搜集构建」中描述研究目标。') : !filtered.length ? h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, '没有匹配的来源。') : null),
            h('div', { className: 'dsh-nb-foot' }, selected + ' / ' + sources.length + ' 个来源已选')),
          h('section', { className: 'dsh-nb-col is-main' },
            h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-title' }, workspace?.title || '研究工作台'), h('span', { className: 'dsh-nb-meta' }, mode === 'sources' ? '仅使用勾选资料' : '可使用资料搜集工具')),
            h(DeepSea, { activity: particleActivity, caption, compact: messages.length > 0, mode }),
            h('div', { className: 'dsh-nb-thread', ref: threadRef, 'aria-live': 'polite', 'aria-relevant': 'additions text' },
              !messages.length ? h('div', { className: 'dsh-nb-hero' }, h('h2', null, mode === 'sources' ? '与资料对话' : '从一个问题开始研究'), h('p', { className: 'dsh-nb-meta' }, mode === 'sources' ? '回答仅依据当前笔记本中勾选的来源。' : '选择模型，描述目标。模型可以搜集网页与本地资料，创建笔记本并整理来源。'), h('div', { className: 'dsh-nb-suggest' }, (mode === 'sources' ? SUGGEST : ['围绕我的研究目标搜集资料并建立笔记本', '读取本地资料，整理主题与证据']).map(text => chip(text, () => setQuestion(text), { disabled: running })))) : null,
              messages.map((item, index) => h('article', { key: item.id || index, className: 'dsh-nb-message ' + item.role + (item.status === 'failed' ? ' is-failed' : '') },
                h('div', { className: 'dsh-nb-message-meta' }, h('span', null, item.role === 'user' ? '你' : item.role === 'assistant' ? '助手' : item.role === 'tool' ? (TOOL_LABELS[item.toolName] || item.toolName || '工具') : '工作台'), item.status && !['done', 'completed'].includes(item.status) ? h('span', null, ({ running: '执行中', pending: '等待中', streaming: '回答中', failed: '失败', cancelled: '已停止' })[item.status] || item.status) : null),
                h('div', { className: 'dsh-nb-message-body' }, item.text || (item.role === 'assistant' && running ? '正在思考…' : '')))),
              running ? h('div', { className: 'dsh-nb-task', role: 'status' }, h('span', { className: 'dsh-nb-pulse', 'aria-hidden': 'true' }), phaseLabel(task?.phase)) : task?.status === 'failed' ? h('div', { className: 'dsh-nb-error', role: 'alert' }, task.error || '这次运行失败，请调整后重试。') : task?.status === 'cancelled' ? h('div', { className: 'dsh-nb-meta dsh-nb-task' }, '本次运行已停止。') : null),
            h('form', { className: 'dsh-nb-composer', onSubmit: event => { event.preventDefault(); if (canSend) ask(question) } },
              h('textarea', { rows: 3, 'aria-label': '发送给模型的消息', placeholder: !hasRoute ? '先选择可用模型' : mode === 'sources' ? '就已选资料提问…' : '描述研究目标、网址或本地资料路径…', value: question, onChange: event => setQuestion(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) { event.preventDefault(); if (canSend) ask(question) } } }),
              running ? chip(pending.cancel ? '停止中…' : '停止', () => run('cancel'), { className: 'dsh-nb-chip dsh-nb-stop', disabled: pending.cancel, 'data-action': 'stop' }) : h('button', { className: 'dsh-nb-send', type: 'submit', disabled: !canSend, 'aria-label': '发送' }, '↑')),
            h('div', { className: 'dsh-nb-composer-hint' }, mode === 'sources' ? '资料问答 · 仅使用勾选来源 · Shift + Enter 换行' : '搜集构建 · 模型可以调用工具整理资料 · Shift + Enter 换行')),
          h('section', { className: 'dsh-nb-col is-studio' },
            h('div', { className: 'dsh-nb-head' }, h('div', { className: 'dsh-nb-tabs' }, ['studio', 'source'].map(tab => h('button', { key: tab, type: 'button', className: rightTab === tab ? 'on' : '', onClick: () => setRightTab(tab) }, tab === 'studio' ? 'Studio' : '来源原文')))),
            rightTab === 'studio' ? h('div', { className: 'dsh-nb-studio' },
              h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, '根据勾选来源生成，使用当前所选模型。'),
              STUDIO.map(([kind, label, description]) => { const busy = Boolean(pending['generate:' + kind]) || artifacts.some(item => item.kind === kind && pendingArtifact(item)); return h('button', { key: kind, className: 'dsh-nb-card' + (busy ? ' is-busy' : ''), type: 'button', disabled: !notebook || !selected || !hasRoute || busy, onClick: async () => { const result = await run('generate', { kind, prompt: question, provider: providerId, model: modelId }, 'generate:' + kind); if (result?.artifactId) { setArtifactId(result.artifactId); setArtifact(null) } } }, h(StudioGlyph, { kind }), h('span', { className: 'dsh-nb-card-copy' }, h('strong', null, busy ? '生成中…' : label), h('span', null, description))) }),
              artifacts.length ? h('div', { className: 'dsh-nb-art-heading' }, '已生成 · ' + artifacts.length) : null,
              artifacts.map(item => h('button', { key: item.id, className: 'dsh-nb-art' + (artifactId === item.id ? ' is-on' : ''), type: 'button', onClick: () => { setArtifactId(item.id); setArtifact(null) } }, (STUDIO.find(entry => entry[0] === item.kind)?.[1] || item.kind) + ' · ' + (item.status === 'done' ? '完成' : item.status === 'failed' ? '失败' : item.status === 'cancelled' ? '已停止' : '生成中'))),
              artifact ? h('div', { className: 'dsh-nb-term' }, h('div', { className: 'dsh-nb-term-bar' }, h('span', null, STUDIO.find(entry => entry[0] === artifact.kind)?.[1] || artifact.kind), h('span', null, artifact.status)), h('pre', { className: 'dsh-nb-preview' }, artifact.body || artifact.error || '正在生成…')) : artifactId ? h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, '正在读取产物…') : null) : h('div', { className: 'dsh-nb-source-detail' },
              source ? h('div', null,
                h('form', { className: 'dsh-nb-source-tools', onSubmit: async event => { event.preventDefault(); if (sourceName.trim() && await run('renameSource', { id: source.id, title: sourceName.trim() })) setSource(current => ({ ...current, title: sourceName.trim() })) } }, h('input', { className: 'dsh-nb-field', 'aria-label': '来源名称', value: sourceName, onChange: event => setSourceName(event.target.value) }), h('button', { className: 'dsh-nb-chip', type: 'submit', disabled: !sourceName.trim() || pending.renameSource }, '保存名称')),
                h('div', { className: 'dsh-nb-source-tools' }, chip(confirmDelete ? '确认删除来源' : '删除来源', async () => { if (!confirmDelete) { setConfirmDelete(true); return } if (await run('deleteSource', { id: source.id })) { setSource(null); setConfirmDelete(false) } }, { className: 'dsh-nb-chip danger', disabled: pending.deleteSource }), confirmDelete ? chip('取消', () => setConfirmDelete(false)) : null),
                h('div', { className: 'dsh-nb-meta' }, source.locator || source.url || source.path || source.kind), h('pre', { className: 'dsh-nb-source-body' }, source.body || source.text || '来源内容为空。')) : h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, '点击左侧来源，查看保存的原文并管理名称。')))),
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
