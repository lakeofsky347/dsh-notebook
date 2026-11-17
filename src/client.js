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
  --nb-bg: #101113; --nb-panel: #1b1d20; --nb-soft: #24272d;
  --nb-fg: #e7e9ef; --nb-muted: #a3aab7; --nb-line: #30343c;
  --nb-accent: #8baeff; --nb-accent-soft: #253452; --nb-danger: #ffc1c1;
  --nb-particle-1: #507fc4; --nb-particle-2: #6396e4; --nb-particle-3: #7eaff9; --nb-particle-4: #a7c8ff; --nb-particle-5: #dbe9ff;
  --nb-left: clamp(224px, 22cqi, 260px); --nb-right: clamp(256px, 24cqi, 288px);
  height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column;
  background: var(--nb-bg); color: var(--nb-fg); color-scheme: dark;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  container: notebook / inline-size; -webkit-font-smoothing: antialiased;
}
.dsh-nb *, .dsh-nb *::before, .dsh-nb *::after { box-sizing: border-box; }
.dsh-nb p, .dsh-nb h2, .dsh-nb h3 { margin: 0; }
.dsh-nb button, .dsh-nb input, .dsh-nb textarea, .dsh-nb select { font: inherit; color: inherit; }
.dsh-nb button { padding: 0; border: 0; background: transparent; cursor: pointer; }
.dsh-nb button:disabled { cursor: not-allowed; opacity: .48; }
.dsh-nb :focus-visible { outline: 2px solid var(--nb-accent); outline-offset: 3px; }
.dsh-nb ::selection { background: var(--nb-accent-soft); color: var(--nb-fg); }
.dsh-nb svg { flex: none; }
.dsh-nb [hidden] { display: none !important; }
.dsh-nb-meta { font-size: 12px; line-height: 1.5; color: var(--nb-muted); overflow-wrap: anywhere; }
.dsh-nb-empty { padding: 12px 4px; }
.dsh-nb button.dsh-nb-chip { border: 1px solid var(--nb-line); border-radius: 9px; padding: 7px 11px; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.dsh-nb button.dsh-nb-chip:hover:not(:disabled), .dsh-nb .dsh-nb-quiet:hover:not(:disabled), .dsh-nb .dsh-nb-icon-button:hover:not(:disabled) { background: var(--nb-soft); }
.dsh-nb button.dsh-nb-chip.primary { background: var(--nb-accent-soft); color: var(--nb-accent); border-color: transparent; }
.dsh-nb button.danger { color: var(--nb-danger); }
.dsh-nb .dsh-nb-quiet { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 6px 9px; border-radius: 8px; font-size: 12px; white-space: nowrap; }
.dsh-nb .dsh-nb-icon-button { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; color: var(--nb-muted); }
.dsh-nb-toolbar { flex: none; min-height: 60px; display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
.dsh-nb-toolbar-brand { color: var(--nb-accent); display: flex; }
.dsh-nb .dsh-nb-notebook-trigger { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 55%; font-size: 16px; font-weight: 500; text-align: left; }
.dsh-nb-notebook-trigger span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-nb-toolbar-controls { display: flex; gap: 3px; align-items: center; margin-left: auto; flex: none; }
.dsh-nb-pane-tabs { display: none; flex: none; gap: 6px; padding: 0 12px 10px; }
.dsh-nb-pane-tabs button { flex: 1; padding: 8px; color: var(--nb-muted); border-radius: 8px; font-size: 12px; }
.dsh-nb-pane-tabs button[aria-pressed=true] { background: var(--nb-accent-soft); color: var(--nb-accent); }
.dsh-nb-grid { flex: 1; min-height: 0; min-width: 0; display: grid; grid-template-columns: var(--nb-left) minmax(0, 1fr) var(--nb-right); gap: 12px; padding: 0 12px 12px; }
.dsh-nb-col { min-height: 0; min-width: 0; display: flex; flex-direction: column; border-radius: 16px; }
.dsh-nb-col.is-sources, .dsh-nb-col.is-studio { background: var(--nb-panel); }
.dsh-nb-head { flex: none; display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 14px; }
.dsh-nb-head > .dsh-nb-icon-button { margin-left: auto; }
.dsh-nb-title { font-weight: 500; }
.dsh-nb-head .dsh-nb-title { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; min-width: 0; }
.dsh-nb-head .dsh-nb-meta { font-size: 11px; }
.dsh-nb-head .dsh-nb-scope { margin-left: auto; white-space: nowrap; }
.dsh-nb-count { font-size: 11px; color: var(--nb-muted); }
.dsh-nb-source-tools-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px; gap: 7px; padding: 0 12px 12px; }
.dsh-nb-source-tools-row .dsh-nb-icon-button { width: 34px; height: 34px; border: 1px solid var(--nb-line); }
.dsh-nb-source-tools-row .dsh-nb-build-entry { grid-column: 1 / -1; }
.dsh-nb-source-search { padding: 0 12px; }
.dsh-nb-source-search .dsh-nb-field { border-color: transparent; background: var(--nb-bg); font-size: 12px; min-height: 34px; }
.dsh-nb-source-summary { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; color: var(--nb-muted); padding: 12px 14px 5px; }
.dsh-nb-source-summary label { display: inline-flex; gap: 7px; align-items: center; }
.dsh-nb-check { width: 14px; height: 14px; margin: 0; flex: none; accent-color: var(--nb-accent); }
.dsh-nb-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 6px 10px; }
.dsh-nb-source { display: flex; align-items: center; gap: 8px; padding: 10px 7px; border-radius: 9px; }
.dsh-nb-source:hover { background: var(--nb-soft); }
.dsh-nb-source-open { flex: 1; min-width: 0; display: flex; gap: 9px; align-items: center; text-align: left; }
.dsh-nb-mark { color: var(--nb-muted); display: inline-flex; flex: none; }
.dsh-nb-copy { display: grid; gap: 3px; min-width: 0; }
.dsh-nb-copy .dsh-nb-title { display: block; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 12px; font-weight: 400; }
.dsh-nb-copy .dsh-nb-meta { font-size: 11px; }
.dsh-nb-foot { font-size: 11px; color: var(--nb-muted); padding: 10px 14px 14px; flex: none; }
.dsh-nb-rail { display: none; flex-direction: column; align-items: center; gap: 14px; padding-top: 9px; color: var(--nb-muted); font-size: 11px; }
.dsh-nb[data-sources-collapsed=true] { --nb-left: 42px; }
.dsh-nb[data-studio-collapsed=true] { --nb-right: 42px; }
.dsh-nb[data-sources-collapsed=true] .is-sources > :not(.dsh-nb-rail), .dsh-nb[data-studio-collapsed=true] .is-studio > :not(.dsh-nb-rail) { display: none; }
.dsh-nb[data-sources-collapsed=true] .is-sources .dsh-nb-rail, .dsh-nb[data-studio-collapsed=true] .is-studio .dsh-nb-rail { display: flex; }
.dsh-nb-thread { flex: 1; min-height: 0; overflow: auto; padding: 0 16px 18px; overflow-wrap: anywhere; }
.dsh-nb-hero { text-align: center; padding: 4px 0 24px; }
.dsh-nb-hero h2 { font-size: 24px; line-height: 1.35; font-weight: 500; letter-spacing: -.6px; margin: 8px 0; }
.dsh-nb-hero .dsh-nb-meta { max-width: 34em; margin: auto; }
.dsh-nb-suggest { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; margin-top: 22px; }
.dsh-nb-suggest button { border: 1px solid var(--nb-line); background: var(--nb-panel); padding: 7px 11px; border-radius: 10px; font-size: 12px; }
.dsh-nb-suggest button:hover:not(:disabled) { border-color: var(--nb-accent); }
.dsh-nb-sea { height: 195px; margin: 0 8px 12px; flex: none; position: relative; transition: height .65s cubic-bezier(.22,.75,.25,1), margin .65s cubic-bezier(.22,.75,.25,1); }
.dsh-nb-sea.is-compact { position: sticky; top: 0; z-index: 1; background: var(--nb-bg); height: 30px; margin-bottom: 14px; }
.dsh-nb-particles { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
.dsh-nb-caption { position: absolute; top: 6px; left: 6px; display: none; align-items: center; gap: 7px; max-width: 62%; color: var(--nb-accent); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.dsh-nb-sea.is-compact .dsh-nb-caption { display: block; }
.dsh-nb-sea-dot { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: currentColor; vertical-align: middle; margin-right: 7px; }
.dsh-nb-message { margin: 0 0 22px; min-width: 0; }
.dsh-nb-message.user { background: var(--nb-soft); border-radius: 14px 14px 4px 14px; padding: 10px 14px; width: fit-content; max-width: 92%; margin-left: auto; }
.dsh-nb-message-meta { display: flex; gap: 8px; font-size: 11px; color: var(--nb-muted); margin-bottom: 6px; }
.dsh-nb-message-body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.8; }
.dsh-nb-message.tool { padding: 10px 12px; border-left: 2px solid var(--nb-line); border-radius: 0 8px 8px 0; background: var(--nb-panel); }
.dsh-nb-message.tool .dsh-nb-message-body { max-height: 170px; overflow: auto; font-size: 12px; color: var(--nb-muted); }
.dsh-nb-message.system .dsh-nb-message-body { font-size: 12px; color: var(--nb-muted); }
.dsh-nb-message.is-failed .dsh-nb-message-body { color: var(--nb-danger); }
.dsh-nb-message-actions { margin-top: 12px; }
.dsh-nb-message-actions .dsh-nb-quiet { color: var(--nb-muted); font-size: 11px; }
.dsh-nb button.dsh-nb-citation { display: inline; vertical-align: 1px; font-size: 11px; padding: 1px 5px; margin: 0 2px; background: var(--nb-accent-soft); border-radius: 5px; color: var(--nb-accent); }
.dsh-nb-task { font-size: 12px; color: var(--nb-accent); display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.dsh-nb-pulse { width: 5px; height: 5px; background: currentColor; border-radius: 50%; flex: none; }
.dsh-nb-research { border: 1px solid var(--nb-line); border-radius: 12px; padding: 14px; margin: 12px 0 18px; background: var(--nb-panel); display: grid; gap: 10px; }
.dsh-nb-research-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; font-size: 13px; }
.dsh-nb-research-heading strong { font-weight: 500; color: var(--nb-accent); }
.dsh-nb-research progress { width: 100%; height: 5px; accent-color: var(--nb-accent); }
.dsh-nb-research details { font-size: 12px; }
.dsh-nb-research summary { cursor: pointer; color: var(--nb-muted); }
.dsh-nb-research ul { margin: 8px 0; padding-left: 20px; display: grid; gap: 8px; }
.dsh-nb-research li { overflow-wrap: anywhere; }
.dsh-nb-research li button { text-align: left; color: var(--nb-accent); }
.dsh-nb-research-error { font-size: 12px; color: var(--nb-danger); overflow-wrap: anywhere; }
.dsh-nb-research-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dsh-nb-form label.dsh-nb-inline-check { display: flex; flex-direction: row; align-items: center; gap: 9px; }
.dsh-nb-composer { flex: none; margin: 0 4px; padding: 12px 12px 9px; background: var(--nb-panel); border: 1px solid var(--nb-line); border-radius: 18px; }
.dsh-nb-composer:focus-within { border-color: var(--nb-accent); }
.dsh-nb-composer textarea { width: 100%; display: block; min-height: 44px; max-height: 140px; resize: none; padding: 0 2px; border: 0; background: transparent; font-size: 14px; line-height: 1.5; }
.dsh-nb-composer textarea:focus-visible { outline: none; }
.dsh-nb-composer-bottom { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 9px; }
.dsh-nb-mode { display: flex; padding: 2px; gap: 2px; border-radius: 7px; background: var(--nb-bg); }
.dsh-nb-mode button { padding: 4px 6px; font-size: 11px; border-radius: 5px; color: var(--nb-muted); white-space: nowrap; }
.dsh-nb-mode button.on { color: var(--nb-accent); background: var(--nb-accent-soft); }
.dsh-nb-model { min-width: 0; flex: 1; max-width: 210px; }
.dsh-nb select.dsh-nb-model-select { width: 100%; max-width: 100%; min-width: 80px; border: 0; padding: 4px 3px; background: transparent; font-size: 11px; color: var(--nb-muted); text-overflow: ellipsis; }
.dsh-nb option, .dsh-nb optgroup { background: var(--nb-panel); color: var(--nb-fg); }
.dsh-nb button.dsh-nb-send { margin-left: auto; flex: none; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: var(--nb-accent); color: var(--nb-bg); }
.dsh-nb button.dsh-nb-send:disabled { background: var(--nb-soft); color: var(--nb-muted); opacity: 1; }
.dsh-nb button.dsh-nb-stop { margin-left: auto; }
.dsh-nb-composer-hint { flex: none; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 8px; padding: 7px 10px 0; font-size: 11px; color: var(--nb-muted); }
.dsh-nb-status { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex: none; margin: 6px 4px 10px; padding: 9px 11px; border: 1px solid var(--nb-line); border-radius: 10px; font-size: 12px; background: var(--nb-panel); color: var(--nb-muted); overflow-wrap: anywhere; }
.dsh-nb-status > span { min-width: 0; }
.dsh-nb-status .dsh-nb-chip { flex: none; }
.dsh-nb-status.dsh-nb-error { color: var(--nb-danger); }
.dsh-nb-studio { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 14px; }
.dsh-nb-studio-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-bottom: 14px; }
.dsh-nb button.dsh-nb-card { display: flex; align-items: center; gap: 8px; text-align: left; background: var(--nb-bg); border-radius: 10px; padding: 12px 10px; min-height: 54px; }
.dsh-nb button.dsh-nb-card:hover:not(:disabled) { background: var(--nb-soft); }
.dsh-nb-card strong { font-size: 12px; font-weight: 400; }
.dsh-nb-card.is-busy { color: var(--nb-accent); }
.dsh-nb-ico { display: flex; flex: none; color: var(--nb-accent); }
.dsh-nb-art-heading { border-top: 1px solid var(--nb-line); padding: 14px 2px 8px; margin-top: 12px; font-size: 11px; color: var(--nb-muted); }
.dsh-nb button.dsh-nb-art { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 3px; margin-bottom: 4px; border-radius: 9px; text-align: left; }
.dsh-nb button.dsh-nb-art:hover { background: var(--nb-soft); }
.dsh-nb-art-copy { min-width: 0; display: grid; gap: 3px; }
.dsh-nb-art-copy strong { font-size: 12px; font-weight: 400; overflow-wrap: anywhere; }
.dsh-nb-art-copy small { font-size: 11px; color: var(--nb-muted); }
.dsh-nb-field { width: 100%; min-width: 0; min-height: 36px; border: 1px solid var(--nb-line); border-radius: 8px; padding: 8px 10px; background: var(--nb-bg); }
.dsh-nb-area { min-height: 150px; resize: vertical; line-height: 1.7; }
.dsh-nb-form { display: grid; gap: 14px; }
.dsh-nb-form label { display: grid; gap: 7px; font-size: 12px; }
.dsh-nb-form-actions, .dsh-nb-source-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-nb-source-tools .dsh-nb-field { flex: 1; min-width: 130px; }
.dsh-nb-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-nb-tabs button { padding: 6px 10px; border-radius: 8px; background: var(--nb-bg); color: var(--nb-muted); font-size: 12px; }
.dsh-nb-tabs button.on { color: var(--nb-accent); background: var(--nb-accent-soft); }
.dsh-nb-menu { display: grid; gap: 5px; }
.dsh-nb-menu .dsh-nb-quiet { justify-content: flex-start; padding: 10px; width: 100%; }
.dsh-nb-dialog { position: fixed; inset: 76px 16px auto auto; margin: 0; width: min(500px, calc(100vw - 32px)); max-height: calc(100dvh - 100px); padding: 18px; border: 1px solid var(--nb-line); border-radius: 16px; background: var(--nb-panel); color: var(--nb-fg); font: inherit; overflow: auto; }
.dsh-nb-dialog::backdrop { background: rgba(8, 10, 14, .64); }
.dsh-nb-dialog-head { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
.dsh-nb-dialog-head h3 { font-size: 16px; font-weight: 500; overflow-wrap: anywhere; min-width: 0; }
.dsh-nb-dialog-head .dsh-nb-icon-button { margin-left: auto; }
.dsh-nb-dialog .dsh-nb-status { margin: 0 0 14px; }
.dsh-nb-source-detail { display: grid; gap: 14px; }
.dsh-nb-preview, .dsh-nb-source-body { font-size: 14px; font-family: inherit; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.dsh-nb-study { display: grid; gap: 14px; min-width: 0; }
.dsh-nb-study progress { width: 100%; height: 6px; accent-color: var(--nb-accent); }
.dsh-nb-study-summary { display: grid; gap: 7px; padding: 12px; border: 1px solid var(--nb-line); border-radius: 10px; background: var(--nb-bg); }
.dsh-nb-study-question { margin: 0; font-size: 15px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-nb-study-choices { display: grid; gap: 8px; }
.dsh-nb button.dsh-nb-study-choice { width: 100%; display: flex; gap: 10px; text-align: left; padding: 11px 12px; border: 1px solid var(--nb-line); border-radius: 9px; background: var(--nb-bg); line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-nb-study-choice .dsh-nb-study-letter { color: var(--nb-muted); flex: none; }
.dsh-nb button.dsh-nb-study-choice.is-selected { border-color: var(--nb-accent); background: var(--nb-accent-soft); }
.dsh-nb button.dsh-nb-study-choice.is-correct { border-color: var(--nb-accent); }
.dsh-nb button.dsh-nb-study-choice.is-wrong { border-color: var(--nb-danger); }
.dsh-nb-study-feedback { display: grid; gap: 10px; border-left: 3px solid var(--nb-accent); padding: 12px; border-radius: 0 10px 10px 0; background: var(--nb-bg); }
.dsh-nb-study-feedback.is-incorrect { border-color: var(--nb-danger); }
.dsh-nb-study-feedback p { white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-nb-study-recall { min-height: 90px; resize: vertical; }
.dsh-nb-study-history { border-top: 1px solid var(--nb-line); padding-top: 12px; }
.dsh-nb-study-history summary { cursor: pointer; font-size: 13px; }
.dsh-nb-study-history-list { display: grid; gap: 14px; list-style: none; padding: 0; margin: 14px 0 0; }
.dsh-nb-study-history-list li { display: grid; gap: 7px; padding-bottom: 14px; border-bottom: 1px solid var(--nb-line); }
.dsh-nb-study-history-list p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
.dsh-nb-scroll, .dsh-nb-thread, .dsh-nb-studio, .dsh-nb-dialog { scrollbar-width: thin; scrollbar-color: var(--nb-line) transparent; }
@container notebook (max-width: 999px) {
  .dsh-nb-grid { grid-template-columns: 210px minmax(0, 1fr); }
  .dsh-nb[data-sources-collapsed=true] .dsh-nb-grid { grid-template-columns: 42px minmax(0, 1fr); }
  .dsh-nb .is-studio { display: none; }
  .dsh-nb-pane-tabs { display: flex; }
  .dsh-nb[data-pane=studio] .is-studio { display: flex; }
  .dsh-nb[data-pane=studio] .is-main { display: none; }
}
@container notebook (max-width: 759px) {
  .dsh-nb-grid { display: flex; }
  .dsh-nb .dsh-nb-col { display: none; flex: 1; }
  .dsh-nb[data-pane=chat] .is-main, .dsh-nb[data-pane=sources] .is-sources, .dsh-nb[data-pane=studio] .is-studio { display: flex; }
  .dsh-nb-toolbar { padding: 10px 12px; min-height: 54px; gap: 8px; }
  .dsh-nb-toolbar-brand { display: none; }
  .dsh-nb .dsh-nb-notebook-trigger { font-size: 14px; max-width: 60%; }
  .dsh-nb-toolbar-controls .dsh-nb-quiet > span { display: none; }
  .dsh-nb-toolbar-controls .dsh-nb-quiet { padding: 6px; }
  .dsh-nb-head .dsh-nb-collapse { display: none; }
  .dsh-nb-thread { padding: 0 8px 16px; }
  .dsh-nb-composer { margin: 0; }
  .dsh-nb-hero h2 { font-size: 21px; }
  .dsh-nb-sea { height: 170px; }
}
@media (max-width: 600px) { .dsh-nb-dialog { inset: 24px 12px auto; width: calc(100vw - 24px); max-height: calc(100dvh - 48px); } }
@media (pointer: coarse) { .dsh-nb .dsh-nb-icon-button { min-width: 40px; min-height: 40px; } .dsh-nb-mode button, .dsh-nb-model-select { min-height: 40px; } .dsh-nb .dsh-nb-source-tools-row { grid-template-columns: 1fr 40px; } .dsh-nb textarea, .dsh-nb input { font-size: 16px; } }
@media (prefers-reduced-motion: reduce) { .dsh-nb-sea { transition: none; } }
@media (forced-colors: active) { .dsh-nb-particles { visibility: hidden; } .dsh-nb button, .dsh-nb select, .dsh-nb textarea { border: 1px solid ButtonText; } }
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
    // Canvas owns its animation lifecycle; React only supplies semantic activity.
    function createParticleSea(canvas, surface, initial) {
      const ctx = canvas.getContext('2d', { alpha:true });
      if (!ctx) return { update(){}, dispose(){} };
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const forced = matchMedia('(forced-colors: active)');
      const scheme = matchMedia('(prefers-color-scheme: dark)');
      const TAU = Math.PI * 2;
      const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
      const fract = n => n - Math.floor(n);
      const mix = (a,b,t) => a + (b-a)*t;
      const ease = t => t*t*(3-2*t);
      const profiles = {
        idle: { speed:.48, flow:.026, breath:.012, energy:.12 },
        thinking: { speed:.62, flow:.045, breath:.027, energy:.35 },
        collecting: { speed:.9, flow:.16, breath:.022, energy:.8 },
        writing: { speed:.68, flow:.10, breath:.016, energy:.5 }
      };
      let config = {...initial};
      let width=0, height=0, dpr=1, raf=0, lastPaint=0, elapsed=0, flowTime=0;
      let visible=true, dead=false, compact=initial.compact?1:0, completion=0;
      let speed=.48, flow=.026, energy=.12, breath=.012, frames=0;
      const pointer={x:0,y:0,tx:0,ty:0,vx:0,vy:0,lastX:0,lastY:0,lastAt:0,strength:0,active:false};
      const ripples=[];
      let palette=[], sprites=[];
      const probe=document.createElement('span'); probe.hidden=true; probe.setAttribute('aria-hidden','true'); surface.appendChild(probe);

      function paletteChanged() {
        palette=[1,2,3,4,5].map(i=>{probe.style.color='var(--nb-particle-'+i+')';return getComputedStyle(probe).color;});
        sprites=palette.map(color=>{
          const sprite=document.createElement('canvas');sprite.width=sprite.height=32;
          const c=sprite.getContext('2d');
          const glow=c.createRadialGradient(16,16,0,16,16,16);
          glow.addColorStop(0,color);glow.addColorStop(.22,color);glow.addColorStop(1,'transparent');
          c.fillStyle=glow;c.fillRect(0,0,32,32);return sprite;
        });
        synchronize();
      }

      // One deterministic point pool. Resize, density and state changes never reseed it.
      let seed=0x2f6e2b1;
      const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
      const points=Array.from({length:1440},(_,i)=>{
        const region=fract((i+.5)*.7548776662);
        const u=fract((i+.5)*.5698402910+random()*.08),v=random();
        let part=region<.67?'body':region<.79?'rim':region<.89?'tail':region<.97?'fin':'dorsal';
        return {i,part,u,v,side:fract(i*.3819660113)>.5?1:-1,phase:fract(i*.324717957)*TAU,
          flowU:fract((i+.5)*.61803398875),lane:i%3,weight:fract(i*.271828183),
          ox:0,oy:0,vx:0,vy:0,alpha:0,px:0,py:0,previousX:NaN,previousY:NaN};
      });
      canvas.dataset.poolSize=String(points.length);
      canvas.dataset.poolVersion='stable-1';

      function bodyRadius(u) {
        if(u<.58)return .035+.205*Math.pow(Math.sin(u/.58*Math.PI*.5),1.3);
        if(u<.9)return .24-.08*Math.pow((u-.58)/.32,2);
        return .16*Math.sqrt(Math.max(0,1-Math.pow((u-.9)/.1,2)));
      }

      function draw(dt=0,still=false) {
        if(dead||!width||!height||!palette.length)return;
        ctx.clearRect(0,0,width,height);
        if(forced.matches)return;
        const active=profiles[config.activity]||profiles.idle;
        const smoothing=still?1:1-Math.exp(-dt*4.2);
        const tempo=clamp(config.tempo||1,.5,1.6);
        speed=mix(speed,active.speed*tempo,smoothing);
        flow=mix(flow,active.flow*tempo,smoothing);
        breath=mix(breath,active.breath,smoothing);
        energy=mix(energy,active.energy,smoothing);
        compact=still?(config.compact?1:0):mix(compact,config.compact?1:0,1-Math.exp(-dt*6.5));
        if(Math.abs(compact-(config.compact?1:0))<.001)compact=config.compact?1:0;
        if(!still){elapsed+=dt*speed;flowTime+=dt*flow;completion=Math.max(0,completion-dt*.75);}
        const t=elapsed, blend=ease(compact);
        pointer.strength=still?0:mix(pointer.strength,pointer.active?1:0,1-Math.exp(-dt*(pointer.active?9:3.7)));
        pointer.x=mix(pointer.x,pointer.tx,1-Math.exp(-dt*13));
        pointer.y=mix(pointer.y,pointer.ty,1-Math.exp(-dt*13));
        pointer.vx*=Math.exp(-dt*4.5);pointer.vy*=Math.exp(-dt*4.5);
        for(let r=ripples.length-1;r>=0;r--){if(!still)ripples[r].age+=dt;if(ripples[r].age>1.5)ripples.splice(r,1);}
        const density=clamp(config.density||1,.6,1.2);
        const idleCount=Math.round(Math.min(1150,Math.max(850,width*2.2))*density);
        const stripCount=Math.round(Math.min(220,Math.max(130,width*.38))*density);
        const small=clamp((195-height)/165,0,1);
        const scale=Math.min(width*.365,height*.84);
        const cx=width*.54+Math.sin(t*.45)*width*.008*(1-blend),cy=height*.49;
        const yaw=.12+Math.sin(t*.42)*.13,roll=-.035+Math.sin(t*.58)*.035;
        const elevation=.34+Math.sin(t*.31)*.06;
        const cY=Math.cos(yaw),sY=Math.sin(yaw),cE=Math.cos(elevation),sE=Math.sin(elevation),cR=Math.cos(roll),sR=Math.sin(roll);
        const streamWidth=Math.min(150,width*.32),streamX=width-streamWidth-12;
        let painted=0, maxDisplacement=0, maxStep=0, clipped=0;

        // Projection and local flow are O(n); there is no pairwise particle search.
        for(const p of points) {
          const desired=p.i<stripCount?1:p.i<idleCount?1-ease(clamp((compact-.10)/.70,0,1)):0;
          p.alpha=still?desired:mix(p.alpha,desired,1-Math.exp(-dt*8));
          if(p.alpha<.012)continue;
          let x,y,z,theta=0,surfaceLight=0,edge=false;
          if(p.part==='body'||p.part==='rim') {
            const u=clamp(p.u+Math.sin(t*.36+p.phase)*.002,0,1);
            x=-.86+u*1.78;
            theta=p.part==='rim'?(p.side>0?.025:Math.PI-.025):p.v*TAU+Math.sin(t*.27+u*2)*.035;
            const radius=bodyRadius(u)*(1+breath*Math.sin(t*.85));
            const shell=p.part==='rim'?1:(.84+.16*p.weight);
            y=Math.cos(theta)*radius*shell+.018*Math.sin(u*Math.PI);
            z=Math.sin(theta)*radius*.79*shell;
            surfaceLight=Math.sin(theta);edge=p.part==='rim';
          } else if(p.part==='tail') {
            const reach=Math.sqrt(p.u);
            x=-.84-.36*reach+.16*Math.sin(p.v*Math.PI)*reach;
            y=p.side*reach*(.20+.06*p.v)+.015*Math.sin(p.v*Math.PI);
            z=p.side*reach*.20+(p.v-.5)*.055;
            surfaceLight=.35;
          } else if(p.part==='fin') {
            const reach=1-Math.sqrt(1-p.u);
            x=.37-.51*reach+.15*p.v*(1-reach);
            y=.13+.35*reach+.025*Math.sin(t*1.1+p.side);
            z=p.side*(.12+.23*reach);
            surfaceLight=p.side*.65;
          } else {
            const reach=1-Math.sqrt(1-p.u);
            x=-.32-.13*reach+.17*p.v*(1-reach);
            y=-.16-.14*reach;z=(p.v-.5)*.025;
            surfaceLight=.2;
          }
          // A travelling flex reaches the tail; the head remains stable.
          const tailFlex=Math.pow(clamp((.25-x)/1.4,0,1),1.9);
          y+=Math.sin(t*2.15-x*3.1)*(.004+tailFlex*.080)+Math.sin(t*.72)*.012;
          y+=Math.sin(x*4-t*.86+z*2)*.008*(1+energy);
          z+=Math.cos(t*2.15-x*3.1)*tailFlex*.028;
          let xx=x*cY+z*sY,zz=z*cY-x*sY;
          const yy=y*cE-zz*sE;zz=y*sE+zz*cE;
          const rotX=xx*cR-yy*sR,rotY=yy*cR+xx*sR;
          const perspective=3.4/(3.4-zz);
          const whaleX=cx+rotX*scale*perspective,whaleY=cy+rotY*scale*perspective;
          const streamU=fract(p.flowU+flowTime);
          const envelope=Math.pow(Math.sin(streamU*Math.PI),.65);
          const ribbon=Math.sin(streamU*TAU*1.12-t*.85+p.lane*.72)*(1.8+energy*2.2);
          const ribbonX=streamX+streamU*streamWidth,ribbonY=height*.5+ribbon+(p.weight-.5)*2.1;
          let homeX=mix(whaleX,ribbonX,blend),homeY=mix(whaleY,ribbonY,blend);
          const hitRadius=blend>.8?42:Math.min(82,width*.20);
          let targetX=0,targetY=0,highlight=0;
          if(!still&&pointer.strength>.005) {
            const dx=homeX-pointer.x,dy=homeY-pointer.y,dist=Math.hypot(dx,dy),r=Math.max(1,dist);
            const falloff=Math.pow(Math.max(0,1-dist/hitRadius),2)*pointer.strength;
            const response=clamp(config.response||1,.5,1.5);
            targetX=((dx/r)*5-(dy/r)*18+pointer.vx*.024)*falloff*response;
            targetY=((dy/r)*5+(dx/r)*18+pointer.vy*.024)*falloff*response;
            highlight=falloff*.65;
          }
          for(const wave of ripples) {
            const dx=homeX-wave.x,dy=homeY-wave.y,d=Math.max(1,Math.hypot(dx,dy));
            const pulse=Math.exp(-Math.pow((d-wave.age*150)/24,2))*Math.pow(1-wave.age/1.5,2);
            targetX+=dx/d*pulse*11;targetY+=dy/d*pulse*11;highlight+=pulse*.65;
          }
          if(still){p.ox=p.oy=p.vx=p.vy=0;}
          else {
            const step=Math.min(dt,1/24);
            p.vx+=((targetX-p.ox)*64-p.vx*12)*step;p.vy+=((targetY-p.oy)*64-p.vy*12)*step;
            p.ox=clamp(p.ox+p.vx*step,-28,28);p.oy=clamp(p.oy+p.vy*step,-28,28);
          }
          const px=homeX+p.ox*(1-small*.5),py=homeY+p.oy*(1-small*.65);
          const depth=clamp(.62+zz*.8,.3,1),front=clamp(.42+surfaceLight*.45,.15,.9);
          let color=y>.065&&x>-.65?4:edge?2:surfaceLight>.65?3:surfaceLight>-.25?2:0;
          if(highlight>.3)color=4;
          const travellingLight=Math.pow((Math.sin(x*3.2-t*.7)+1)*.5,5)*.10;
          const pulse=completion*Math.exp(-Math.pow((streamU-(1-completion))/.2,2));
          let alpha=p.alpha*mix((edge?.72:front*.70+.20)+travellingLight,.58*envelope,blend);
          alpha*=1+highlight*.6+pulse*.4;
          const radius=mix((edge?.73:.62+p.weight*.49)*perspective,.6+p.weight*.22,blend);
          if(alpha<.025)continue;
          if(px-radius<0||py-radius<0||px+radius>width||py+radius>height)clipped++;
          maxDisplacement=Math.max(maxDisplacement,Math.hypot(p.ox,p.oy));
          if(Number.isFinite(p.previousX))maxStep=Math.max(maxStep,Math.hypot(px-p.previousX,py-p.previousY));
          // Sparse soft light and a sharp core retain texture without a foggy halo.
          if((p.weight>.965||highlight>.45||pulse>.45)&&alpha>.3) {
            const glow=radius*(highlight>.45?7:4.6);
            ctx.globalAlpha=Math.min(.23,alpha*.19);ctx.drawImage(sprites[color],px-glow,py-glow,glow*2,glow*2);
          }
          ctx.globalAlpha=clamp(alpha,0,1);ctx.fillStyle=palette[color];
          ctx.beginPath();ctx.arc(px,py,radius,0,TAU);ctx.fill();
          p.px=px;p.py=py;p.previousX=px;p.previousY=py;painted++;
        }
        ctx.globalAlpha=1;
        frames++;
        if(frames%10===0||still){
          canvas.dataset.particleCount=String(painted);canvas.dataset.frameCount=String(frames);
          canvas.dataset.displacement=maxDisplacement.toFixed(2);canvas.dataset.transition=compact.toFixed(3);
          canvas.dataset.maxStep=maxStep.toFixed(2);
          canvas.dataset.clipped=String(clipped);
        }
      }

      function tick(timestamp) {
        raf=0;
        if(dead||!visible||document.hidden||!config.motion||reduced.matches||forced.matches){synchronize();return;}
        const interacting=pointer.active||pointer.strength>.05||ripples.length||compact>.002&&compact<.998;
        const fps=interacting?60:config.compact&&config.activity==='idle'?20:30;
        if(!lastPaint||timestamp-lastPaint>=1000/fps-.6){
          const dt=lastPaint?Math.min(.05,(timestamp-lastPaint)/1000):1/fps;
          lastPaint=timestamp;draw(dt);canvas.dataset.fpsLimit=String(fps);
        }
        raf=requestAnimationFrame(tick);
      }
      function synchronize() {
        if(dead)return;
        const hidden=!visible||document.hidden||!width||!height||forced.matches;
        const staticMode=!config.motion||reduced.matches;
        canvas.dataset.particleMode=config.activity;
        canvas.dataset.motion=hidden?'paused':staticMode?'reduced':'running';
        if(hidden||staticMode){
          if(raf){cancelAnimationFrame(raf);raf=0;}lastPaint=0;
          if(forced.matches)ctx.clearRect(0,0,width,height);
          else if(!hidden)draw(0,true);
          return;
        }
        if(!raf){lastPaint=0;draw(0);raf=requestAnimationFrame(tick);}
      }
      function resize() {
        if(dead)return;
        const bounds=surface.getBoundingClientRect();
        const nextW=Math.round(bounds.width),nextH=Math.round(bounds.height),nextDpr=Math.min(1.5,devicePixelRatio||1);
        if(nextW===width&&nextH===height&&nextDpr===dpr)return;
        width=nextW;height=nextH;dpr=nextDpr;
        canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
        draw(0,!config.motion||reduced.matches);synchronize();
      }
      function move(event) {
        if(!config.motion||reduced.matches||forced.matches||event.pointerType==='touch')return;
        const rect=surface.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,now=performance.now();
        if(!pointer.active){pointer.x=x;pointer.y=y;pointer.lastX=x;pointer.lastY=y;pointer.lastAt=now;}
        const dt=Math.max(.016,(now-pointer.lastAt)/1000);
        pointer.vx=mix(pointer.vx,clamp((x-pointer.lastX)/dt,-700,700),.4);
        pointer.vy=mix(pointer.vy,clamp((y-pointer.lastY)/dt,-700,700),.4);
        pointer.lastX=x;pointer.lastY=y;pointer.lastAt=now;pointer.tx=x;pointer.ty=y;pointer.active=true;
        canvas.dataset.pointer='active';
      }
      function leave(){pointer.active=false;canvas.dataset.pointer='returning';}
      function ripple(event){
        if(!config.motion||reduced.matches||forced.matches)return;
        const rect=surface.getBoundingClientRect();
        ripples.push({x:event.clientX-rect.left,y:event.clientY-rect.top,age:0});if(ripples.length>3)ripples.shift();
      }
      const listen=(query,fn)=>{query.addEventListener('change',fn);return()=>query.removeEventListener('change',fn);};
      const cleanups=[listen(reduced,synchronize),listen(forced,synchronize),listen(scheme,paletteChanged)];
      const theme=new MutationObserver(paletteChanged);theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme','data-color-scheme']});
      const resizer=new ResizeObserver(resize);resizer.observe(surface);
      const intersection=new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;synchronize();},{threshold:[0,.01]});intersection.observe(surface);
      surface.addEventListener('pointermove',move,{passive:true});surface.addEventListener('pointerleave',leave,{passive:true});surface.addEventListener('pointerdown',ripple,{passive:true});
      document.addEventListener('visibilitychange',synchronize);
      paletteChanged();resize();
      return {
        update(next){
          if(config.activity!=='idle'&&next.activity==='idle')completion=1;
          config={...next};synchronize();
        },
        dispose(){
          dead=true;if(raf)cancelAnimationFrame(raf);cleanups.forEach(fn=>fn());theme.disconnect();resizer.disconnect();intersection.disconnect();
          surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerleave',leave);surface.removeEventListener('pointerdown',ripple);document.removeEventListener('visibilitychange',synchronize);
          ctx.clearRect(0,0,width,height);canvas.dataset.motion='paused';probe.remove();
        }
      };
    }
    const STORAGE_KEY = 'dsh-notebook.workspace'
    let connectionRpc
    function rememberedWorkspace() {
      try { return localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
    }
    function apiError(message, code) {
      const error = new Error(message)
      if (typeof code === 'string') error.code = code
      return error
    }
    async function api(body) {
      if (typeof connectionRpc?.call === 'function') {
        const response = await connectionRpc.call('/api', 'dsh-notebook/api', body)
        if (!response?.ok) throw apiError(response?.error?.message || '宿主连接请求失败', response?.error?.code)
        const payload = response.value
        if (!payload || typeof payload !== 'object') throw new Error('笔记本接口没有返回有效内容，请重新打开插件。')
        if (payload.ok === false) throw apiError(payload.error || '请求失败', payload.code)
        return payload
      }
      const response = await fetch('/dsh-notebook/api', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const raw = await response.text()
      if (!raw) throw new Error('笔记本接口没有返回内容（HTTP ' + response.status + '）。请重新打开插件。')
      let payload
      try { payload = JSON.parse(raw) } catch { throw new Error('接口返回了无法读取的内容：' + raw.slice(0, 180)) }
      if (!response.ok || payload.ok === false) throw apiError(payload.error || response.statusText || '请求失败', payload.code)
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
    function DeepSea({ activity = 'idle', caption, compact = false, mode = 'research', motion = true }) {
      const canvasRef = useRef(null), surfaceRef = useRef(null), controllerRef = useRef(null)
      useEffect(() => {
        if (!canvasRef.current || !surfaceRef.current) return
        // Child effects run before the screen effect; resolve palette only after CSS exists.
        ensureStyles()
        const controller = createParticleSea(canvasRef.current, surfaceRef.current, { activity, compact, mode, motion })
        controllerRef.current = controller
        return () => { controller.dispose(); controllerRef.current = null }
      }, [])
      useEffect(() => { controllerRef.current?.update({ activity, compact, mode, motion }) }, [activity, compact, mode, motion])
      return h('div', { className: 'dsh-nb-sea' + (compact ? ' is-compact' : ''), ref: surfaceRef },
        h('canvas', { className: 'dsh-nb-particles dsh-nb-cloud', ref: canvasRef, 'aria-hidden': 'true', 'data-particle-mode': activity }),
        h('div', { className: 'dsh-nb-caption', role: 'status' }, h('span', { className: 'dsh-nb-sea-dot', 'aria-hidden': 'true' }), caption))
    }
    function KindMark({ kind }) { return h('span', { className: 'dsh-nb-mark', 'aria-hidden': 'true' }, h(UiIcon, { kind: kind === 'url' ? 'globe' : kind === 'note' ? 'note' : kind === 'file' ? 'file' : 'text' })) }
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

    const UI_STORAGE_KEY = 'dsh-notebook.presentation.v1'
    function rememberedUi() {
      try {
        const value = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}')
        return { sourcesCollapsed: value.sourcesCollapsed === true, studioCollapsed: value.studioCollapsed === true, motion: value.motion !== false }
      } catch { return { sourcesCollapsed: false, studioCollapsed: false, motion: true } }
    }
    function UiIcon({ kind, size = 16 }) {
      const paths = {
        plus: 'M8 3v10M3 8h10', chevron: 'm4 6 4 4 4-4', more: 'M3 8h.01M8 8h.01M13 8h.01', close: 'm4 4 8 8M12 4l-8 8',
        history: 'M3 5a5.4 5.4 0 1 1-.3 5M2 2v4h4M8 4v4l3 2', send: 'M8 13V3m-4 4 4-4 4 4', stop: 'M4 4h8v8H4z',
        left: 'M2 2.5h12v11H2zM6 2.5v11m5-7-2 2 2 2', right: 'M2 2.5h12v11H2zM10 2.5v11M5 6.5l2 2-2 2',
        note: 'M12 8.5v5H2.5v-11H8m1 1 2-2 3 3-6.5 6.5-3 1 1-3z', link: 'm6.5 9.5 3-3M5 11l-1 1a2.8 2.8 0 0 1-4-4l3-3a2.8 2.8 0 0 1 4 0M11 5l1-1a2.8 2.8 0 0 0-4-4L5 3',
        globe: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0M2 8h12M8 2c-3 3-3 9 0 12 3-3 3-9 0-12', file: 'M3 2h6l4 4v8H3zM9 2v4h4M5 9h6M5 11h4',
        text: 'M3 3h10M8 3v10M5 13h6', pin: 'm5 2 6 1-2 4 2 3-7-1 2-3zm2 7-1 5', motion: 'M2 8c2-5 4 5 6 0s4 5 6 0',
      }
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: paths[kind] || paths.file, stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }
    let dialogSequence = 0
    function Dialog({ title, onClose, content, error }) {
      const ref = useRef(null), closeRef = useRef(onClose)
      const [titleId] = useState(() => 'dsh-nb-dialog-' + (++dialogSequence))
      closeRef.current = onClose
      useEffect(() => {
        const node = ref.current, opener = document.activeElement
        const cancel = event => { event.preventDefault(); closeRef.current() }
        const outside = event => { if (event.target !== node) return; const r = node.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeRef.current() }
        node.addEventListener('cancel', cancel); node.addEventListener('click', outside)
        if (!node.open) node.showModal()
        return () => { node.removeEventListener('cancel', cancel); node.removeEventListener('click', outside); node.close(); if (opener?.isConnected) opener.focus() }
      }, [])
      return h('dialog', { className: 'dsh-nb-dialog', ref, 'aria-labelledby': titleId },
        h('div', { className: 'dsh-nb-dialog-head' }, h('h3', { id: titleId }, title), h('button', { type: 'button', className: 'dsh-nb-icon-button', 'aria-label': '关闭详情', onClick: onClose }, h(UiIcon, { kind: 'close' }))),
        error ? h('div', { className: 'dsh-nb-status dsh-nb-error', role: 'alert' }, error) : null,
        content)
    }
    function CitationText({ text, sources, onOpen }) {
      return h('span', null, ...String(text || '').split(/(\[[^\]\n]{1,180}\]|\bsourceId\s*=\s*[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}(?![\da-z-]))/gi).map((part, index) => {
        const bracketed = part.startsWith('[') && part.endsWith(']')
        const value = bracketed ? part.slice(1, -1) : part
        const legacy = value.match(/^sourceId\s*=\s*([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i)
        const id = legacy?.[1] ?? (bracketed ? value : null)
        // Only an exact ID in the active notebook can open a source. Legacy
        // full UUIDs are accepted, but abbreviated and unknown IDs stay text.
        const source = id && sources.find(item => item.id === id)
        return source ? h('button', { type: 'button', className: 'dsh-nb-citation', key: index, title: source.title, 'aria-label': '查看引用：' + source.title, 'data-citation-source': source.id, onClick: () => onOpen(source.id) }, String(sources.indexOf(source) + 1)) : part
      }))
    }
    function SelectionCheckbox({ checked, mixed, disabled, onChange }) {
      const ref = useRef(null)
      useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
      return h('input', { className: 'dsh-nb-check', type: 'checkbox', ref, checked, disabled, onChange, 'aria-label': '选择所有可用来源' })
    }

    function StudyPractice({ artifact, workspaceId, notebookId, hostSessionId, sources, onOpenSource, onRegenerate, canRegenerate, regenerating }) {
      const storageKey = 'dsh-notebook.study.v1:' + workspaceId + ':' + notebookId + ':' + artifact.id
      const [study, setStudy] = useState(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState(null)
      const [entered, setEntered] = useState(false), [choice, setChoice] = useState(''), [recall, setRecall] = useState(''), [historyOpen, setHistoryOpen] = useState(false)
      const alive = useRef(false), lock = useRef(false), sequence = useRef(0), current = useRef(null), retry = useRef(null), host = useRef(hostSessionId), questionRef = useRef(null)
      host.current = hostSessionId
      const flash = artifact.kind === 'flashcards'
      const invalid = ['notebook/invalid-study-artifact', 'notebook/study-revision-changed'].includes(failure?.code)
      const revisionChanged = study?.revisionChanged === true
      const item = study?.currentItem, attempt = study?.currentAttempt
      const blocked = busy || Boolean(failure) || revisionChanged
      const requestId = () => globalThis.crypto?.randomUUID?.() || 'study-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      async function request(op, args = {}, enter = false) {
        if (lock.current || !alive.current) return
        lock.current = true
        const version = ++sequence.current
        setBusy(true); setFailure(null)
        retry.current = { op, args, enter }
        try {
          const result = await api({ op, workspaceId, sessionId: host.current || undefined, ...args })
          if (!alive.current || version !== sequence.current) return
          const next = result.study
          if (!next || next.artifactId !== artifact.id || next.notebookId !== notebookId) throw new Error('练习状态与当前笔记本不一致，请重新打开产物。')
          current.current = next
          setStudy(next); retry.current = null
          if (enter) setEntered(true)
          try { localStorage.setItem(storageKey, next.mode === 'mistakes' ? 'mistakes' : 'all') } catch {}
        } catch (error) {
          if (alive.current && version === sequence.current) setFailure({ message: error.message, code: error.code })
        } finally {
          if (alive.current && version === sequence.current) { lock.current = false; setBusy(false) }
        }
      }
      useEffect(() => {
        alive.current = true; lock.current = false
        let mode = 'all'
        try { if (localStorage.getItem(storageKey) === 'mistakes') mode = 'mistakes' } catch {}
        request('studyOpen', { artifactId: artifact.id, mode })
        const sync = () => {
          if (document.visibilityState === 'hidden' || lock.current || retry.current || !current.current) return
          request('studyGet', { studySessionId: current.current.studySessionId })
        }
        window.addEventListener('online', sync); window.addEventListener('focus', sync); document.addEventListener('visibilitychange', sync)
        return () => { alive.current = false; sequence.current++; window.removeEventListener('online', sync); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync) }
      }, [])
      useEffect(() => { setChoice(''); setRecall('') }, [study?.studySessionId, item?.id])
      useEffect(() => { if (entered && item) questionRef.current?.focus() }, [entered, study?.studySessionId, item?.id])
      const button = (label, action, onClick, disabled = blocked, extra = {}) => h('button', { type: 'button', className: 'dsh-nb-chip', 'data-action': action, 'aria-label': label, disabled, onClick, ...extra }, label)
      const citations = ids => (ids || []).length ? h('p', { className: 'dsh-nb-meta' }, '依据：', h(CitationText, { text: [...new Set(ids)].map(id => '[' + id + ']').join(' '), sources, onOpen: onOpenSource })) : null
      const choiceText = (publicItem, value) => {
        const found = publicItem?.choices?.find(candidate => candidate.id === value)
        return found ? found.id + '：' + found.text : value || '未填写'
      }
      const open = (mode, restart = false) => request('studyOpen', { artifactId: artifact.id, mode, ...(restart ? { restart: true } : {}) }, true)
      const submit = () => {
        if (blocked || !item || attempt || (!flash && !choice)) return
        request('studyAnswer', { studySessionId: study.studySessionId, itemId: item.id, answer: flash ? recall : choice, requestId: requestId() }, true)
      }
      const rate = rating => {
        if (blocked || !item || !attempt || attempt.gradedAt) return
        request('studyRate', { studySessionId: study.studySessionId, itemId: item.id, rating, requestId: requestId() }, true)
      }
      const feedback = saved => h('div', { className: 'dsh-nb-study-feedback' + (saved.correct === false ? ' is-incorrect' : ''), 'data-study-feedback': '', role: 'status' },
        h('strong', null, flash ? saved.rating === 'remembered' ? '记住了 · 自评' : saved.rating === 'again' ? '再练一次 · 自评' : '对照答案后，请给自己评分' : saved.correct ? '回答正确' : '这道题需要再练'),
        h('p', null, '你的' + (flash ? '回忆：' : '答案：') + (flash ? saved.answer || '（未填写，直接查看）' : choiceText(item, saved.answer))),
        h('p', null, flash ? '参考答案：' + (saved.back || '') : '正确答案：' + choiceText(item, saved.correctAnswer)),
        saved.explanation ? h('p', null, h(CitationText, { text: saved.explanation, sources, onOpen: onOpenSource })) : null,
        citations(saved.sourceIds),
        flash && !saved.gradedAt ? h('div', { className: 'dsh-nb-form-actions' },
          button('再练一次（自评）', 'study-rate', () => rate('again'), blocked, { 'data-study-rating': 'again' }),
          button('记住了（自评）', 'study-rate', () => rate('remembered'), blocked, { 'data-study-rating': 'remembered', className: 'dsh-nb-chip primary' })) : null)
      return h('section', { className: 'dsh-nb-study', 'aria-label': flash ? '闪卡练习' : '测验练习', 'aria-busy': busy, 'data-study-session': study?.studySessionId || '', 'data-study-kind': artifact.kind, 'data-study-status': study?.status || 'loading' },
        busy ? h('p', { className: 'dsh-nb-meta', role: 'status' }, study ? '正在同步练习进度…' : '正在恢复练习…') : null,
        failure ? h('div', { className: 'dsh-nb-status dsh-nb-error', role: 'alert' },
          h('p', null, invalid ? '这份练习的内容或引用无法继续使用，请重新生成。' : '练习暂时无法同步，请重试；已保存的作答会保留。'), h('p', null, failure.message),
          !invalid ? h('div', { className: 'dsh-nb-form-actions' }, button('重试', 'study-retry', () => { const pending = retry.current; if (pending) request(pending.op, pending.op === 'studyOpen' ? { ...pending.args, restart: false } : pending.args, pending.enter) }, busy),
            study ? button('恢复已保存进度', 'study-sync', () => request('studyGet', { studySessionId: study.studySessionId }), busy) : null) : null) : null,
        revisionChanged ? h('p', { className: 'dsh-nb-status dsh-nb-error', role: 'alert' }, '练习内容或来源已变更。历史作答仍可查看，请重新生成后继续练习。') : null,
        (study?.warnings || []).map((warning, index) => h('p', { key: index, className: 'dsh-nb-meta' }, String(warning))),
        invalid || revisionChanged ? button(regenerating ? '正在重新生成…' : '重新生成练习', 'study-regenerate', onRegenerate, !canRegenerate || regenerating) : null,
        study ? h('div', { className: 'dsh-nb-study-summary' },
          h('strong', null, (study.mode === 'mistakes' ? flash ? '待巩固重练' : '错题重练' : flash ? '闪卡练习' : '测验练习') + ' · ' + study.total + (flash ? ' 张' : ' 题')),
          h('progress', { max: Math.max(1, study.total), value: study.gradedCount || 0, 'aria-label': '练习进度' }),
          h('p', { className: 'dsh-nb-meta' }, '已' + (flash ? '自评 ' : '作答 ') + (study.gradedCount || 0) + ' / ' + study.total + (flash ? ' · 记住 ' + (study.score?.correct || 0) + ' · 再练 ' + (study.score?.incorrect || 0) : ' · 答对 ' + (study.correctCount || 0))),
          flash ? h('p', { className: 'dsh-nb-meta' }, '闪卡结果是你的记忆自评，不计入测验正确率。') : null,
          h('div', { className: 'dsh-nb-form-actions' },
            !entered && !study.completed ? button(study.answeredCount || study.position ? '继续练习' : '开始练习', 'study-start', () => setEntered(true), busy || Boolean(failure), { className: 'dsh-nb-chip primary' }) : null,
            button('重新练习', 'study-restart', () => open('all', true)),
            button(flash ? '待巩固重练' : '错题重练', 'study-mistakes', () => open('mistakes', true), blocked || !study.mistakeCount)),
          !study.mistakeCount ? h('p', { className: 'dsh-nb-meta' }, flash ? '暂时没有待巩固的闪卡。' : '暂时没有错题。') : null) : null,
        study?.completed ? h('div', { className: 'dsh-nb-study-summary', 'data-study-result': '', role: 'status' },
          h('strong', null, study.total ? '本轮练习已完成' : flash ? '没有待巩固的闪卡' : '没有需要重练的错题'),
          h('p', { className: 'dsh-nb-meta' }, '进度与作答历史已保存。可以重新练习，或查看下方作答历史。')) : null,
        entered && item && !study.completed ? h('div', { className: 'dsh-nb-study', 'data-study-item': item.id },
          h('p', { className: 'dsh-nb-meta' }, '第 ' + (study.position + 1) + ' / ' + study.total + (flash ? ' 张' : ' 题')),
          h('h4', { className: 'dsh-nb-study-question', ref: questionRef, tabIndex: -1 }, flash ? item.front : item.question),
          !flash ? h('div', { className: 'dsh-nb-study-choices', role: 'group', 'aria-label': '选择答案' }, (item.choices || []).map(option => h('button', {
            key: option.id, type: 'button', className: 'dsh-nb-study-choice' + ((attempt?.answer || choice) === option.id ? ' is-selected' : '') + (attempt?.correctAnswer === option.id ? ' is-correct' : '') + (attempt && !attempt.correct && attempt.answer === option.id ? ' is-wrong' : ''),
            'data-study-choice': option.id, 'aria-label': '选项 ' + option.id + '：' + option.text, 'aria-pressed': (attempt?.answer || choice) === option.id, disabled: blocked || Boolean(attempt), onClick: () => setChoice(option.id),
          }, h('span', { className: 'dsh-nb-study-letter' }, option.id), h('span', null, option.text)))) : !attempt ? h('label', null, '先回忆，再翻面', h('textarea', { className: 'dsh-nb-field dsh-nb-study-recall', value: recall, disabled: blocked, 'aria-label': '先写下你的回忆', placeholder: '尝试用自己的话回忆；想不起来也可以直接查看。', onChange: event => setRecall(event.target.value) })) : null,
          attempt ? feedback(attempt) : button(flash ? '显示闪卡答案' : '提交测验答案', flash ? 'study-reveal' : 'study-submit', submit, blocked || (!flash && !choice), { className: 'dsh-nb-chip primary' }),
          attempt ? button(study.position + 1 >= study.total ? '完成练习' : flash ? '下一张' : '下一题', 'study-next', () => request('studyNext', { studySessionId: study.studySessionId, itemId: item.id }, true), blocked || !study.canNext, { className: 'dsh-nb-chip primary' }) : null) : null,
        study ? h('details', { className: 'dsh-nb-study-history', open: historyOpen, onToggle: event => setHistoryOpen(event.currentTarget.open) },
          h('summary', { 'data-action': 'study-history' }, '作答历史（' + (study.historyTotal ?? study.history?.length ?? 0) + '）'),
          historyOpen ? h('div', null,
            study.historyTotal > (study.history?.length || 0) ? h('p', { className: 'dsh-nb-meta' }, '仅展示最近 ' + study.history.length + ' 条作答记录。') : null,
            !(study.history?.length) ? h('p', { className: 'dsh-nb-meta' }, '还没有已提交的作答。') : null,
            h('ol', { className: 'dsh-nb-study-history-list' }, [...(study.history || [])].reverse().map(saved => h('li', { key: saved.id, 'data-study-attempt': saved.id },
              h('strong', null, saved.item?.question || saved.item?.front || '已作答题目'),
              h('p', { className: 'dsh-nb-meta' }, new Date(saved.submittedAt).toLocaleString() + ' · ' + (saved.mode === 'mistakes' ? '重练' : '完整练习') + ' · ' + (saved.grading === 'self-assessment' ? '记忆自评：' + (saved.rating === 'remembered' ? '记住了' : saved.rating === 'again' ? '再练一次' : '待评分') : saved.correct ? '回答正确' : '回答错误')),
              h('p', null, '你的作答：' + (saved.grading === 'self-assessment' ? saved.answer || '（未填写）' : choiceText(saved.item, saved.answer))),
              h('p', null, saved.grading === 'self-assessment' ? '参考答案：' + (saved.back || '') : '正确答案：' + choiceText(saved.item, saved.correctAnswer)),
              saved.explanation ? h('p', null, h(CitationText, { text: saved.explanation, sources, onOpen: onOpenSource })) : null,
              citations(saved.sourceIds))))) : null) : null)
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
      const [researchPrompt, setResearchPrompt] = useState('')
      const [researchTitle, setResearchTitle] = useState('')
      const [researchTarget, setResearchTarget] = useState(5)
      const [researchNewNotebook, setResearchNewNotebook] = useState(true)
      const [adding, setAdding] = useState('')
      const [sourceTitle, setSourceTitle] = useState('')
      const [draft, setDraft] = useState('')
      const [path, setPath] = useState('')
      const [url, setUrl] = useState('')
      const [notebookTitle, setNotebookTitle] = useState('')
      const [sourceFilter, setSourceFilter] = useState('')
      const [dialog, setDialog] = useState('')
      const [pane, setPane] = useState('chat')
      const [ui, setUi] = useState(rememberedUi)
      const [source, setSource] = useState(null)
      const [sourceName, setSourceName] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)
      const [artifactId, setArtifactId] = useState('')
      const [artifact, setArtifact] = useState(null)
      const [studyReturnId, setStudyReturnId] = useState('')
      const [workspaceTitle, setWorkspaceTitle] = useState('')
      const active = useRef(workspaceId)
      const stateSequence = useRef(0)
      const detailSequence = useRef(0)
      const sourceSequence = useRef(0)
      const initialization = useRef(null)
      const defaultRoute = useRef('')
      const mounted = useRef(false)
      const threadRef = useRef(null), composerRef = useRef(null), followThread = useRef(true)
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
      const research = state?.research
      const researchRunning = research?.status === 'running'
      const running = task?.status === 'running' || researchRunning || Boolean(pending.chat || pending.researchStart)
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
        followThread.current = true
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
        setState(null); setPending({}); setError(''); setNotice(''); setQuestion(''); setSource(null); setArtifact(null); setArtifactId(''); setDialog(''); setAdding(''); setSourceTitle(''); setDraft(''); setPath(''); setUrl(''); setNotebookTitle(''); setSourceFilter('')
        try { if (workspaceId) localStorage.setItem(STORAGE_KEY, workspaceId) } catch {}
        refresh(workspaceId)
        const timer = setInterval(() => refresh(workspaceId, true), 2000)
        return () => { clearInterval(timer); stateSequence.current++; detailSequence.current++; sourceSequence.current++ }
      }, [workspaceId])
      useEffect(() => {
        detailSequence.current++; sourceSequence.current++
        setArtifactId(''); setArtifact(null); setSource(null); setSourceName(''); setConfirmDelete(false); setStudyReturnId('')
        setDialog(value => ['source', 'artifact', 'add-source'].includes(value) ? '' : value)
      }, [state?.notebookId])
      useEffect(() => {
        if (!workspace?.id || (workspace.provider && workspace.model) || !hasRoute) return
        const key = workspace.id + ':' + providerId + ':' + modelId
        if (defaultRoute.current === key) return
        defaultRoute.current = key
        run('workspaceUpdate', { provider: providerId, model: modelId })
      }, [workspace?.id, workspace?.provider, workspace?.model, providerId, modelId])
      useEffect(() => {
        if (threadRef.current && followThread.current) threadRef.current.scrollTop = messages.length ? threadRef.current.scrollHeight : 0
      }, [messages.length, messages[messages.length - 1]?.text, task?.phase, research?.phase, research?.status, research?.imported?.length])
      useEffect(() => {
        if (dialog !== 'artifact' || !artifactId || !workspaceId || !artifacts.some(item => item.id === artifactId)) return
        const target = workspaceId
        const sequence = ++detailSequence.current
        api({ op: 'artifact', workspaceId: target, id: artifactId }).then(result => {
          if (mounted.current && active.current === target && detailSequence.current === sequence) setArtifact(result.artifact)
        }).catch(err => { if (mounted.current && active.current === target && detailSequence.current === sequence) setError(err.message) })
        return () => { detailSequence.current++ }
      }, [workspaceId, artifactId, state?.artifacts, dialog])
      useEffect(() => {
        try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui)) } catch {}
      }, [ui.sourcesCollapsed, ui.studioCollapsed, ui.motion])
      useEffect(() => {
        const node = composerRef.current
        if (node) { node.style.height = 'auto'; node.style.height = Math.min(140, Math.max(44, node.scrollHeight)) + 'px' }
      }, [question])
      useEffect(() => {
        const node = threadRef.current
        if (!node) return
        const scroll = () => { followThread.current = node.scrollHeight - node.clientHeight - node.scrollTop < 80 }
        node.addEventListener('scroll', scroll, { passive: true })
        return () => node.removeEventListener('scroll', scroll)
      }, [])
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
        followThread.current = true
        const result = await run('chat', { text: value, provider: providerId, model: modelId, mode })
        if (!result && active.current === target) setQuestion(value)
      }
      function openResearch() {
        setResearchPrompt(question); setResearchTitle(''); setResearchTarget(5); setResearchNewNotebook(true)
        setError(''); setDialog('research')
      }
      async function startResearch() {
        if (running || !hasRoute || !researchPrompt.trim() || state?.capabilities?.search === false) return
        followThread.current = true
        const result = await run('researchStart', { prompt: researchPrompt.trim(), title: researchTitle.trim(), targetSources: researchTarget, newNotebook: researchNewNotebook, provider: providerId, model: modelId })
        if (result) { setQuestion(''); setDialog(''); setPane('chat') }
      }
      async function viewSource(id) {
        const target = workspaceId
        const sequence = ++sourceSequence.current
        const targetNotebook = notebookScope.current
        setDialog('source'); setSource(null); setConfirmDelete(false)
        try {
          const result = await api({ op: 'source', workspaceId: target, id })
          if (mounted.current && active.current === target && notebookScope.current === targetNotebook && sequence === sourceSequence.current) { setSource(result.source); setSourceName(result.source.title || '') }
        } catch (err) { if (mounted.current && active.current === target && notebookScope.current === targetNotebook && sequence === sourceSequence.current) setError(err.message) }
      }
      async function addSource() {
        const result = adding === 'note' ? await run('saveNote', { title: sourceTitle || '新笔记', body: draft }) : adding === 'file' ? await run('addFile', { path }) : adding === 'url' ? await run('addUrl', { url }) : await run('addText', { title: sourceTitle || '粘贴文本', text: draft })
        if (result) { setDraft(''); setPath(''); setUrl(''); setSourceTitle(''); setAdding(''); setDialog('') }
      }
      const filtered = sources.filter(item => !sourceFilter || (item.title || '').toLowerCase().includes(sourceFilter.toLowerCase()))
      const researchPhase = ({ preparing: '正在准备研究', planning: '正在规划检索方向', searching: '正在搜索资料', fetching: '正在读取网页正文', importing: '正在导入来源', synthesizing: '正在整理学习指南', generating: '正在整理学习指南', writing: '正在整理学习指南', done: '研究已完成' })[research?.phase] || (research?.phase?.startsWith('tool:') ? phaseLabel(research.phase) : '正在构建笔记本')
      const particleActivity = busyStudio || (researchRunning && ['synthesizing', 'generating', 'writing'].includes(research?.phase)) || (running && task?.phase === 'answering') ? 'writing' : (researchRunning && ['searching', 'fetching', 'importing'].includes(research?.phase)) || (running && task?.phase?.startsWith('tool:')) ? 'collecting' : running || (!state && !error && !catalogError) ? 'thinking' : 'idle'
      const caption = researchRunning ? researchPhase : running ? phaseLabel(task?.phase) : busyStudio ? '正在整理 Studio 产物' : error || catalogError ? '连接待恢复' : state ? '工作台已就绪' : '正在读取工作台…'
      const chip = (label, onClick, extra = {}) => h('button', { className: 'dsh-nb-chip', type: 'button', onClick, ...extra }, label)
      const iconButton = (kind, label, onClick, extra = {}) => h('button', { className: 'dsh-nb-icon-button', type: 'button', 'aria-label': label, title: label, onClick, ...extra }, h(UiIcon, { kind }))
      const menuButton = (kind, label, onClick, extra = {}) => h('button', { className: 'dsh-nb-quiet', type: 'button', onClick, ...extra }, h(UiIcon, { kind }), h('span', null, label))
      const readySources = sources.filter(item => item.status === 'ready')
      const routeValue = hasRoute || (providerId && modelId) ? JSON.stringify([providerId, modelId]) : ''
      const selectedModel = provider?.models?.find(item => item.id === modelId)
      const catalogMessage = catalogError || (!hasRoute && catalog ? '没有可用模型。请在 DSH 模型设置中配置提供方，再刷新模型目录。' : '') || provider?.error
      const taskError = !researchRunning && task?.status === 'failed' ? task.error || '这次运行失败，请调整后重试。' : ''
      const statusText = error || taskError || catalogMessage || notice || (mode === 'research' && state?.capabilities?.search === false ? '当前未启用网页搜索，可提供网址或本地路径。' : '')
      const retry = async () => { await Promise.allSettled([loadCatalog(), refresh(active.current)]) }
      const previousQuestion = [...messages].reverse().find(item => item.role === 'user')?.text
      const retryAnswer = taskError && !error && !catalogMessage && previousQuestion
      const status = !dialog && statusText ? h('div', { className: 'dsh-nb-status ' + (error || taskError ? 'dsh-nb-error' : 'dsh-nb-notice'), role: error || taskError ? 'alert' : 'status' },
        h('span', null, statusText), retryAnswer ? chip('重新发送', () => ask(previousQuestion), { disabled: running || !hasRoute, 'data-action': 'retry-answer' }) : error || taskError || catalogMessage ? chip(error || taskError ? '重试' : '刷新模型', retry, { 'data-action': 'retry' }) : notice ? iconButton('close', '关闭提示', () => setNotice('')) : null) : null
      const closeDialog = () => {
        if (dialog === 'source' && studyReturnId && artifacts.some(item => item.id === studyReturnId)) { setArtifactId(studyReturnId); setDialog('artifact') }
        else setDialog('')
        setStudyReturnId(''); setConfirmDelete(false); sourceSequence.current++
      }
      function showPane(value) { setPane(value); if (value === 'sources') setUi(current => ({ ...current, sourcesCollapsed: false })); if (value === 'studio') setUi(current => ({ ...current, studioCollapsed: false })) }
      function togglePanel(which) { setUi(current => ({ ...current, [which]: !current[which] })) }
      async function openNotebook(id) {
        if (!id) return
        if (await run('open', { notebookId: id })) { setSource(null); setArtifact(null); setArtifactId(''); setDialog('') }
      }
      const artifactStatus = value => ({ done: '完成', failed: '失败', cancelled: '已停止', pending: '生成中', queued: '排队中', running: '生成中' })[value] || value
      const artifactLabel = item => item.title && item.title !== item.kind ? item.title : STUDIO.find(entry => entry[0] === item.kind)?.[1] || item.kind
      const researchStatus = ({ running: researchPhase, done: '构建完成', partial: '部分完成', failed: '构建失败', cancelled: '已停止', interrupted: '运行中断' })[research?.status] || '研究记录'
      const imported = [...(research?.imported || []), ...(research?.reused || []).map(item => ({ ...item, reused: true }))].filter((item, index, items) => items.findIndex(other => other.sourceId === item.sourceId) === index)
      const researchInNotebook = !research?.notebookId || research.notebookId === state?.notebookId
      const researchCard = research ? h('section', { className: 'dsh-nb-research', 'aria-label': '自动构建进度', 'data-research-status': research.status },
        h('div', { className: 'dsh-nb-research-heading', role: 'status' }, h('strong', null, researchStatus), h('span', { className: 'dsh-nb-meta' }, '已保存 ' + imported.length + ' / 目标 ' + research.targetSources + ' 个来源')),
        h('p', { className: 'dsh-nb-meta' }, research.prompt),
        researchRunning ? h('progress', { max: research.targetSources || 1, value: Math.min(imported.length, research.targetSources || 1), 'aria-label': '已保存来源进度' }) : null,
        research.error || research.artifactError ? h('p', { className: 'dsh-nb-research-error', role: 'alert' }, research.error || research.artifactError) : null,
        ['partial', 'cancelled', 'interrupted'].includes(research.status) ? h('p', { className: 'dsh-nb-meta' }, '已保存的来源仍可使用。可查看研究明细，或重新构建并选择补充当前笔记本。') : null,
        h('details', null, h('summary', null, '研究明细 · ' + (research.queries?.length || 0) + ' 个检索词 · ' + (research.candidates?.length || 0) + ' 个候选 · ' + (research.failures?.length || 0) + ' 项未完成'),
          research.queries?.length ? h('div', null, h('p', { className: 'dsh-nb-meta' }, '使用的检索词'), h('ul', { className: 'dsh-nb-research-queries' }, research.queries.map((query, index) => h('li', { key: index }, typeof query === 'string' ? query : query.query || query.text || '检索')))) : null,
          imported.length ? h('div', null, h('p', { className: 'dsh-nb-meta' }, '已保存来源'), h('ul', { className: 'dsh-nb-research-imported' }, imported.map((item, index) => h('li', { key: item.sourceId || index }, h('button', { type: 'button', disabled: !sources.some(source => source.id === item.sourceId), onClick: () => viewSource(item.sourceId) }, item.title || item.url || '来源'), h('div', { className: 'dsh-nb-meta' }, [item.url, item.reused ? '复用已有来源' : '', item.truncated ? '正文已截取，请核对完整原文' : ''].filter(Boolean).join(' · ')))))) : null,
          research.failures?.length ? h('div', null, h('p', { className: 'dsh-nb-meta' }, '未完成项目'), h('ul', { className: 'dsh-nb-research-failures' }, research.failures.map((item, index) => h('li', { key: index }, item.url ? h('span', { className: 'dsh-nb-meta' }, item.url + '：') : null, item.error || item.message || '未能完成')))) : null),
        !running && imported.length && researchInNotebook ? h('div', { className: 'dsh-nb-research-actions' }, chip('进入资料问答', async () => { if (await run('workspaceUpdate', { mode: 'sources' })) { setPane('chat'); composerRef.current?.focus() } }, { 'data-action': 'research-ask', disabled: !selected || pending.workspaceUpdate }), research.artifactId ? chip('打开学习指南', () => { setArtifactId(research.artifactId); setArtifact(null); setDialog('artifact') }, { 'data-action': 'research-guide', disabled: !artifacts.some(item => item.id === research.artifactId) }) : null) : !running && !researchInNotebook ? h('div', { className: 'dsh-nb-research-actions' }, chip('打开研究笔记本', () => openNotebook(research.notebookId), { 'data-action': 'research-notebook', disabled: !state?.notebooks?.some(item => item.id === research.notebookId) || pending.open })) : null) : null
      let dialogTitle = '', dialogContent = null
      if (dialog === 'research') {
        dialogTitle = '自动构建笔记本'
        dialogContent = h('form', { className: 'dsh-nb-form', onSubmit: event => { event.preventDefault(); startResearch() } },
          h('p', { className: 'dsh-nb-meta' }, '描述你想了解的内容，自动检索网页、保存来源并整理学习指南。'),
          h('label', null, '研究目标', h('textarea', { className: 'dsh-nb-field dsh-nb-area', 'aria-label': '自动构建研究目标', autoFocus: true, placeholder: '例如：从零学习海洋碳汇，了解核心概念、研究方法和主要争议，优先使用一手资料。', value: researchPrompt, onChange: event => setResearchPrompt(event.target.value), disabled: running })),
          h('label', null, '目标来源数', h('select', { className: 'dsh-nb-field', 'aria-label': '目标来源数', value: researchTarget, disabled: running, onChange: event => setResearchTarget(Number(event.target.value)) }, [3, 5, 8].map(count => h('option', { key: count, value: count }, count + ' 个来源')))),
          h('label', { className: 'dsh-nb-inline-check' }, h('input', { className: 'dsh-nb-check', type: 'checkbox', 'aria-label': '创建新的笔记本', checked: researchNewNotebook, disabled: running || !notebook, onChange: event => setResearchNewNotebook(event.target.checked) }), '创建新的笔记本'),
          researchNewNotebook ? h('label', null, '笔记本标题（可选）', h('input', { className: 'dsh-nb-field', 'aria-label': '自动构建笔记本标题', value: researchTitle, disabled: running, placeholder: '根据研究目标命名', onChange: event => setResearchTitle(event.target.value) })) : h('p', { className: 'dsh-nb-meta' }, '将来源补充到「' + (notebook?.title || '') + '」。'),
          h('label', null, '研究模型', h('select', { className: 'dsh-nb-field', 'aria-label': '自动构建模型', value: routeValue, disabled: running || pending.workspaceUpdate, onChange: event => { if (event.target.value) { const [provider, model] = JSON.parse(event.target.value); run('workspaceUpdate', { provider, model }) } } },
            !hasRoute ? h('option', { value: routeValue }, '请先配置可用模型') : null,
            ...providers.map(item => h('optgroup', { key: item.id, label: item.name || item.id }, ...(item.models || []).map(model => h('option', { key: model.id, value: JSON.stringify([item.id, model.id]) }, model.name || model.id)))))),
          h('p', { className: 'dsh-nb-meta', 'data-research-capability': state?.capabilities?.search === false ? 'unavailable' : 'available' }, state?.capabilities?.search === false ? 'DSH 当前未接入网页搜索，请先在宿主配置搜索提供方。也可以关闭此窗口，手动添加网址或本地资料。' : '使用 DSH 已接入的搜索和所选模型。网页可访问性与搜索服务状态会影响实际来源数；构建中可停止。'),
          h('div', { className: 'dsh-nb-form-actions' }, h('button', { className: 'dsh-nb-chip primary', type: 'submit', 'data-action': 'start-research', disabled: !workspace || !hasRoute || !researchPrompt.trim() || running || pending.workspaceUpdate || state?.capabilities?.search === false }, pending.researchStart ? '正在启动…' : '开始检索并构建')))
      } else if (dialog === 'notebooks') {
        dialogTitle = '笔记本'
        dialogContent = h('div', { className: 'dsh-nb-form' },
          h('label', null, '切换笔记本', h('select', { className: 'dsh-nb-field', 'aria-label': '当前笔记本', value: state?.notebookId || '', disabled: !workspace || running, onChange: event => openNotebook(event.target.value) },
            h('option', { value: '' }, '选择笔记本'), ...(state?.notebooks ?? []).map(item => h('option', { key: item.id, value: item.id }, item.title)))),
          h('div', { className: 'dsh-nb-menu' }, menuButton('plus', '创建笔记本', () => { setNotebookTitle(''); setDialog('create-notebook') }, { disabled: !workspace || running, 'data-action': 'create-notebook' }),
            menuButton('note', '重命名笔记本', () => { setNotebookTitle(notebook?.title || ''); setDialog('rename-notebook') }, { disabled: !notebook || running, 'data-action': 'rename-notebook' })))
      } else if (dialog === 'create-notebook' || dialog === 'rename-notebook') {
        const creating = dialog === 'create-notebook'
        dialogTitle = creating ? '创建笔记本' : '重命名笔记本'
        dialogContent = h('form', { className: 'dsh-nb-form', onSubmit: async event => {
          event.preventDefault()
          if (!notebookTitle.trim()) return
          const result = creating ? await run('create', { title: notebookTitle.trim(), bind: true, grounding: mode === 'sources' ? 'sources-only' : 'sources-plus-tools' }) : await run('update', { title: notebookTitle.trim() })
          if (result) { setNotebookTitle(''); setDialog('') }
        } }, h('label', null, '笔记本名称', h('input', { className: 'dsh-nb-field', 'aria-label': '笔记本名称', value: notebookTitle, autoFocus: true, onChange: event => setNotebookTitle(event.target.value) })),
        h('div', { className: 'dsh-nb-form-actions' }, h('button', { className: 'dsh-nb-chip primary', type: 'submit', disabled: !notebookTitle.trim() || pending.create || pending.update }, creating ? '创建' : '保存名称')))
      } else if (dialog === 'history' || dialog === 'rename-workspace') {
        dialogTitle = dialog === 'history' ? '会话历史' : '重命名会话'
        dialogContent = dialog === 'history' ? h('div', { className: 'dsh-nb-form' },
          h('label', null, '工作台会话', h('select', { className: 'dsh-nb-field dsh-nb-workspaces', 'aria-label': '工作台会话', value: workspaceId, onChange: event => { chooseWorkspace(event.target.value); setDialog('') } },
            !workspaceId ? h('option', { value: '' }, '准备工作台…') : null,
            ...(state?.workspaces ?? []).map(item => h('option', { key: item.id, value: item.id }, item.title)))),
          menuButton('note', '重命名当前会话', () => { setWorkspaceTitle(workspace?.title || ''); setDialog('rename-workspace') }, { disabled: !workspace, 'data-action': 'rename-workspace' })) :
          h('form', { className: 'dsh-nb-form', onSubmit: async event => { event.preventDefault(); if (workspaceTitle.trim() && await run('workspaceUpdate', { title: workspaceTitle.trim() })) setDialog('') } },
            h('label', null, '会话名称', h('input', { className: 'dsh-nb-field', 'aria-label': '工作台名称', autoFocus: true, value: workspaceTitle, onChange: event => setWorkspaceTitle(event.target.value) })),
            h('div', { className: 'dsh-nb-form-actions' }, h('button', { className: 'dsh-nb-chip primary', type: 'submit', disabled: !workspaceTitle.trim() || pending.workspaceUpdate }, '保存名称')))
      } else if (dialog === 'more') {
        dialogTitle = '更多操作'
        dialogContent = h('div', { className: 'dsh-nb-menu' },
          menuButton('link', '关联当前对话', async () => { if (await run('bindSession', { sessionId })) { setDialog(''); setNotice('已将这个笔记本关联到当前宿主对话。') } }, { disabled: !sessionId || !notebook || pending.bindSession, title: sessionId ? '关联当前宿主对话' : '先在宿主中打开一个对话', 'data-action': 'bind-session' }),
          menuButton('left', ui.sourcesCollapsed && ui.studioCollapsed ? '展开两侧面板' : '专注阅读', () => { const collapse = !(ui.sourcesCollapsed && ui.studioCollapsed); setUi(current => ({ ...current, sourcesCollapsed: collapse, studioCollapsed: collapse })); setPane('chat'); setDialog('') }, { 'data-action': 'focus' }),
          menuButton('motion', ui.motion ? '关闭粒子动态' : '开启粒子动态', () => { setUi(current => ({ ...current, motion: !current.motion })); setDialog('') }, { 'data-action': 'motion' }))
      } else if (dialog === 'add-source') {
        dialogTitle = adding === 'note' ? '创建笔记' : '添加来源'
        const isText = adding === 'text' || adding === 'note'
        dialogContent = h('form', { className: 'dsh-nb-form', onSubmit: event => { event.preventDefault(); addSource() } },
          adding !== 'note' ? h('div', { className: 'dsh-nb-tabs', role: 'group', 'aria-label': '来源类型' }, ['text', 'url', 'file'].map(kind => h('button', { key: kind, type: 'button', className: adding === kind ? 'on' : '', 'aria-pressed': adding === kind, onClick: () => setAdding(kind) }, kind === 'text' ? '文本' : kind === 'url' ? '网址' : '本地文本'))) : null,
          isText ? h('label', null, '名称', h('input', { className: 'dsh-nb-field', 'aria-label': '来源标题', placeholder: '名称（可选）', value: sourceTitle, onChange: event => setSourceTitle(event.target.value) })) : null,
          isText ? h('label', null, '内容', h('textarea', { className: 'dsh-nb-field dsh-nb-area', 'aria-label': '来源内容', placeholder: adding === 'note' ? '写下你的笔记' : '粘贴资料', value: draft, onChange: event => setDraft(event.target.value) })) :
            adding === 'url' ? h('label', null, '网页地址', h('input', { className: 'dsh-nb-field', 'aria-label': '来源网址', placeholder: 'https://', value: url, onChange: event => setUrl(event.target.value) })) :
            h('label', null, '本地文本文件路径', h('input', { className: 'dsh-nb-field', 'aria-label': '文本文件绝对路径', placeholder: '/Users/…/研究笔记.md', value: path, onChange: event => setPath(event.target.value) }), h('span', { className: 'dsh-nb-meta' }, '支持 TXT、Markdown、CSV、JSON 等文本文件。')),
          h('div', { className: 'dsh-nb-form-actions' }, h('button', { className: 'dsh-nb-chip primary', type: 'submit', disabled: running || Boolean(pending.addText || pending.addFile || pending.addUrl || pending.saveNote) || !(adding === 'file' ? path.trim() : adding === 'url' ? url.trim() : draft.trim()), 'data-action': 'add-source' }, adding === 'note' ? '保存笔记' : '加入来源')))
      } else if (dialog === 'source') {
        dialogTitle = source?.title || '来源原文'
        dialogContent = source ? h('div', { className: 'dsh-nb-source-detail' },
          studyReturnId ? chip('返回练习', closeDialog, { 'data-action': 'study-return' }) : null,
          h('form', { className: 'dsh-nb-source-tools', onSubmit: async event => { event.preventDefault(); if (sourceName.trim() && await run('renameSource', { id: source.id, title: sourceName.trim() })) setSource(current => current ? { ...current, title: sourceName.trim() } : current) } },
            h('input', { className: 'dsh-nb-field', 'aria-label': '来源名称', value: sourceName, onChange: event => setSourceName(event.target.value) }), h('button', { className: 'dsh-nb-chip', type: 'submit', disabled: running || !sourceName.trim() || pending.renameSource }, '保存名称')),
          h('div', { className: 'dsh-nb-meta' }, source.locator || source.url || source.path || source.kind),
          source.provenance?.fetchedAt ? h('p', { className: 'dsh-nb-meta', 'data-source-provenance': 'fetched-at' }, '正文获取时间：' + (Number.isNaN(new Date(source.provenance.fetchedAt).getTime()) ? String(source.provenance.fetchedAt) : new Date(source.provenance.fetchedAt).toLocaleString())) : null,
          source.provenance?.requestedUrl ? h('p', { className: 'dsh-nb-meta', 'data-source-provenance': 'requested-url' }, '原始请求网址：' + source.provenance.requestedUrl) : null,
          source.provenance?.truncated ? h('p', { className: 'dsh-nb-research-error', 'data-source-provenance': 'truncated' }, '已保存的正文经过截取，可能缺少部分内容；请结合原始网页核对。') : null,
          h('pre', { className: 'dsh-nb-source-body' }, source.body || source.text || '来源内容为空。'),
          h('div', { className: 'dsh-nb-form-actions' }, chip(confirmDelete ? '确认删除来源' : '删除来源', async () => { if (!confirmDelete) { setConfirmDelete(true); return } if (await run('deleteSource', { id: source.id })) { setSource(null); setConfirmDelete(false); setDialog('') } }, { className: 'dsh-nb-chip danger', disabled: running || pending.deleteSource }), confirmDelete ? chip('取消', () => setConfirmDelete(false)) : null)) : h('p', { className: 'dsh-nb-meta', role: 'status' }, error ? '无法读取来源。' : '正在读取来源…')
      } else if (dialog === 'artifact') {
        dialogTitle = artifact ? artifactLabel(artifact) : 'Studio 产物'
        const practice = artifact && ['quiz', 'flashcards'].includes(artifact.kind)
        const regenerate = async () => {
          const result = await run('generate', { kind: artifact.kind, prompt: '', provider: providerId, model: modelId }, 'generate:' + artifact.kind)
          if (result?.artifactId) { setArtifactId(result.artifactId); setArtifact(null); setDialog('artifact') }
        }
        dialogContent = practice && artifact.status === 'done' ? h(StudyPractice, {
          key: workspaceId + ':' + state.notebookId + ':' + artifact.id, artifact, workspaceId, notebookId: state.notebookId, hostSessionId: sessionId, sources,
          onOpenSource: id => { setStudyReturnId(artifact.id); viewSource(id) }, onRegenerate: regenerate,
          canRegenerate: Boolean(selected && hasRoute && !running && !busyStudio), regenerating: Boolean(pending['generate:' + artifact.kind]),
        }) : practice ? h('div', { className: 'dsh-nb-form' },
          h('p', { className: 'dsh-nb-meta', role: 'status' }, artifactStatus(artifact.status)),
          h('p', null, pendingArtifact(artifact) ? '练习准备好后，即可在这里开始。' : artifact.error || '这份练习没有完成，请重新生成。'),
          !pendingArtifact(artifact) ? chip('重新生成练习', regenerate, { disabled: !selected || !hasRoute || running || busyStudio, 'data-action': 'study-regenerate' }) : null) : artifact ? h('div', { className: 'dsh-nb-form' },
          h('p', { className: 'dsh-nb-meta', role: 'status' }, artifactStatus(artifact.status)),
          h('pre', { className: 'dsh-nb-preview' }, ['study-guide', 'briefing', 'report'].includes(artifact.kind) && artifact.body ? h(CitationText, { text: artifact.body, sources, onOpen: viewSource }) : artifact.body || artifact.error || '正在生成…')) : h('p', { className: 'dsh-nb-meta', role: 'status' }, error ? '无法读取产物。' : '正在读取产物…')
      }
      return h('div', { className: 'dsh-nb dsh-nb-workbench', 'data-workspace-id': workspace?.id || '', 'data-notebook-id': state?.notebookId || '', 'data-pane': pane, 'data-sources-collapsed': String(ui.sourcesCollapsed), 'data-studio-collapsed': String(ui.studioCollapsed) },
        h('header', { className: 'dsh-nb-toolbar' },
          h('span', { className: 'dsh-nb-toolbar-brand' }, h(NotebookIcon, { size: 22 })),
          h('button', { type: 'button', className: 'dsh-nb-notebook-trigger', 'aria-label': '切换或管理笔记本', 'aria-haspopup': 'dialog', onClick: () => setDialog('notebooks'), 'data-action': 'notebooks' }, h('span', null, notebook?.title || 'Notebook'), h(UiIcon, { kind: 'chevron' })),
          h('div', { className: 'dsh-nb-toolbar-controls' },
            menuButton('history', '会话', () => setDialog('history'), { 'aria-label': '会话历史', 'data-action': 'history' }),
            menuButton('plus', '新对话', createWorkspace, { 'aria-label': '新建对话', disabled: pending.workspaceCreate, 'data-action': 'new-workspace' }),
            iconButton('more', '更多操作', () => setDialog('more'), { 'data-action': 'more' }))),
        h('nav', { className: 'dsh-nb-pane-tabs', 'aria-label': '工作区域' }, [['sources', '来源 ' + sources.length], ['chat', '对话'], ['studio', 'Studio']].map(([value, label]) => h('button', { key: value, type: 'button', 'aria-pressed': pane === value, 'data-pane-target': value, onClick: () => showPane(value) }, label))),
        h('div', { className: 'dsh-nb-grid' },
          h('section', { className: 'dsh-nb-col is-sources', 'aria-label': '来源' },
            h('div', { className: 'dsh-nb-rail' }, iconButton('left', '展开来源', () => togglePanel('sourcesCollapsed'), { 'data-action': 'expand-sources' }), h('span', null, '来源'), h('span', null, selected)),
            h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-title' }, '来源'), h('span', { className: 'dsh-nb-count' }, sources.length), iconButton('left', '收起来源', () => togglePanel('sourcesCollapsed'), { className: 'dsh-nb-icon-button dsh-nb-collapse', 'data-action': 'collapse-sources' })),
            h('div', { className: 'dsh-nb-source-tools-row' }, chip('自动构建', openResearch, { className: 'dsh-nb-chip primary dsh-nb-build-entry', disabled: !workspace || running, 'data-action': 'open-research' }), chip([h(UiIcon, { key: 'icon', kind: 'plus' }), '添加来源'], () => { setAdding('text'); setDialog('add-source') }, { disabled: !notebook || running, 'data-action': 'open-add-source' }), iconButton('note', '创建笔记', () => { setAdding('note'); setDialog('add-source') }, { disabled: !notebook || running, 'data-action': 'new-note' })),
            h('div', { className: 'dsh-nb-source-search' }, h('input', { className: 'dsh-nb-field', type: 'search', placeholder: '查找来源', 'aria-label': '查找来源', value: sourceFilter, onChange: event => setSourceFilter(event.target.value) })),
            h('div', { className: 'dsh-nb-source-summary' }, h('span', null, '已选 ' + selected + ' 个'), h('label', null, '全选', h(SelectionCheckbox, { checked: readySources.length > 0 && selected === readySources.length, mixed: selected > 0 && selected < readySources.length, disabled: running || !readySources.length || pending.setSources, onChange: event => run('setSources', { changes: readySources.map(item => ({ id: item.id, enabled: event.target.checked })) }) }))),
            h('div', { className: 'dsh-nb-scroll' }, filtered.map(item => h('div', { key: item.id, className: 'dsh-nb-source' },
              h('button', { className: 'dsh-nb-source-open', type: 'button', title: item.title, onClick: () => viewSource(item.id) }, h(KindMark, { kind: item.kind }), h('span', { className: 'dsh-nb-copy' }, h('span', { className: 'dsh-nb-title' }, item.title), h('span', { className: 'dsh-nb-meta' }, (item.kind === 'url' ? '网页' : item.kind === 'file' ? '文件' : item.kind === 'note' ? '笔记' : '文本') + ' · ' + (item.status === 'ready' ? '可用' : item.status)))),
              h('input', { className: 'dsh-nb-check', type: 'checkbox', 'aria-label': '使用来源：' + item.title, checked: item.enabled, disabled: running || pending.setSources, onChange: event => run('setSources', { changes: [{ id: item.id, enabled: event.target.checked }] }) }))),
              !sources.length ? h('div', { className: 'dsh-nb-empty' }, h('p', { className: 'dsh-nb-meta' }, notebook ? '添加资料，或在「搜集构建」中描述研究目标。' : '创建笔记本，或直接描述研究目标。'), !notebook ? chip('创建笔记本', () => { setNotebookTitle(''); setDialog('create-notebook') }, { disabled: !workspace || running }) : null) : !filtered.length ? h('p', { className: 'dsh-nb-meta dsh-nb-empty' }, '没有匹配的来源。') : null),
            h('div', { className: 'dsh-nb-foot' }, '勾选的来源用于回答和生成内容。')),
          h('section', { className: 'dsh-nb-col is-main', 'aria-label': '研究对话' },
            h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-title', title: workspace?.title }, workspace?.title || '对话'), h('span', { className: 'dsh-nb-meta dsh-nb-scope' }, mode === 'sources' ? '基于 ' + selected + ' 个来源' : '可使用资料搜集工具')),
            h('div', { className: 'dsh-nb-thread', ref: threadRef },
              h(DeepSea, { activity: particleActivity, caption, compact: messages.length > 0 || Boolean(research), mode, motion: ui.motion }),
              !messages.length && !research ? h('div', { className: 'dsh-nb-hero' }, h('h2', null, mode === 'sources' ? '让资料，连成思路' : '从一个问题，开始研究'), h('p', { className: 'dsh-nb-meta' }, mode === 'sources' ? '从勾选来源出发，提问、比较，整理思路。' : '搜集资料、整理证据，逐步建立你的笔记本。'), h('div', { className: 'dsh-nb-suggest' }, mode === 'research' ? chip('自动构建笔记本', openResearch, { disabled: !workspace || running, 'data-action': 'hero-research' }) : null, (mode === 'sources' ? SUGGEST : ['围绕研究目标搜集资料', '读取本地资料，整理证据']).map(text => chip(text, () => { setQuestion(text); composerRef.current?.focus() }, { key: text, disabled: running })))) : null,
              researchCard,
              h('div', { 'aria-live': 'polite', 'aria-relevant': 'additions text' }, messages.map((item, index) => h('article', { key: item.id || index, className: 'dsh-nb-message ' + item.role + (item.status === 'failed' ? ' is-failed' : '') },
                h('div', { className: 'dsh-nb-message-meta' }, h('span', null, item.role === 'user' ? '你' : item.role === 'assistant' ? '助手' : item.role === 'tool' ? (TOOL_LABELS[item.toolName] || item.toolName || '工具') : '工作台'), item.status && !['done', 'completed'].includes(item.status) ? h('span', null, ({ running: '执行中', pending: '等待中', streaming: '回答中', failed: '失败', cancelled: '已停止' })[item.status] || item.status) : null),
                h('div', { className: 'dsh-nb-message-body' }, h(CitationText, { text: item.text || (item.role === 'assistant' && running ? '正在思考…' : ''), sources, onOpen: viewSource })),
                item.role === 'assistant' && String(item.text || '').trim() && !running ? h('div', { className: 'dsh-nb-message-actions' }, menuButton('pin', pending['note:' + item.id] ? '保存中…' : '保存到笔记', async () => { if (await run('saveNote', { title: (workspace?.title || '研究') + ' · 回答笔记', body: item.text }, 'note:' + item.id)) setNotice('已保存到当前笔记本。') }, { disabled: !notebook || pending['note:' + item.id], 'data-action': 'save-answer' })) : null))),
              running ? h('div', { className: 'dsh-nb-task', role: 'status' }, h('span', { className: 'dsh-nb-pulse', 'aria-hidden': 'true' }), researchRunning ? researchPhase : phaseLabel(task?.phase)) : task?.status === 'failed' ? h('div', { className: 'dsh-nb-task', role: 'status' }, '本次运行失败，请查看错误提示后重试。') : task?.status === 'cancelled' ? h('div', { className: 'dsh-nb-meta dsh-nb-task' }, '本次运行已停止。') : null),
            status,
            h('form', { className: 'dsh-nb-composer', onSubmit: event => { event.preventDefault(); if (canSend) ask(question) } },
              h('textarea', { rows: 2, ref: composerRef, 'aria-label': '发送给模型的消息', placeholder: !hasRoute ? '选择可用模型后开始…' : mode === 'sources' ? '向这些资料提问…' : '描述研究目标，或提供网址和资料路径…', value: question, onChange: event => setQuestion(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) { event.preventDefault(); if (canSend) ask(question) } } }),
              h('div', { className: 'dsh-nb-composer-bottom' },
                h('div', { className: 'dsh-nb-mode', role: 'group', 'aria-label': '工作模式' }, ['sources', 'research'].map(value => h('button', { key: value, type: 'button', className: mode === value ? 'on' : '', disabled: !workspace || running, 'aria-pressed': mode === value, onClick: () => run('workspaceUpdate', { mode: value }), 'data-mode': value }, value === 'sources' ? '资料问答' : '搜集构建'))),
                h('div', { className: 'dsh-nb-model' }, h('select', { className: 'dsh-nb-model-select', 'aria-label': '对话模型', title: provider && selectedModel ? (provider.name || provider.id) + ' · ' + (selectedModel.name || selectedModel.id) : '选择模型', value: routeValue, disabled: !workspace || running, onChange: event => { if (!event.target.value) return; const [provider, model] = JSON.parse(event.target.value); run('workspaceUpdate', { provider, model }) } },
                  !routeValue ? h('option', { value: '' }, '无可用模型') : !hasRoute ? h('option', { value: routeValue }, modelId + '（暂不可用）') : null,
                  ...providers.map(item => h('optgroup', { key: item.id, label: item.name || item.id, disabled: !item.models?.length }, ...(item.models ?? []).map(model => h('option', { key: model.id, value: JSON.stringify([item.id, model.id]) }, model.name || model.id)))))),
                running ? chip(pending.cancel ? '停止中…' : '停止', () => run('cancel'), { className: 'dsh-nb-chip dsh-nb-stop', disabled: pending.cancel, 'data-action': 'stop' }) : h('button', { className: 'dsh-nb-send', type: 'submit', disabled: !canSend, 'aria-label': '发送' }, h(UiIcon, { kind: 'send' })))),
            h('div', { className: 'dsh-nb-composer-hint' }, h('span', null, mode === 'sources' ? selected ? '仅依据勾选来源' : '请先勾选可用来源' : '可搜索网页、读取资料与创建笔记本'), h('span', null, 'Shift + Enter 换行'))),
          h('section', { className: 'dsh-nb-col is-studio', 'aria-label': 'Studio' },
            h('div', { className: 'dsh-nb-rail' }, iconButton('right', '展开 Studio', () => togglePanel('studioCollapsed'), { 'data-action': 'expand-studio' }), h('span', null, 'Studio')),
            h('div', { className: 'dsh-nb-head' }, h('span', { className: 'dsh-nb-title' }, 'Studio'), iconButton('right', '收起 Studio', () => togglePanel('studioCollapsed'), { className: 'dsh-nb-icon-button dsh-nb-collapse', 'data-action': 'collapse-studio' })),
            h('div', { className: 'dsh-nb-studio' },
              h('div', { className: 'dsh-nb-studio-grid' }, STUDIO.map(([kind, label, description]) => {
                const busy = Boolean(pending['generate:' + kind]) || artifacts.some(item => item.kind === kind && pendingArtifact(item))
                return h('button', { key: kind, className: 'dsh-nb-card' + (busy ? ' is-busy' : ''), type: 'button', title: description, disabled: !notebook || !selected || !hasRoute || busy || running, onClick: async () => { const result = await run('generate', { kind, prompt: question, provider: providerId, model: modelId }, 'generate:' + kind); if (result?.artifactId) { setArtifactId(result.artifactId); setArtifact(null); setDialog('artifact') } } }, h(StudioGlyph, { kind }), h('strong', null, label + (busy ? ' · 生成中' : '')))
              })),
              !notebook || !selected ? h('p', { className: 'dsh-nb-meta' }, '勾选来源后即可生成内容。') : !hasRoute ? h('p', { className: 'dsh-nb-meta' }, '选择模型后即可生成内容。') : null,
              h('div', { className: 'dsh-nb-art-heading' }, '已生成 · ' + artifacts.length),
              artifacts.map(item => h('button', { key: item.id, className: 'dsh-nb-art', type: 'button', 'data-artifact-id': item.id, onClick: () => { setArtifactId(item.id); setArtifact(null); setStudyReturnId(''); setDialog('artifact') } }, h(StudioGlyph, { kind: item.kind }), h('span', { className: 'dsh-nb-art-copy' }, h('strong', null, artifactLabel(item)), h('small', null, artifactStatus(item.status) + (item.created_at || item.createdAt ? ' · ' + new Date(item.created_at || item.createdAt).toLocaleDateString() : ''))))),
              !artifacts.length ? h('p', { className: 'dsh-nb-meta' }, '生成的内容会保存在这里。') : null))),
        dialog ? h(Dialog, { key: dialog, title: dialogTitle, onClose: closeDialog, content: dialogContent, error }) : null)
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
      inject: ['slots', 'layout', 'sessions', 'connection'],
      apply(ctx) {
        connectionRpc = ctx.connection?.rpc
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
