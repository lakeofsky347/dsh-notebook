import { randomUUID } from 'node:crypto'
import { hashText } from './text.js'

const MAX_ITEMS = 30
const HISTORY_LIMIT = 200

function rejected(message, code = 'notebook/rejected') {
  const error = new Error(message)
  error.code = code
  return error
}

function invalid(message) {
  throw rejected('invalid study artifact: ' + message, 'notebook/invalid-study-artifact')
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000 || value.includes('\0')) invalid(field + ' must be nonempty text (at most 20000 characters)')
  return value.trim()
}

function identifier(value, field) {
  const id = text(value, field)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) invalid(field + ' is not a valid ID')
  return id
}

/** Validate evidence-bearing exercises, including unambiguous legacy arrays. */
export function normalizeStudyArtifact(kind, body, allowedSourceIds) {
  if (!['quiz', 'flashcards'].includes(kind)) invalid('unsupported kind')
  const allowed = new Set(allowedSourceIds ?? [])
  let value = body
  if (typeof value === 'string') {
    if (value.length > 2000000) invalid('body is too large')
    let encoded = value.trim()
    const fence = encoded.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i)
    if (fence) encoded = fence[1]
    try { value = JSON.parse(encoded) } catch { invalid('body must be valid JSON') }
  }
  const legacy = Array.isArray(value)
  if (!legacy && (!object(value) || value.version !== 1 || value.kind !== kind)) invalid('expected version 1 and the requested kind')
  const entries = legacy ? value : value.items
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_ITEMS) invalid('items must contain 1 to 30 exercises')
  const ids = new Set()
  const items = entries.map((entry, index) => {
    if (!object(entry)) invalid('item must be an object')
    const id = identifier(entry.id ?? (legacy ? kind + '-' + (index + 1) : undefined), 'item.id')
    if (ids.has(id)) invalid('duplicate item ID: ' + id)
    ids.add(id)
    const explanation = text(entry.explanation, 'explanation')
    const fields = kind === 'quiz'
      ? { question: text(entry.question, 'question') }
      : { front: text(entry.front, 'front'), back: text(entry.back, 'back') }
    const choiceText = Array.isArray(entry.choices) ? entry.choices.map(choice => typeof choice === 'string' ? choice : choice?.text) : []
    const citationText = [explanation, ...Object.values(fields), ...choiceText].filter(value => typeof value === 'string').join('\n')
    const labels = [...citationText.matchAll(/\[([^\]\n]{1,128})\](?!\()/g)].map(match => match[1])
    const unknownUuid = labels.find(label => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(label) && !allowed.has(label))
    if (unknownUuid) invalid('citation belongs to another source: ' + unknownUuid)
    const references = entry.sourceIds === undefined && legacy ? labels.filter(label => allowed.has(label)) : entry.sourceIds
    if (!Array.isArray(references) || references.length === 0) invalid('each item requires sourceIds evidence')
    const sourceIds = [...new Set(references.map(value => text(value, 'sourceId')))]
    if (sourceIds.some(sourceId => !allowed.has(sourceId))) invalid('sourceIds must belong to allowed sources')
    if (labels.some(label => allowed.has(label) && !sourceIds.includes(label))) invalid('cited source is missing from sourceIds')
    if (kind === 'flashcards') return { id, ...fields, explanation, sourceIds }
    if (!Array.isArray(entry.choices) || entry.choices.length < 2 || entry.choices.length > 30) invalid('quiz requires 2 to 30 choices')
    const choiceIds = new Set()
    const choiceTexts = new Set()
    const choices = entry.choices.map((choice, choiceIndex) => {
      const choiceId = identifier(typeof choice === 'string' && legacy ? 'choice-' + (choiceIndex + 1) : choice?.id, 'choice.id')
      const choiceText = text(typeof choice === 'string' && legacy ? choice : choice?.text, 'choice.text')
      if (choiceIds.has(choiceId) || choiceTexts.has(choiceText)) invalid('choices must have unique IDs and text')
      choiceIds.add(choiceId); choiceTexts.add(choiceText)
      return { id: choiceId, text: choiceText }
    })
    let answer = entry.answer
    if (legacy && !choiceIds.has(answer)) {
      // Legacy prompts did not define numeric index bases. Only exact choice
      // IDs or complete option text are unambiguous enough to migrate safely.
      if (typeof answer === 'string') answer = choices.find(choice => choice.text === answer.trim())?.id
    }
    if (typeof answer !== 'string' || !choiceIds.has(answer)) invalid('answer must identify one of the choices')
    return { id, ...fields, choices, answer, explanation, sourceIds }
  })
  return { version: 1, kind, items }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('quiz', 'flashcards')),
  mode TEXT NOT NULL CHECK (mode IN ('all', 'mistakes')),
  snapshot TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  queue TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS study_attempts (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  correct INTEGER CHECK (correct IS NULL OR correct IN (0, 1)),
  rating TEXT CHECK (rating IS NULL OR rating IN ('remembered', 'again')),
  submitted_at INTEGER NOT NULL,
  graded_at INTEGER,
  graded_order INTEGER,
  UNIQUE (session_id, item_id)
);
CREATE TABLE IF NOT EXISTS study_requests (
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (notebook_id, request_id)
);
CREATE INDEX IF NOT EXISTS study_sessions_artifact ON study_sessions (notebook_id, artifact_id, created_at);
CREATE INDEX IF NOT EXISTS study_attempts_artifact ON study_attempts (notebook_id, artifact_id, graded_at);
CREATE INDEX IF NOT EXISTS study_attempts_session ON study_attempts (session_id);
`

/** Install additive tables and expose notebook-scoped, synchronous transactions. */
export function createStudyStore(db, { refreshSources }) {
  db.exec(SCHEMA)
  if (!db.prepare('PRAGMA table_info(study_attempts)').all().some(column => column.name === 'graded_order')) {
    db.exec('ALTER TABLE study_attempts ADD COLUMN graded_order INTEGER')
  }
  const stmt = {
    notebook: db.prepare('SELECT id FROM notebooks WHERE id = ?'),
    artifact: db.prepare('SELECT * FROM artifacts WHERE id = ? AND notebook_id = ?'),
    sources: db.prepare('SELECT id, content_hash, enabled, status FROM sources WHERE notebook_id = ?'),
    session: db.prepare('SELECT * FROM study_sessions WHERE id = ? AND notebook_id = ?'),
    latest: db.prepare('SELECT * FROM study_sessions WHERE notebook_id = ? AND artifact_id = ? AND mode = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
    sessions: db.prepare('SELECT * FROM study_sessions WHERE notebook_id = ? AND artifact_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20'),
    insertSession: db.prepare('INSERT INTO study_sessions (id,notebook_id,artifact_id,kind,mode,snapshot,artifact_hash,source_revision,queue,position,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    advance: db.prepare('UPDATE study_sessions SET position = ?, status = ?, updated_at = ? WHERE id = ?'),
    touch: db.prepare('UPDATE study_sessions SET updated_at = ? WHERE id = ?'),
    attempts: db.prepare('SELECT * FROM study_attempts WHERE session_id = ? ORDER BY submitted_at, rowid'),
    attempt: db.prepare('SELECT * FROM study_attempts WHERE session_id = ? AND item_id = ?'),
    insertAttempt: db.prepare('INSERT INTO study_attempts (id,notebook_id,session_id,artifact_id,item_id,answer,correct,rating,submitted_at,graded_at,graded_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
    rate: db.prepare('UPDATE study_attempts SET correct = ?, rating = ?, graded_at = ?, graded_order = ? WHERE id = ? AND graded_at IS NULL'),
    nextGrade: db.prepare('SELECT COALESCE(MAX(graded_order), 0) + 1 AS value FROM study_attempts'),
    history: db.prepare('SELECT a.*, s.snapshot, s.mode FROM study_attempts a JOIN study_sessions s ON s.id = a.session_id WHERE a.notebook_id = ? AND a.artifact_id = ? ORDER BY a.submitted_at DESC, a.rowid DESC LIMIT ?'),
    historyCount: db.prepare('SELECT COUNT(*) AS count FROM study_attempts WHERE notebook_id = ? AND artifact_id = ?'),
    graded: db.prepare('SELECT item_id, correct FROM study_attempts WHERE notebook_id = ? AND artifact_id = ? AND graded_at IS NOT NULL ORDER BY COALESCE(graded_order, 0) DESC, graded_at DESC, rowid DESC'),
    request: db.prepare('SELECT payload FROM study_requests WHERE notebook_id = ? AND request_id = ?'),
    insertRequest: db.prepare('INSERT INTO study_requests (notebook_id,request_id,session_id,payload,created_at) VALUES (?,?,?,?,?)'),
  }

  function requireNotebook(notebookId) {
    if (typeof notebookId !== 'string' || !stmt.notebook.get(notebookId)) throw rejected('notebook not found', 'notebook/not-found')
  }

  function transaction(notebookId, work) {
    requireNotebook(notebookId)
    // File refresh may run its own transaction; finish it before our write lock.
    refreshSources(notebookId)
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function requireSession(notebookId, id) {
    const session = typeof id === 'string' && stmt.session.get(id, notebookId)
    if (!session) throw rejected('study session not found', 'notebook/not-found')
    return session
  }

  function requireArtifact(notebookId, id) {
    const artifact = typeof id === 'string' && stmt.artifact.get(id, notebookId)
    if (!artifact) throw rejected('artifact not found in this notebook', 'notebook/not-found')
    if (artifact.status !== 'done' || !['quiz', 'flashcards'].includes(artifact.kind)) throw rejected('a completed quiz or flashcards artifact is required')
    return artifact
  }

  function sourceRevision(notebookId) {
    return hashText(stmt.sources.all(notebookId).filter(source => source.enabled === 1 && source.status === 'ready').map(source => source.id + ':' + source.content_hash).sort().join('\n'))
  }

  function warningsFor(session) {
    const warnings = []
    if (sourceRevision(session.notebook_id) !== session.source_revision) warnings.push('来源已变化或取消勾选；旧作答保留，请按当前来源重新生成练习后再评分。')
    const artifact = stmt.artifact.get(session.artifact_id, session.notebook_id)
    if (!artifact || artifact.status !== 'done' || hashText(artifact.body) !== session.artifact_hash) warnings.push('练习产物已变化；当前会话仅可查看历史，请重新打开新版练习。')
    return warnings
  }

  function requireCurrentRevision(session) {
    const warnings = warningsFor(session)
    if (warnings.length) throw rejected(warnings.join(' '), 'notebook/study-revision-changed')
  }

  function mistakeIds(notebookId, artifactId) {
    const latest = new Map()
    for (const attempt of stmt.graded.all(notebookId, artifactId)) if (!latest.has(attempt.item_id)) latest.set(attempt.item_id, attempt.correct)
    return [...latest].filter(([, correct]) => correct === 0).map(([id]) => id)
  }

  function publicItem(item, kind) {
    return kind === 'quiz'
      ? { id: item.id, question: item.question, choices: item.choices, sourceIds: item.sourceIds }
      : { id: item.id, front: item.front, sourceIds: item.sourceIds }
  }

  function publicAttempt(attempt, session) {
    if (!attempt) return null
    const snapshot = JSON.parse(session.snapshot)
    const item = snapshot.items.find(item => item.id === attempt.item_id)
    return {
      id: attempt.id, studySessionId: attempt.session_id, mode: session.mode, itemId: attempt.item_id,
      item: publicItem(item, snapshot.kind), answer: attempt.answer,
      submittedAt: attempt.submitted_at, gradedAt: attempt.graded_at,
      correct: attempt.correct === null ? null : attempt.correct === 1,
      rating: attempt.rating, grading: snapshot.kind === 'quiz' ? 'automatic' : 'self-assessment',
      ...(snapshot.kind === 'quiz' ? { correctAnswer: item.answer } : { back: item.back }),
      explanation: item.explanation, sourceIds: item.sourceIds,
    }
  }

  function state(session) {
    const snapshot = JSON.parse(session.snapshot)
    const queue = JSON.parse(session.queue)
    const attempts = stmt.attempts.all(session.id)
    const current = session.status === 'active' ? snapshot.items.find(item => item.id === queue[session.position]) : null
    const currentAttempt = current ? attempts.find(attempt => attempt.item_id === current.id) : null
    const graded = attempts.filter(attempt => attempt.graded_at !== null)
    const correct = graded.filter(attempt => attempt.correct === 1).length
    const warnings = warningsFor(session)
    const mistakes = mistakeIds(session.notebook_id, session.artifact_id)
    return {
      version: 1, studySessionId: session.id, notebookId: session.notebook_id, artifactId: session.artifact_id,
      kind: session.kind, mode: session.mode, status: session.status, completed: session.status === 'completed',
      position: session.position, total: queue.length, answeredCount: attempts.length, gradedCount: graded.length, correctCount: correct,
      score: { graded: graded.length, correct, incorrect: graded.length - correct, selfReported: session.kind === 'flashcards' },
      currentItem: current ? publicItem(current, session.kind) : null,
      currentAttempt: publicAttempt(currentAttempt, session),
      history: stmt.history.all(session.notebook_id, session.artifact_id, HISTORY_LIMIT).reverse().map(attempt => publicAttempt(attempt, attempt)),
      historyTotal: stmt.historyCount.get(session.notebook_id, session.artifact_id).count, historyLimit: HISTORY_LIMIT,
      sessions: stmt.sessions.all(session.notebook_id, session.artifact_id).map(row => ({ studySessionId: row.id, mode: row.mode, status: row.status, position: row.position, total: JSON.parse(row.queue).length, createdAt: row.created_at, updatedAt: row.updated_at })),
      mistakeIds: mistakes, mistakeCount: mistakes.length,
      revisionChanged: warnings.length > 0, warnings,
      canNext: Boolean(currentAttempt && currentAttempt.graded_at !== null && warnings.length === 0),
      createdAt: session.created_at, updatedAt: session.updated_at,
    }
  }

  function currentItem(session, itemId) {
    const queue = JSON.parse(session.queue)
    if (session.status !== 'active' || queue[session.position] !== itemId) throw rejected('item is not the current study item')
    return JSON.parse(session.snapshot).items.find(item => item.id === itemId)
  }

  function requestPayload(action, session, itemId, value, requestId) {
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200) throw rejected('requestId is required (at most 200 characters)')
    return JSON.stringify({ action, studySessionId: session.id, itemId, value })
  }

  function replay(notebookId, requestId, payload) {
    const existing = stmt.request.get(notebookId, requestId)
    if (!existing) return false
    if (existing.payload !== payload) throw rejected('requestId was already used with a different payload', 'notebook/study-request-conflict')
    return true
  }

  return {
    studyOpen(notebookId, { artifactId, mode = 'all', restart = false } = {}) {
      return transaction(notebookId, () => {
        const artifact = requireArtifact(notebookId, artifactId)
        if (!['all', 'mistakes'].includes(mode) || typeof restart !== 'boolean') throw rejected('invalid study mode or restart flag')
        const existing = stmt.latest.get(notebookId, artifactId, mode)
        if (existing && !restart) return state(existing)
        if (sourceRevision(notebookId) !== artifact.source_revision) throw rejected('来源已变化，请重新生成练习后再开始。', 'notebook/study-revision-changed')
        const allowed = stmt.sources.all(notebookId).filter(source => source.enabled === 1 && source.status === 'ready').map(source => source.id)
        const snapshot = normalizeStudyArtifact(artifact.kind, artifact.body, allowed)
        const mistakes = new Set(mistakeIds(notebookId, artifactId))
        const queue = snapshot.items.filter(item => mode === 'all' || mistakes.has(item.id)).map(item => item.id)
        const id = randomUUID(), now = Date.now()
        stmt.insertSession.run(id, notebookId, artifactId, artifact.kind, mode, JSON.stringify(snapshot), hashText(artifact.body), artifact.source_revision, JSON.stringify(queue), 0, queue.length ? 'active' : 'completed', now, now)
        return state(requireSession(notebookId, id))
      })
    },
    studyGet(notebookId, { studySessionId } = {}) {
      return transaction(notebookId, () => state(requireSession(notebookId, studySessionId)))
    },
    studyAnswer(notebookId, { studySessionId, itemId, answer, requestId } = {}) {
      return transaction(notebookId, () => {
        const session = requireSession(notebookId, studySessionId)
        if (typeof answer !== 'string' || answer.length > 20000 || answer.includes('\0')) throw rejected('answer must be text (at most 20000 characters)')
        const payload = requestPayload('answer', session, itemId, answer, requestId)
        if (replay(notebookId, requestId, payload)) return state(session)
        requireCurrentRevision(session)
        const item = currentItem(session, itemId)
        if (stmt.attempt.get(session.id, itemId)) throw rejected('this item was already answered; start a new practice session to retry')
        if (session.kind === 'quiz' && !item.choices.some(choice => choice.id === answer)) throw rejected('answer must be a valid choice ID')
        const now = Date.now()
        stmt.insertAttempt.run(randomUUID(), notebookId, session.id, session.artifact_id, itemId, answer, session.kind === 'quiz' ? Number(answer === item.answer) : null, null, now, session.kind === 'quiz' ? now : null, session.kind === 'quiz' ? stmt.nextGrade.get().value : null)
        stmt.insertRequest.run(notebookId, requestId, session.id, payload, now)
        stmt.touch.run(now, session.id)
        return state(requireSession(notebookId, session.id))
      })
    },
    studyRate(notebookId, { studySessionId, itemId, rating, requestId } = {}) {
      return transaction(notebookId, () => {
        const session = requireSession(notebookId, studySessionId)
        if (!['remembered', 'again'].includes(rating)) throw rejected('rating must be remembered or again')
        const payload = requestPayload('rate', session, itemId, rating, requestId)
        if (replay(notebookId, requestId, payload)) return state(session)
        requireCurrentRevision(session)
        currentItem(session, itemId)
        if (session.kind !== 'flashcards') throw rejected('self-assessment is only available for flashcards')
        const attempt = stmt.attempt.get(session.id, itemId)
        if (!attempt) throw rejected('submit your recall before viewing and rating the card')
        if (attempt.graded_at !== null) throw rejected('this card was already rated; start a new practice session to retry')
        const now = Date.now()
        stmt.rate.run(Number(rating === 'remembered'), rating, now, stmt.nextGrade.get().value, attempt.id)
        stmt.insertRequest.run(notebookId, requestId, session.id, payload, now)
        stmt.touch.run(now, session.id)
        return state(requireSession(notebookId, session.id))
      })
    },
    studyNext(notebookId, { studySessionId, itemId } = {}) {
      return transaction(notebookId, () => {
        const session = requireSession(notebookId, studySessionId)
        const queue = JSON.parse(session.queue)
        if (typeof itemId !== 'string' || !queue.includes(itemId)) throw rejected('a valid itemId is required to advance')
        // A delayed/double-clicked Next for an earlier item cannot skip a new one.
        if (queue.indexOf(itemId) < session.position) return state(session)
        requireCurrentRevision(session)
        currentItem(session, itemId)
        const attempt = stmt.attempt.get(session.id, itemId)
        if (!attempt || attempt.graded_at === null) throw rejected('complete the current question or self-assessment before continuing')
        const position = session.position + 1
        stmt.advance.run(position, position >= queue.length ? 'completed' : 'active', Date.now(), session.id)
        return state(requireSession(notebookId, session.id))
      })
    },
  }
}
