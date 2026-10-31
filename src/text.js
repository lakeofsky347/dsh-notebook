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
  const tokens = []
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    for (const part of match[0].matchAll(/\p{Script=Han}+|[^\p{Script=Han}]+/gu)) {
      const value = part[0]
      if (!/^\p{Script=Han}/u.test(value)) {
        tokens.push(value)
        continue
      }
      // Character pairs match Chinese terms without relying on dictionary boundaries.
      const chars = [...value]
      for (let index = 0; index < chars.length; index += 1) {
        tokens.push(chars[index])
        if (index + 1 < chars.length) tokens.push(chars[index] + chars[index + 1])
      }
    }
  }
  return tokens
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
  const budget = Math.max(0, Math.floor(Number(maxChars) || 0))
  let context = ''
  function append(block, separator = '\n', truncate = true) {
    const prefix = context === '' ? '' : separator
    const remaining = budget - context.length - prefix.length
    if (remaining <= 0) return false
    if (block.length <= remaining) {
      context += prefix + block
      return true
    }
    if (truncate) {
      let clipped = block.slice(0, remaining)
      // Keep UTF-16 surrogate pairs intact at the character budget boundary.
      if (/[\uD800-\uDBFF]$/.test(clipped)) clipped = clipped.slice(0, -1)
      context += prefix + clipped
    }
    return false
  }
  const styleLine = notebook.style === 'learning'
    ? 'Style: learning guide. Explain terms, then answer from the passages.'
    : notebook.style === 'custom'
      ? 'Style: follow the notebook instructions as the voice of the answer.'
      : 'Style: default research assistant.'
  const groundingLine = notebook.grounding === 'sources-only'
    ? 'Grounding: sources-only. Answer only from the passages below. If they do not contain the answer, say the notebook does not contain it. Do not use outside knowledge.'
    : 'Grounding: sources plus tools. Prefer these passages and cite source ids. Other tools may add to them.'
  // Preserve grounding and answer instructions before optional metadata or passages.
  if (!append(groundingLine)) return context
  if (!append(styleLine)) return context
  if (notebook.instructions.trim() !== '') {
    if (!append('Instructions:\n' + notebook.instructions.trim(), '\n\n')) return context
  }
  if (!append('Notebook: ' + notebook.title)) return context
  if (passages.length === 0) {
    append('No passages were retrieved from the selected sources.', '\n\n')
    return context
  }
  if (!append('Passages:', '\n\n')) return context
  let kept = 0
  for (const passage of passages) {
    const block = '[' + (kept + 1) + '] sourceId=' + passage.sourceId + ' title=' + passage.title + ' chunk=' + passage.ordinal + '\n' + passage.text
    if (!append(block, '\n\n', false)) break
    kept += 1
  }
  if (kept < passages.length) {
    append('[truncated ' + (passages.length - kept) + ' lower-ranked passages]', '\n\n')
  }
  return context
}
