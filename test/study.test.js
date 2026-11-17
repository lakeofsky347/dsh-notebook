import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { openLibrary } from '../src/library.js'
import { normalizeStudyArtifact } from '../src/study.js'

const limits = { maxNotebooks: 10, maxSourcesPerNotebook: 10, maxWordsPerSource: 10000,
  maxUploadBytes: 100000, chunkChars: 200, chunkOverlap: 20, topK: 5, maxInjectChars: 4000,
  urlTimeoutMs: 100, maxUrlBytes: 100000 }

function quiz(sourceId = 'source-1', count = 2) {
  return { version: 1, kind: 'quiz', items: Array.from({ length: count }, (_, i) => ({
    id: 'q' + (i + 1), question: 'Question ' + (i + 1),
    choices: [{ id: 'yes', text: 'Correct choice' }, { id: 'no', text: 'Wrong choice' }],
    answer: 'yes', explanation: 'The saved source supports this answer.', sourceIds: [sourceId],
  })) }
}

function cards(sourceId = 'source-1', count = 2) {
  return { version: 1, kind: 'flashcards', items: Array.from({ length: count }, (_, i) => ({
    id: 'c' + (i + 1), front: 'Recall ' + (i + 1), back: 'Saved answer ' + (i + 1),
    explanation: 'An explanation grounded in the source.', sourceIds: [sourceId],
  })) }
}

function fixture(t, kind = 'quiz', count = 2) {
  const dir = mkdtempSync(join(tmpdir(), 'notebook-study-'))
  const file = join(dir, 'library.sqlite')
  let library = openLibrary(file, limits)
  const notebook = library.createNotebook({ title: 'Practice' })
  const source = library.saveNote(notebook.id, { title: 'Evidence', body: 'This is the stored evidence for these exercises.' })
  const artifact = library.createArtifact(notebook.id, { kind })
  const body = kind === 'quiz' ? quiz(source.id, count) : cards(source.id, count)
  library.finishArtifact(artifact.id, 'done', JSON.stringify(body))
  t.after(() => { library.close(); rmSync(dir, { recursive: true, force: true }) })
  return { dir, file, notebookId: notebook.id, sourceId: source.id, artifactId: artifact.id, body,
    get library() { return library },
    reopen() { library.close(); library = openLibrary(file, limits); return library },
  }
}

function answer(f, state, value = 'yes', requestId = 'answer-' + state.studySessionId + '-' + state.currentItem.id) {
  return f.library.studyAnswer(f.notebookId, { studySessionId: state.studySessionId, itemId: state.currentItem.id, answer: value, requestId })
}

function next(f, state, itemId = state.currentItem.id) {
  return f.library.studyNext(f.notebookId, { studySessionId: state.studySessionId, itemId })
}

test('canonical study artifacts validate and normalize without mutating input', () => {
  const input = quiz()
  const copy = structuredClone(input)
  assert.deepEqual(normalizeStudyArtifact('quiz', JSON.stringify(input), new Set(['source-1'])), input)
  assert.deepEqual(normalizeStudyArtifact('flashcards', cards(), ['source-1']), cards())
  assert.deepEqual(input, copy)
})

test('legacy arrays require evidence and explanations and migrate only unambiguous string answers', () => {
  const old = [{ question: 'Choose', choices: ['Red', 'Blue'], answer: 'Blue', explanation: 'Blue is supported [source-1].' }]
  const result = normalizeStudyArtifact('quiz', '```json\n' + JSON.stringify(old) + '\n```', ['source-1'])
  assert.equal(result.items[0].id, 'quiz-1')
  assert.equal(result.items[0].answer, 'choice-2')
  assert.deepEqual(result.items[0].sourceIds, ['source-1'])
  for (const ambiguous of [0, 1, 2, 'B', '2']) assert.throws(() => normalizeStudyArtifact('quiz', [{ ...old[0], answer: ambiguous }], ['source-1']), /answer/)
  assert.throws(() => normalizeStudyArtifact('quiz', [{ ...old[0], explanation: undefined }], ['source-1']), /explanation/)
  assert.throws(() => normalizeStudyArtifact('quiz', [{ ...old[0], explanation: 'No supporting citation.' }], ['source-1']), /evidence/)
  const card = normalizeStudyArtifact('flashcards', [{ front: 'Recall', back: 'Back [source-1]', explanation: 'Why this answer follows.' }], ['source-1'])
  assert.equal(card.items[0].id, 'flashcards-1')
})

