export function studioPrompt(kind, notebook, passages, userPrompt) {
  const asks = {
    report: 'Write a markdown report. Cite passages as [sourceId].',
    'study-guide': 'Write a markdown study guide with short checks for understanding. Cite passages as [sourceId].',
    briefing: 'Write a one-page markdown briefing. Cite passages as [sourceId].',
    flashcards: 'Return a JSON array of objects {"front","back"}. Do not wrap it in markdown.',
    quiz: 'Return a JSON array of objects {"question","choices","answer","explanation"}. Do not wrap it in markdown.',
    'mind-map': 'Return JSON {"topic","children":[{"topic","children":[]}]}. Do not wrap it in markdown.',
    'data-table': 'Return JSON {"columns":["name"],"rows":[["value"]]}. Do not wrap it in markdown.',
  }
  const ask = asks[kind]
  if (!ask) throw new Error('unknown artifact kind')
  const blocks = passages.map((passage, index) => {
    return '[' + (index + 1) + '] sourceId=' + passage.sourceId + ' title=' + passage.title + '\n' + passage.text
  })
  return [
    ask,
    'Use only the passages. If they are insufficient, say so.',
    'Notebook: ' + notebook.title,
    notebook.instructions.trim() === '' ? '' : 'Instructions: ' + notebook.instructions.trim(),
    'Request: ' + (userPrompt.trim() || kind),
    'Passages:',
    blocks.join('\n\n') || '(none)',
  ].filter(Boolean).join('\n\n')
}
