import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { assertText, chunkText, hashText, isTextPath, rankChunks, wordCount } from './text.js'

export const SOURCE_KINDS = ['file', 'text', 'url', 'note']
export const ARTIFACT_KINDS = ['report', 'study-guide', 'briefing', 'flashcards', 'quiz', 'mind-map', 'data-table']

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    instructions TEXT NOT NULL,
    style TEXT NOT NULL,
    grounding TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    locator TEXT NOT NULL,
    body TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    error TEXT NOT NULL,
    mtime_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    locator TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    body TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    error TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bindings (
    session_id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS sources_notebook ON sources (notebook_id)',
  'CREATE INDEX IF NOT EXISTS chunks_source ON chunks (source_id)',
  'CREATE INDEX IF NOT EXISTS artifacts_notebook ON artifacts (notebook_id)',
].join(';\n')

function fail(message) {
  const error = new Error(message)
  error.code = 'notebook/rejected'
  return error
}

function missing(message) {
  const error = new Error(message)
  error.code = 'notebook/not-found'
  return error
}

export function openLibrary(file, limits, deps = {}) {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  const readFile = deps.readFile ?? ((path) => readFileSync(path))
  const stat = deps.stat ?? ((path) => statSync(path))
  const fetchImpl = deps.fetch ?? globalThis.fetch

  const notebookStmt = {
    insert: db.prepare('INSERT INTO notebooks (id, title, instructions, style, grounding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT n.*, (SELECT COUNT(*) FROM sources s WHERE s.notebook_id = n.id) AS source_count FROM notebooks n ORDER BY updated_at DESC'),
    get: db.prepare('SELECT * FROM notebooks WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM notebooks'),
    update: db.prepare('UPDATE notebooks SET title = ?, instructions = ?, style = ?, grounding = ?, updated_at = ? WHERE id = ?'),
    touch: db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?'),
  }
  const sourceStmt = {
    count: db.prepare('SELECT COUNT(*) AS n FROM sources WHERE notebook_id = ?'),
    insert: db.prepare('INSERT INTO sources (id, notebook_id, kind, title, locator, body, enabled, label, status, content_hash, word_count, error, mtime_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT id, notebook_id, kind, title, locator, enabled, label, status, content_hash, word_count, error, mtime_ms, created_at FROM sources WHERE notebook_id = ? ORDER BY created_at ASC'),
    get: db.prepare('SELECT * FROM sources WHERE id = ?'),
    byNotebook: db.prepare('SELECT * FROM sources WHERE notebook_id = ?'),
    updateBody: db.prepare('UPDATE sources SET body = ?, status = ?, content_hash = ?, word_count = ?, error = ?, mtime_ms = ?, title = ? WHERE id = ?'),
    setEnabled: db.prepare('UPDATE sources SET enabled = ? WHERE id = ? AND notebook_id = ?'),
    setStatus: db.prepare('UPDATE sources SET status = ?, error = ? WHERE id = ?'),
  }
  const chunkStmt = {
    insert: db.prepare('INSERT INTO chunks (id, source_id, ordinal, text, locator) VALUES (?, ?, ?, ?, ?)'),
    del: db.prepare('DELETE FROM chunks WHERE source_id = ?'),
    forSource: db.prepare('SELECT * FROM chunks WHERE source_id = ? ORDER BY ordinal ASC'),
  }
  const artifactStmt = {
    insert: db.prepare('INSERT INTO artifacts (id, notebook_id, kind, title, prompt, status, body, source_revision, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    finish: db.prepare('UPDATE artifacts SET status = ?, body = ?, error = ? WHERE id = ?'),
    list: db.prepare('SELECT id, notebook_id, kind, title, prompt, status, source_revision, error, created_at, length(body) AS body_chars FROM artifacts WHERE notebook_id = ? ORDER BY created_at DESC'),
    get: db.prepare('SELECT * FROM artifacts WHERE id = ?'),
  }
  const bindingStmt = {
    upsert: db.prepare('INSERT INTO bindings (session_id, notebook_id) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET notebook_id = excluded.notebook_id'),
    del: db.prepare('DELETE FROM bindings WHERE session_id = ?'),
    get: db.prepare('SELECT notebook_id FROM bindings WHERE session_id = ?'),
    sessions: db.prepare('SELECT session_id FROM bindings WHERE notebook_id = ?'),
  }

  function requireNotebook(id) {
    const row = notebookStmt.get.get(id)
    if (!row) throw missing('notebook not found: ' + id)
    return row
  }

  function replaceChunks(sourceId, pieces) {
    chunkStmt.del.run(sourceId)
    for (const piece of pieces) {
      chunkStmt.insert.run(randomUUID(), sourceId, piece.ordinal, piece.text, JSON.stringify(piece.locator))
    }
  }

  function storeBody(notebookId, fields) {
    const count = sourceStmt.count.get(notebookId).n
    if (count >= limits.maxSourcesPerNotebook) throw fail('source limit reached')
    const words = wordCount(fields.body)
    if (words > limits.maxWordsPerSource) throw fail('source exceeds word limit')
    if (Buffer.byteLength(fields.body) > limits.maxUploadBytes) throw fail('source exceeds byte limit')
    const id = fields.id ?? randomUUID()
    const hash = hashText(fields.body)
    const now = Date.now()
    db.exec('BEGIN')
    try {
      sourceStmt.insert.run(id, notebookId, fields.kind, fields.title, fields.locator ?? '', fields.body, fields.enabled === false ? 0 : 1, fields.label ?? '', 'ready', hash, words, '', fields.mtimeMs ?? 0, now)
      replaceChunks(id, chunkText(fields.body, limits.chunkChars, limits.chunkOverlap))
      notebookStmt.touch.run(now, notebookId)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return publicSource(sourceStmt.get.get(id))
  }

  function publicSource(row) {
    if (!row) return null
    return {
      id: row.id,
      notebookId: row.notebook_id,
      kind: row.kind,
      title: row.title,
      locator: row.locator,
      enabled: row.enabled === 1,
      label: row.label,
      status: row.status,
      contentHash: row.content_hash,
      wordCount: row.word_count,
      error: row.error,
      createdAt: row.created_at,
    }
  }

  function publicNotebook(row) {
    return {
      id: row.id,
      title: row.title,
      instructions: row.instructions,
      style: row.style,
      grounding: row.grounding,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceCount: row.source_count ?? sourceStmt.count.get(row.id).n,
    }
  }

  function refreshFile(row) {
    if (row.kind !== 'file' || row.status === 'error') return row
    let info
    try {
      info = stat(row.locator)
    } catch {
      if (row.status !== 'inactive') sourceStmt.setStatus.run('inactive', 'file is not readable', row.id)
      return sourceStmt.get.get(row.id)
    }
    if (!info.isFile()) {
      sourceStmt.setStatus.run('inactive', 'path is not a file', row.id)
      return sourceStmt.get.get(row.id)
    }
    if (info.mtimeMs === row.mtime_ms && row.status === 'ready') return row
    let body
    try {
      body = readFile(row.locator).toString('utf8')
      assertText(body)
    } catch (error) {
      sourceStmt.setStatus.run('error', error.message, row.id)
      return sourceStmt.get.get(row.id)
    }
    const hash = hashText(body)
    if (hash === row.content_hash && row.status === 'ready') {
      sourceStmt.updateBody.run(row.body, 'ready', row.content_hash, row.word_count, '', info.mtimeMs, row.title, row.id)
      return sourceStmt.get.get(row.id)
    }
    const words = wordCount(body)
    if (words > limits.maxWordsPerSource || Buffer.byteLength(body) > limits.maxUploadBytes) {
      sourceStmt.setStatus.run('error', 'updated file exceeds the source limit', row.id)
      return sourceStmt.get.get(row.id)
    }
    db.exec('BEGIN')
    try {
      sourceStmt.updateBody.run(body, 'ready', hash, words, '', info.mtimeMs, row.title, row.id)
      replaceChunks(row.id, chunkText(body, limits.chunkChars, limits.chunkOverlap))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return sourceStmt.get.get(row.id)
  }

  return {
    file,
    createNotebook({ title, instructions = '', style = 'default', grounding = 'sources-only' }) {
      if (notebookStmt.count.get().n >= limits.maxNotebooks) throw fail('notebook limit reached')
      const name = String(title ?? '').trim()
      if (name === '') throw fail('title is required')
      if (!['default', 'learning', 'custom'].includes(style)) throw fail('unknown style')
      if (!['sources-only', 'sources-plus-tools'].includes(grounding)) throw fail('unknown grounding')
      const id = randomUUID()
      const now = Date.now()
      notebookStmt.insert.run(id, name, String(instructions), style, grounding, now, now)
      return publicNotebook(notebookStmt.get.get(id))
    },
    listNotebooks() {
      return notebookStmt.list.all().map(publicNotebook)
    },
    getNotebook(id) {
      const row = notebookStmt.get.get(id)
      return row ? publicNotebook(row) : null
    },
    updateNotebook(id, patch) {
      const row = requireNotebook(id)
      const title = patch.title === undefined ? row.title : String(patch.title).trim()
      if (title === '') throw fail('title is required')
      const style = patch.style ?? row.style
      const grounding = patch.grounding ?? row.grounding
      if (!['default', 'learning', 'custom'].includes(style)) throw fail('unknown style')
      if (!['sources-only', 'sources-plus-tools'].includes(grounding)) throw fail('unknown grounding')
      const instructions = patch.instructions === undefined ? row.instructions : String(patch.instructions)
      notebookStmt.update.run(title, instructions, style, grounding, Date.now(), id)
      return publicNotebook(notebookStmt.get.get(id))
    },
    addText(notebookId, title, body) {
      requireNotebook(notebookId)
      const text = String(body ?? '')
      if (text.trim() === '') throw fail('text is empty')
      assertText(text)
      return storeBody(notebookId, { kind: 'text', title: title?.trim() || 'Pasted text', body: text, locator: '' })
    },
    addFile(notebookId, filePath) {
      requireNotebook(notebookId)
      const path = String(filePath ?? '')
      if (!isTextPath(path)) throw fail('only utf-8 text, markdown, csv, and json files are accepted')
      let info
      try { info = stat(path) } catch { throw fail('file is not readable') }
      if (!info.isFile()) throw fail('path is not a file')
      let body
      try {
        body = readFile(path).toString('utf8')
        assertText(body)
      } catch (error) {
        throw fail(error.message || 'file is not readable')
      }
      const base = path.split('/').pop()
      return storeBody(notebookId, { kind: 'file', title: base, body, locator: path, mtimeMs: info.mtimeMs })
    },
    async addUrl(notebookId, url) {
      requireNotebook(notebookId)
      let parsed
      try { parsed = new URL(String(url)) } catch { throw fail('invalid url') }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw fail('only http(s) urls are accepted')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), limits.urlTimeoutMs)
      try {
        const response = await fetchImpl(parsed.href, { signal: controller.signal, redirect: 'follow' })
        if (!response.ok) throw fail('url returned ' + response.status)
        const type = String(response.headers.get('content-type') ?? '')
        if (type !== '' && !/^text\//.test(type) && !type.includes('json') && !type.includes('xml')) {
          throw fail('url is not a text document')
        }
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length > limits.maxUrlBytes) throw fail('url exceeds the download limit')
        const body = bytes.toString('utf8')
        assertText(body)
        if (body.trim() === '') throw fail('url document is empty')
        return storeBody(notebookId, { kind: 'url', title: parsed.hostname + parsed.pathname, body, locator: parsed.href })
      } catch (error) {
        if (error.code === 'notebook/rejected') throw error
        throw fail(error.name === 'AbortError' ? 'url timed out' : (error.message || 'url fetch failed'))
      } finally {
        clearTimeout(timer)
      }
    },
    saveNote(notebookId, { id, title, body }) {
      requireNotebook(notebookId)
      const text = String(body ?? '')
      if (text.trim() === '') throw fail('note is empty')
      assertText(text)
      if (id) {
        const existing = sourceStmt.get.get(id)
        if (!existing || existing.notebook_id !== notebookId || existing.kind !== 'note') throw missing('note not found')
        const words = wordCount(text)
        if (words > limits.maxWordsPerSource) throw fail('source exceeds word limit')
        const hash = hashText(text)
        db.exec('BEGIN')
        try {
          sourceStmt.updateBody.run(text, 'ready', hash, words, '', 0, title?.trim() || existing.title, id)
          replaceChunks(id, chunkText(text, limits.chunkChars, limits.chunkOverlap))
          notebookStmt.touch.run(Date.now(), notebookId)
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
        return publicSource(sourceStmt.get.get(id))
      }
      return storeBody(notebookId, { kind: 'note', title: title?.trim() || 'Note', body: text, locator: '' })
    },
    listSources(notebookId) {
      requireNotebook(notebookId)
      return sourceStmt.byNotebook.all(notebookId).map(row => publicSource(refreshFile(row)))
    },
    setSources(notebookId, changes) {
      requireNotebook(notebookId)
      for (const change of changes) {
        const row = sourceStmt.get.get(change.id)
        if (!row || row.notebook_id !== notebookId) throw missing('source not found: ' + change.id)
        sourceStmt.setEnabled.run(change.enabled ? 1 : 0, change.id, notebookId)
      }
      return sourceStmt.list.all(notebookId).map(publicSource)
    },
    search(notebookId, query, topK = limits.topK) {
      requireNotebook(notebookId)
      const chunks = []
      for (const row of sourceStmt.byNotebook.all(notebookId)) {
        const fresh = refreshFile(row)
        if (fresh.enabled !== 1 || fresh.status !== 'ready') continue
        for (const chunk of chunkStmt.forSource.all(fresh.id)) {
          chunks.push({ sourceId: fresh.id, title: fresh.title, ordinal: chunk.ordinal, text: chunk.text, locator: chunk.locator })
        }
      }
      return rankChunks(chunks, query, topK)
    },
    sourceRevision(notebookId) {
      requireNotebook(notebookId)
      const hashes = []
      for (const row of sourceStmt.byNotebook.all(notebookId)) {
        const fresh = refreshFile(row)
        if (fresh.enabled === 1 && fresh.status === 'ready') hashes.push(fresh.id + ':' + fresh.content_hash)
      }
      hashes.sort()
      return hashText(hashes.join('\n'))
    },
    bind(sessionId, notebookId) {
      requireNotebook(notebookId)
      bindingStmt.upsert.run(sessionId, notebookId)
      return { sessionId, notebookId }
    },
    unbind(sessionId) {
      bindingStmt.del.run(sessionId)
    },
    binding(sessionId) {
      return bindingStmt.get.get(sessionId)?.notebook_id ?? null
    },
    sessionsFor(notebookId) {
      return bindingStmt.sessions.all(notebookId).map(row => row.session_id)
    },
    createArtifact(notebookId, { kind, title, prompt }) {
      requireNotebook(notebookId)
      if (!ARTIFACT_KINDS.includes(kind)) throw fail('unknown artifact kind')
      const id = randomUUID()
      const revision = this.sourceRevision(notebookId)
      artifactStmt.insert.run(id, notebookId, kind, title?.trim() || kind, String(prompt ?? ''), 'pending', '', revision, '', Date.now())
      return artifactStmt.get.get(id)
    },
    finishArtifact(id, status, body, error = '') {
      const row = artifactStmt.get.get(id)
      if (!row) throw missing('artifact not found')
      if (row.status !== 'pending') return row
      artifactStmt.finish.run(status, body ?? '', error, id)
      return artifactStmt.get.get(id)
    },
    listArtifacts(notebookId) {
      requireNotebook(notebookId)
      return artifactStmt.list.all(notebookId)
    },
    getArtifact(id) {
      return artifactStmt.get.get(id) ?? null
    },
    close() { db.close() },
  }
}