test('normalizer rejects bad versions, missing fields, duplicate IDs, invalid answers and unrelated citations', () => {
  const mutate = change => { const data = quiz(); change(data); return data }
  const invalid = [
    mutate(data => { data.version = 2 }), mutate(data => { data.kind = 'flashcards' }),
    mutate(data => { data.items = [] }), mutate(data => { delete data.items[0].id }),
    mutate(data => { data.items[1].id = data.items[0].id }),
    mutate(data => { data.items[0].question = ' ' }), mutate(data => { data.items[0].explanation = '' }),
    mutate(data => { data.items[0].choices[1].id = 'yes' }),
    mutate(data => { data.items[0].choices[1].text = 'Correct choice' }),
    mutate(data => { data.items[0].choices = ['Red', 'Blue'] }),
    mutate(data => { data.items[0].answer = 'missing' }),
    mutate(data => { data.items[0].sourceIds = [] }),
    mutate(data => { data.items[0].sourceIds = ['other-notebook-source'] }),
    mutate(data => { data.items[0].explanation += ' [00000000-0000-0000-0000-000000000000]' }),
  ]
  for (const input of invalid) assert.throws(() => normalizeStudyArtifact('quiz', input, ['source-1']), { code: 'notebook/invalid-study-artifact' })
  assert.throws(() => normalizeStudyArtifact('quiz', '{broken', ['source-1']), /valid JSON/)
  assert.throws(() => normalizeStudyArtifact('quiz', quiz('source-1', 31), ['source-1']), /1 to 30/)
  assert.equal(normalizeStudyArtifact('quiz', quiz('source-1', 30), ['source-1']).items.length, 30)
  assert.throws(() => normalizeStudyArtifact('flashcards', { ...cards(), items: [{ ...cards().items[0], back: '' }] }, ['source-1']), /back/)
})

test('opening a quiz hides answers and persists its queue before any response', t => {
  const f = fixture(t)
  const state = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  assert.equal(state.total, 2)
  assert.equal(state.currentItem.id, 'q1')
  assert.equal(state.currentAttempt, null)
  assert.equal(state.history.length, 0)
  assert.equal(state.currentItem.answer, undefined)
  assert.equal(state.currentItem.explanation, undefined)
  assert.equal(state.canNext, false)
  const reader = new DatabaseSync(f.file, { readOnly: true })
  assert.equal(reader.prepare('SELECT COUNT(*) AS n FROM study_sessions').get().n, 1)
  reader.close()
  assert.equal(f.library.studyOpen(f.notebookId, { artifactId: f.artifactId }).studySessionId, state.studySessionId)
})

test('quiz answers commit once, reveal evidence and reject overwrite or request payload conflicts', t => {
  const f = fixture(t)
  const initial = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  const result = answer(f, initial, 'no', 'request-1')
  assert.equal(result.currentAttempt.correct, false)
  assert.equal(result.currentAttempt.correctAnswer, 'yes')
  assert.equal(result.currentAttempt.grading, 'automatic')
  assert.equal(result.currentAttempt.item.question, 'Question 1')
  assert.deepEqual(result.currentAttempt.sourceIds, [f.sourceId])
  assert.equal(result.canNext, true)
  assert.equal(result.mistakeCount, 1)
  const reader = new DatabaseSync(f.file, { readOnly: true })
  assert.equal(reader.prepare('SELECT answer FROM study_attempts').get().answer, 'no')
  assert.equal(reader.prepare('SELECT snapshot FROM study_sessions').get().snapshot.includes(result.currentAttempt.explanation), true)
  reader.close()
  assert.deepEqual(answer(f, initial, 'no', 'request-1'), result)
  assert.throws(() => answer(f, initial, 'yes', 'request-1'), { code: 'notebook/study-request-conflict' })
  assert.throws(() => answer(f, initial, 'yes', 'request-2'), /already answered/)
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: initial.studySessionId }).answeredCount, 1)
})

