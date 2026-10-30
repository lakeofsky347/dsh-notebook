import { createHash } from 'node:crypto'

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.text'])

export function wordCount(text) {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

export function hashText(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function assertText(text) {
  if (text.includes('\0')) throw new Error('file is not UTF-8 text')
}

export function isTextPath(filePath) {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const dot = filePath.lastIndexOf('.')
  if (dot < 0 || dot < slash) return false
  return TEXT_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}

export function chunkText(text, chunkChars, overlap) {
  const paragraphs = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
  const pieces = []
  const push = (para) => {
    if (para.length <= chunkChars) {
      pieces.push(para)
      return
    }
    const step = Math.max(1, chunkChars - overlap)
    for (let index = 0; index < para.length; index += step) {
      pieces.push(para.slice(index, index + chunkChars))
      if (index + chunkChars >= para.length) break
    }
  }
  for (const paragraph of paragraphs) push(paragraph)
  return pieces.map((piece, ordinal) => ({
    ordinal,
    text: piece,
    locator: { ordinal, chars: piece.length },
  }))
}

export function tokenize(text) {
  return [...text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map(match => match[0])
}

export function rankChunks(chunks, query, topK) {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0 || chunks.length === 0 || topK <= 0) return []
  const docs = chunks.map(chunk => tokenize(chunk.text))
  const total = docs.length
  const documentFrequency = new Map()
  const stats = docs.map(tokens => {
    const frequency = new Map()
    for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1)
    for (const token of frequency.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
    return { frequency, length: tokens.length }
  })
  const average = stats.reduce((sum, doc) => sum + doc.length, 0) / total || 1
  const k1 = 1.2
  const b = 0.75
  const ranked = chunks.map((chunk, index) => {
    let score = 0
    const frequency = stats[index].frequency
    const length = stats[index].length
    for (const token of queryTokens) {
      const freq = frequency.get(token) ?? 0
      if (freq === 0) continue
      const docsWithToken = documentFrequency.get(token) ?? 0
      const idf = Math.log(1 + (total - docsWithToken + 0.5) / (docsWithToken + 0.5))
      score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * length / average))
    }
    return { chunk, score }
  })
  ranked.sort((left, right) => right.score - left.score || left.chunk.ordinal - right.chunk.ordinal)
  return ranked.filter(item => item.score > 0).slice(0, topK).map(item => item.chunk)
}

export function renderContext(notebook, passages, maxChars) {
  const styleLine = notebook.style === 'learning'
    ? 'Style: learning guide. Explain terms, then answer from the passages.'
    : notebook.style === 'custom'
      ? 'Style: follow the notebook instructions as the voice of the answer.'
      : 'Style: default research assistant.'
  const groundingLine = notebook.grounding === 'sources-only'
    ? 'Grounding: sources-only. Answer only from the passages below. If they do not contain the answer, say the notebook does not contain it. Do not use outside knowledge.'
    : 'Grounding: sources plus tools. Prefer these passages and cite source ids. Other tools may add to them.'
  const lines = ['Notebook: ' + notebook.title, styleLine, groundingLine]
  if (notebook.instructions.trim() !== '') {
    lines.push('', 'Instructions:', notebook.instructions.trim())
  }
  if (passages.length === 0) {
    lines.push('', 'No passages were retrieved from the selected sources.')
    return lines.join('\n')
  }
  lines.push('', 'Passages:')
  let used = lines.join('\n').length
  let kept = 0
  for (const passage of passages) {
    const block = '[' + (kept + 1) + '] sourceId=' + passage.sourceId + ' title=' + passage.title + ' chunk=' + passage.ordinal + '\n' + passage.text
    if (used + block.length + 1 > maxChars) break
    lines.push('', block)
    used += block.length + 1
    kept += 1
  }
  if (kept < passages.length) {
    lines.push('', '[truncated ' + (passages.length - kept) + ' lower-ranked passages]')
  }
  return lines.join('\n')
}
