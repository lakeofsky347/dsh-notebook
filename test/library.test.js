import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openLibrary } from '../src/library.js'
import { rankChunks, renderContext } from '../src/text.js'

const limits = {
  maxNotebooks: 2,
  maxSourcesPerNotebook: 2,
  maxWordsPerSource: 20,
  maxUploadBytes: 200,
  chunkChars: 40,
  chunkOverlap: 10,
  topK: 2,
  maxInjectChars: 120,
  urlTimeoutMs: 50,
  maxUrlBytes: 100,
}

function tempLib() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-notebook-'))
  const library = openLibrary(join(dir, 'library.sqlite'), limits)
  return { dir, library }
}

test('notebooks do not share sources', () => {
  const { dir, library } = tempLib()
  try {
    const left = library.createNotebook({ title: 'Left' })
    const right = library.createNotebook({ title: 'Right' })
    library.addText(left.id, 'Alpha', 'alpha supply demand curve')
    assert.equal(library.listSources(right.id).length, 0)
    assert.equal(library.search(right.id, 'supply').length, 0)
    assert.equal(library.search(left.id, 'supply').length, 1)
    assert.throws(() => library.createNotebook({ title: 'Third' }), /notebook limit/)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rejects oversized text and non-text files', () => {
  const { dir, library } = tempLib()
  const pdf = join(dir, 'notes.pdf')
  writeFileSync(pdf, 'not really a pdf')
  try {
    const notebook = library.createNotebook({ title: 'Limits' })
    assert.throws(() => library.addText(notebook.id, 'Big', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one'), /word limit/)
    assert.throws(() => library.addFile(notebook.id, pdf), /utf-8 text/)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing files become inactive and drop out of search', () => {
  const { dir, library } = tempLib()
  const file = join(dir, 'note.md')
  writeFileSync(file, 'photosynthesis converts light into sugar inside leaves')
  try {
    const notebook = library.createNotebook({ title: 'Files' })
    library.addFile(notebook.id, file)
    assert.equal(library.search(notebook.id, 'sugar')[0].title, 'note.md')
    rmSync(file)
    assert.equal(library.search(notebook.id, 'sugar').length, 0)
    assert.equal(library.listSources(notebook.id)[0].status, 'inactive')
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bm25 ranks the matching passage first and render truncates', () => {
  const chunks = [
    { sourceId: 'a', title: 'A', ordinal: 0, text: 'the river delta floods every spring' },
    { sourceId: 'b', title: 'B', ordinal: 1, text: 'supply and demand set the market price' },
  ]
  const ranked = rankChunks(chunks, 'market price demand', 2)
  assert.equal(ranked[0].sourceId, 'b')
  const rendered = renderContext({
    title: 'Econ',
    instructions: 'be brief',
    style: 'default',
    grounding: 'sources-only',
  }, ranked, 80)
  assert.match(rendered, /sources-only/)
  assert.match(rendered, /truncated|sourceId=b/)
})

test('artifact revision stays at generation time', () => {
  const { dir, library } = tempLib()
  try {
    const notebook = library.createNotebook({ title: 'Rev' })
    const source = library.saveNote(notebook.id, { title: 'Note', body: 'original passage about copper' })
    const artifact = library.createArtifact(notebook.id, { kind: 'report', title: 'Report', prompt: 'summarize' })
    library.saveNote(notebook.id, { id: source.id, title: 'Note', body: 'rewritten passage about tin' })
    const stored = library.getArtifact(artifact.id)
    assert.equal(stored.source_revision, artifact.source_revision)
    assert.notEqual(library.sourceRevision(notebook.id), artifact.source_revision)
    library.finishArtifact(artifact.id, 'done', 'body')
    assert.equal(library.getArtifact(artifact.id).body, 'body')
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unchecked sources are not retrieved', () => {
  const { dir, library } = tempLib()
  try {
    const notebook = library.createNotebook({ title: 'Pick' })
    const source = library.addText(notebook.id, 'Hidden', 'secret tungsten alloy')
    library.setSources(notebook.id, [{ id: source.id, enabled: false }])
    assert.equal(library.search(notebook.id, 'tungsten').length, 0)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