test('invalid and out-of-order requests are atomic and Next cannot skip or double-advance', t => {
  const f = fixture(t)
  let state = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  assert.throws(() => next(f, state), /complete/)
  assert.throws(() => answer(f, state, 'unknown', 'retryable-id'), /valid choice/)
  assert.throws(() => f.library.studyAnswer(f.notebookId, { studySessionId: state.studySessionId, itemId: 'q2', answer: 'yes', requestId: 'future' }), /current/)
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }).history.length, 0)
  state = answer(f, state, 'yes', 'retryable-id')
  state = next(f, state)
  assert.equal(state.currentItem.id, 'q2')
  assert.equal(next(f, state, 'q1').currentItem.id, 'q2')
  assert.throws(() => next(f, state), /complete/)
  assert.throws(() => f.library.studyNext(f.notebookId, { studySessionId: state.studySessionId }), /itemId/)
  state = answer(f, state)
  state = next(f, state)
  assert.equal(state.completed, true)
  assert.equal(state.position, state.total)
  assert.equal(state.currentItem, null)
  assert.equal(next(f, state, 'q2').completed, true)
  assert.equal(f.library.studyOpen(f.notebookId, { artifactId: f.artifactId }).studySessionId, state.studySessionId)
})

test('sessions, answers, explanations, idempotency and progress survive database reopen', t => {
  const f = fixture(t)
  let state = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  state = answer(f, state, 'yes', 'persisted-answer')
  const saved = structuredClone(state)
  f.reopen()
  assert.deepEqual(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }), saved)
  state = next(f, state)
  f.reopen()
  const resumed = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  assert.equal(resumed.currentItem.id, 'q2')
  const replay = f.library.studyAnswer(f.notebookId, { studySessionId: state.studySessionId, itemId: 'q1', answer: 'yes', requestId: 'persisted-answer' })
  assert.equal(replay.currentItem.id, 'q2')
  assert.equal(replay.history.length, 1)
})

test('flashcards save recall before revealing and only explicit self-assessment grades them', t => {
  const f = fixture(t, 'flashcards')
  let state = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  assert.equal(state.currentItem.back, undefined)
  assert.equal(state.currentItem.explanation, undefined)
  assert.throws(() => f.library.studyRate(f.notebookId, { studySessionId: state.studySessionId, itemId: 'c1', rating: 'remembered', requestId: 'rate-early' }), /submit your recall/)
  state = answer(f, state, '', 'empty-recall')
  assert.equal(state.currentAttempt.answer, '')
  assert.equal(state.currentAttempt.back, 'Saved answer 1')
  assert.equal(state.currentAttempt.correct, null)
  assert.equal(state.currentAttempt.gradedAt, null)
  assert.equal(state.currentAttempt.grading, 'self-assessment')
  assert.equal(state.gradedCount, 0)
  assert.equal(state.mistakeCount, 0)
  assert.equal(state.score.selfReported, true)
  assert.throws(() => next(f, state), /self-assessment/)
  f.reopen()
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }).currentAttempt.correct, null)
  const request = { studySessionId: state.studySessionId, itemId: 'c1', rating: 'again', requestId: 'rate-1' }
  state = f.library.studyRate(f.notebookId, request)
  assert.equal(state.currentAttempt.correct, false)
  assert.equal(state.currentAttempt.rating, 'again')
  assert.equal(state.mistakeCount, 1)
  assert.equal(state.canNext, true)
  assert.deepEqual(f.library.studyRate(f.notebookId, request), state)
  assert.throws(() => f.library.studyRate(f.notebookId, { ...request, rating: 'remembered' }), { code: 'notebook/study-request-conflict' })
  assert.throws(() => f.library.studyRate(f.notebookId, { ...request, rating: 'remembered', requestId: 'rate-2' }), /already rated/)
})

test('mistakes use the latest graded result and a successful retry removes the item without losing history', t => {
  const f = fixture(t)
  const initial = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  answer(f, initial, 'no')
  const retry = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, mode: 'mistakes' })
  assert.equal(retry.total, 1)
  assert.equal(retry.currentItem.id, 'q1')
  assert.equal(retry.currentAttempt, null)
  assert.equal(retry.history[0].studySessionId, initial.studySessionId)
  const correct = answer(f, retry, 'yes')
  assert.equal(correct.mistakeCount, 0)
  assert.equal(correct.correctCount, 1)
  assert.equal(correct.history.length, 2)
  assert.equal(correct.historyTotal, 2)
  assert.equal(correct.sessions.length, 2)
  const empty = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, mode: 'mistakes', restart: true })
  assert.equal(empty.total, 0)
  assert.equal(empty.completed, true)
  assert.equal(empty.currentItem, null)
  assert.equal(empty.history.length, 2)
  const restarted = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, restart: true })
  assert.notEqual(restarted.studySessionId, initial.studySessionId)
  assert.equal(restarted.history.length, 2)
  assert.equal(restarted.answeredCount, 0)
})

test('merely revealing a retry flashcard does not clear a previous mistake', t => {
  const f = fixture(t, 'flashcards', 1)
  let initial = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  initial = answer(f, initial, 'Not sure')
  f.library.studyRate(f.notebookId, { studySessionId: initial.studySessionId, itemId: 'c1', rating: 'again', requestId: 'initial-rate' })
  let retry = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, mode: 'mistakes' })
  retry = answer(f, retry, 'I think I remember')
  assert.equal(retry.mistakeCount, 1)
  assert.equal(retry.gradedCount, 0)
  retry = f.library.studyRate(f.notebookId, { studySessionId: retry.studySessionId, itemId: 'c1', rating: 'remembered', requestId: 'retry-rate' })
  assert.equal(retry.mistakeCount, 0)
  assert.equal(retry.score.selfReported, true)
})

test('latest grade ordering remains correct for overlapping flashcard sessions within one millisecond', t => {
  t.mock.method(Date, 'now', () => 1800000000000)
  const f = fixture(t, 'flashcards', 1)
  let older = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  older = answer(f, older, 'Recall from old session')
  let newer = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, restart: true })
  newer = answer(f, newer, 'Recall from new session')
  f.library.studyRate(f.notebookId, { studySessionId: newer.studySessionId, itemId: 'c1', rating: 'remembered', requestId: 'newer-first' })
  const last = f.library.studyRate(f.notebookId, { studySessionId: older.studySessionId, itemId: 'c1', rating: 'again', requestId: 'older-last' })
  assert.deepEqual(last.mistakeIds, ['c1'])
  f.reopen()
  assert.equal(f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, mode: 'mistakes' }).total, 1)
})

test('notebook and artifact boundaries isolate sessions, mistakes, answers and request IDs', t => {
  const f = fixture(t)
  const other = f.library.createNotebook({ title: 'Other notebook' })
  const first = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  assert.throws(() => f.library.studyOpen(other.id, { artifactId: f.artifactId }), { code: 'notebook/not-found' })
  assert.throws(() => f.library.studyGet(other.id, { studySessionId: first.studySessionId }), { code: 'notebook/not-found' })
  assert.throws(() => f.library.studyAnswer(other.id, { studySessionId: first.studySessionId, itemId: 'q1', answer: 'yes', requestId: 'wrong-scope' }), { code: 'notebook/not-found' })
  answer(f, first, 'no', 'shared-request')
  const another = f.library.createArtifact(f.notebookId, { kind: 'quiz' })
  f.library.finishArtifact(another.id, 'done', JSON.stringify(f.body))
  const empty = f.library.studyOpen(f.notebookId, { artifactId: another.id, mode: 'mistakes' })
  assert.equal(empty.mistakeCount, 0)
  assert.equal(empty.history.length, 0)
  const retry = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, restart: true })
  assert.throws(() => answer(f, retry, 'no', 'shared-request'), { code: 'notebook/study-request-conflict' })
})

test('changed or disabled sources block new grading but retain old completed sessions and explanations', t => {
  const f = fixture(t, 'quiz', 1)
  let state = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  state = answer(f, state)
  state = next(f, state)
  f.library.saveNote(f.notebookId, { id: f.sourceId, body: 'Revised source changes the original evidence.' })
  f.reopen()
  const stale = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  assert.equal(stale.studySessionId, state.studySessionId)
  assert.equal(stale.completed, true)
  assert.equal(stale.revisionChanged, true)
  assert.equal(stale.history[0].explanation, f.body.items[0].explanation)
  assert.throws(() => f.library.studyOpen(f.notebookId, { artifactId: f.artifactId, restart: true }), { code: 'notebook/study-revision-changed' })
})

test('source disable/delete and artifact tampering never silently grade stale exercises', t => {
  const f = fixture(t, 'flashcards')
  let state = f.library.studyOpen(f.notebookId, { artifactId: f.artifactId })
  state = answer(f, state, 'Recall')
  f.library.setSources(f.notebookId, [{ id: f.sourceId, enabled: false }])
  assert.throws(() => f.library.studyRate(f.notebookId, { studySessionId: state.studySessionId, itemId: 'c1', rating: 'remembered', requestId: 'stale-rate' }), { code: 'notebook/study-revision-changed' })
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }).gradedCount, 0)
  f.library.setSources(f.notebookId, [{ id: f.sourceId, enabled: true }])
  const raw = new DatabaseSync(f.file)
  raw.prepare('UPDATE artifacts SET body = ? WHERE id = ?').run(JSON.stringify(cards(f.sourceId, 1)), f.artifactId)
  raw.close()
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }).revisionChanged, true)
  assert.throws(() => f.library.studyRate(f.notebookId, { studySessionId: state.studySessionId, itemId: 'c1', rating: 'again', requestId: 'changed-artifact' }), { code: 'notebook/study-revision-changed' })
  f.library.deleteSource(f.notebookId, f.sourceId)
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }).history[0].back, 'Saved answer 1')
})

test('file evidence refresh is detected without nested transactions', t => {
  const f = fixture(t)
  const path = join(f.dir, 'reference.txt')
  writeFileSync(path, 'Original file evidence.')
  const source = f.library.addFile(f.notebookId, path)
  const artifact = f.library.createArtifact(f.notebookId, { kind: 'quiz' })
  f.library.finishArtifact(artifact.id, 'done', JSON.stringify(quiz(source.id, 1)))
  const state = f.library.studyOpen(f.notebookId, { artifactId: artifact.id })
  writeFileSync(path, 'Revised and longer file evidence.')
  assert.equal(f.library.studyGet(f.notebookId, { studySessionId: state.studySessionId }).revisionChanged, true)
})

test('invalid or unfinished artifacts do not create sessions and unknown sources are rejected', t => {
  const f = fixture(t)
  const pending = f.library.createArtifact(f.notebookId, { kind: 'quiz' })
  assert.throws(() => f.library.studyOpen(f.notebookId, { artifactId: pending.id }), /completed/)
  f.library.finishArtifact(pending.id, 'done', JSON.stringify(quiz('not-in-this-notebook')))
  assert.throws(() => f.library.studyOpen(f.notebookId, { artifactId: pending.id }), { code: 'notebook/invalid-study-artifact' })
  const report = f.library.createArtifact(f.notebookId, { kind: 'report' })
  f.library.finishArtifact(report.id, 'done', 'A report')
  assert.throws(() => f.library.studyOpen(f.notebookId, { artifactId: report.id }), /quiz or flashcards/)
  const raw = new DatabaseSync(f.file, { readOnly: true })
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM study_sessions').get().n, 0)
  raw.close()
})

test('additive study migration preserves an existing library and its artifacts', t => {
  const f = fixture(t)
  const raw = new DatabaseSync(f.file)
  raw.exec('DROP TABLE study_requests; DROP TABLE study_attempts; DROP TABLE study_sessions')
  raw.close()
  f.reopen()
  assert.equal(f.library.getNotebook(f.notebookId).title, 'Practice')
  assert.equal(f.library.getSource(f.notebookId, f.sourceId).body, 'This is the stored evidence for these exercises.')
  assert.equal(f.library.getArtifact(f.artifactId).body, JSON.stringify(f.body))
  assert.equal(f.library.studyOpen(f.notebookId, { artifactId: f.artifactId }).total, 2)
  f.reopen()
  assert.equal(f.library.studyOpen(f.notebookId, { artifactId: f.artifactId }).total, 2)
})
