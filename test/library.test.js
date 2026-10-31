import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

function tempLib(deps = {}, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-notebook-'))
  const library = openLibrary(join(dir, 'library.sqlite'), { ...limits, ...overrides }, deps)
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
    assert.equal(library.overview(notebook.id).length, 0)
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
  }, ranked, 400)
  assert.match(rendered, /sources-only/)
  assert.match(rendered, /truncated|sourceId=b/)
  assert.ok(rendered.length <= 400)
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

test('Chinese terms and mixed English text retrieve the matching passage', () => {
  const chunks = [
    { sourceId: 'weather', title: '天气', ordinal: 0, text: '阳光照射后，气温会升高。' },
    { sourceId: 'plants', title: '植物', ordinal: 1, text: '光合作用将光能转化为糖，photosynthesis supports plant growth。' },
  ]
  assert.equal(rankChunks(chunks, '光合作用', 2)[0].sourceId, 'plants')
  assert.equal(rankChunks(chunks, 'PHOTOSYNTHESIS', 2)[0].sourceId, 'plants')
  assert.equal(rankChunks(chunks, '光合作用 photosynthesis', 2)[0].sourceId, 'plants')
})

test('editing a note enforces the same byte limit as creating it', () => {
  const { dir, library } = tempLib()
  try {
    const notebook = library.createNotebook({ title: 'Notes' })
    const source = library.saveNote(notebook.id, { title: 'Original', body: 'copper' })
    assert.throws(() => library.saveNote(notebook.id, { id: source.id, body: '中'.repeat(100) }), /byte limit/)
    assert.equal(library.getSource(notebook.id, source.id).body, 'copper')
    assert.equal(library.search(notebook.id, 'copper').length, 1)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a repaired file recovers from an error and rebuilds its search content', () => {
  let body = 'original copper'
  let mtimeMs = 1
  const { dir, library } = tempLib({
    stat: () => ({ mtimeMs, isFile: () => true }),
    readFile: () => Buffer.from(body),
  })
  try {
    const notebook = library.createNotebook({ title: 'Recover' })
    const source = library.addFile(notebook.id, '/virtual/source.md')
    body = '\0'
    mtimeMs = 2
    assert.equal(library.search(notebook.id, 'copper').length, 0)
    assert.equal(library.getSource(notebook.id, source.id).status, 'error')
    body = 'repaired tungsten'
    mtimeMs = 3
    const fresh = library.getSource(notebook.id, source.id)
    assert.equal(fresh.status, 'ready')
    assert.equal(fresh.error, '')
    assert.equal(fresh.body, body)
    assert.equal(library.search(notebook.id, 'tungsten').length, 1)
    assert.equal(library.search(notebook.id, 'copper').length, 0)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('source management respects notebook ownership and deletes stored chunks', () => {
  const { dir, library } = tempLib()
  try {
    const notebook = library.createNotebook({ title: 'Owner' })
    const other = library.createNotebook({ title: 'Other' })
    const source = library.addText(notebook.id, 'Before', 'searchable copper')
    assert.equal(library.getSource(notebook.id, source.id).body, 'searchable copper')
    assert.equal(library.getSource(other.id, source.id), null)
    assert.throws(() => library.renameSource(other.id, source.id, 'No'), /source not found/)
    assert.throws(() => library.deleteSource(other.id, source.id), /source not found/)
    assert.throws(() => library.renameSource(notebook.id, source.id, '  '), /title is required/)
    assert.equal(library.renameSource(notebook.id, source.id, ' After ').title, 'After')
    assert.equal(library.search(notebook.id, 'copper')[0].title, 'After')
    const revision = library.sourceRevision(notebook.id)
    assert.deepEqual(library.deleteSource(notebook.id, source.id), { id: source.id, notebookId: notebook.id, deleted: true })
    assert.equal(library.getSource(notebook.id, source.id), null)
    assert.equal(library.search(notebook.id, 'copper').length, 0)
    assert.notEqual(library.sourceRevision(notebook.id), revision)
    const db = new DatabaseSync(library.file)
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?').get(source.id).n, 0)
    } finally { db.close() }
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('overview samples enabled sources round-robin without a search query', () => {
  const { dir, library } = tempLib()
  try {
    const notebook = library.createNotebook({ title: 'Overview' })
    const left = library.addText(notebook.id, 'Left', 'copper paragraph\n\niron paragraph\n\ntin paragraph')
    const right = library.addText(notebook.id, 'Right', 'plants paragraph\n\nweather paragraph')
    const passages = library.overview(notebook.id, 4)
    assert.deepEqual(passages.map(row => row.sourceId), [left.id, right.id, left.id, right.id])
    assert.deepEqual(passages.map(row => row.ordinal), [0, 0, 1, 1])
    assert.equal(passages[0].title, 'Left')
    assert.equal(passages[0].text, 'copper paragraph')
    assert.deepEqual(JSON.parse(passages[0].locator), { ordinal: 0, chars: 16 })
    assert.equal(library.overview(notebook.id).length, limits.topK)
    library.setSources(notebook.id, [{ id: right.id, enabled: false }])
    assert.deepEqual(library.overview(notebook.id, 10).map(row => row.sourceId), [left.id, left.id, left.id])
    assert.deepEqual(library.overview(notebook.id, 0), [])
    assert.throws(() => library.overview('missing'), /notebook not found/)
    assert.throws(() => library.overview(notebook.id, -1), /non-negative integer/)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('renderContext enforces the total character budget and prioritizes grounding rules', () => {
  const notebook = { title: 'title'.repeat(200), instructions: 'instruction'.repeat(200), style: 'default', grounding: 'sources-only' }
  const passages = [{ sourceId: 'source', title: 'Source', ordinal: 0, text: 'passage'.repeat(200) }]
  for (const budget of [0, 1, 2, 20, 80, 200, 201, 500, 501, 4096]) {
    const rendered = renderContext(notebook, passages, budget)
    assert.ok(rendered.length <= budget, 'budget ' + budget)
    if (budget >= 20) assert.ok(rendered.startsWith('Grounding: sources-'))
  }
  const short = renderContext(notebook, passages, 200)
  assert.match(short, /Answer only from the passages below/)
  assert.match(short, /Do not use outside knowledge/)
  assert.doesNotMatch(short, /title/)
  assert.equal(renderContext(notebook, [], 0), '')
  assert.ok(renderContext(notebook, [], 80).length <= 80)
  const full = renderContext({ ...notebook, title: 'Short', instructions: '' }, [{ ...passages[0], text: 'copper evidence' }], 1000)
  assert.match(full, /\[1\] sourceId=source title=Source chunk=0\ncopper evidence/)
})

test('local files exceeding stat.size are rejected before reading and can recover later', () => {
  let size = limits.maxUploadBytes + 1
  let mtimeMs = 1
  let reads = 0
  const { dir, library } = tempLib({
    stat: () => ({ size, mtimeMs, isFile: () => true }),
    readFile: () => { reads += 1; return Buffer.from('copper') },
  })
  try {
    const notebook = library.createNotebook({ title: 'Preflight' })
    assert.throws(() => library.addFile(notebook.id, '/virtual/source.md'), /byte limit/)
    assert.equal(reads, 0)
    size = 6
    const source = library.addFile(notebook.id, '/virtual/source.md')
    assert.equal(reads, 1)
    size = limits.maxUploadBytes + 1
    mtimeMs = 2
    assert.equal(library.getSource(notebook.id, source.id).status, 'error')
    assert.equal(reads, 1)
    assert.equal(library.overview(notebook.id).length, 0)
    size = 6
    mtimeMs = 3
    assert.equal(library.getSource(notebook.id, source.id).status, 'ready')
    assert.equal(reads, 2)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('URL reader stops and cancels as soon as streamed bytes exceed the limit', async () => {
  let reads = 0
  let canceled = false
  let released = false
  let signal
  const { dir, library } = tempLib({
    fetch: async (_url, options) => {
      signal = options.signal
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: { getReader: () => ({
          read: async () => { reads += 1; return { done: false, value: Buffer.alloc(60, 'a') } },
          cancel: async () => { canceled = true },
          releaseLock: () => { released = true },
        }) },
      }
    },
  })
  try {
    const notebook = library.createNotebook({ title: 'URL' })
    await assert.rejects(library.addUrl(notebook.id, 'https://example.test/large'), /download limit/)
    assert.equal(reads, 2)
    assert.equal(canceled, true)
    assert.equal(released, true)
    assert.equal(signal.aborted, true)
    assert.deepEqual(library.listSources(notebook.id), [])
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('URL async iterators close early when their byte limit is exceeded', async () => {
  let reads = 0
  let closed = false
  async function* body() {
    try {
      for (let index = 0; index < 3; index += 1) {
        reads += 1
        yield Buffer.alloc(60, 'a')
      }
    } finally { closed = true }
  }
  const { dir, library } = tempLib({ fetch: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/plain' }), body: body() }) })
  try {
    const notebook = library.createNotebook({ title: 'Iterator' })
    await assert.rejects(library.addUrl(notebook.id, 'https://example.test/large'), /download limit/)
    assert.equal(reads, 2)
    assert.equal(closed, true)
    assert.deepEqual(library.listSources(notebook.id), [])
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('URL streaming preserves split UTF-8 sequences and supports arrayBuffer fallback', async () => {
  let fetches = 0
  const bytes = Buffer.from('中文 copper')
  const { dir, library } = tempLib({
    fetch: async () => {
      fetches += 1
      const response = { ok: true, headers: new Headers({ 'content-type': 'text/plain' }) }
      if (fetches === 1) {
        response.body = new ReadableStream({ start(controller) {
          controller.enqueue(bytes.subarray(0, 1))
          controller.enqueue(bytes.subarray(1))
          controller.close()
        } })
      } else response.arrayBuffer = async () => bytes
      return response
    },
  })
  try {
    const notebook = library.createNotebook({ title: 'UTF-8' })
    const streamed = await library.addUrl(notebook.id, 'https://example.test/stream')
    const fallback = await library.addUrl(notebook.id, 'https://example.test/fallback')
    assert.equal(library.getSource(notebook.id, streamed.id).body, bytes.toString('utf8'))
    assert.equal(library.getSource(notebook.id, fallback.id).body, bytes.toString('utf8'))
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('URL declared size is checked before reading and fallback buffers are still validated', async () => {
  let reads = 0
  let declared = true
  const { dir, library } = tempLib({
    fetch: async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain', ...(declared ? { 'content-length': '101' } : {}) }),
      arrayBuffer: async () => { reads += 1; return Buffer.alloc(101, 'a') },
    }),
  })
  try {
    const notebook = library.createNotebook({ title: 'Size' })
    await assert.rejects(library.addUrl(notebook.id, 'https://example.test/declared'), /download limit/)
    assert.equal(reads, 0)
    declared = false
    await assert.rejects(library.addUrl(notebook.id, 'https://example.test/buffered'), /download limit/)
    assert.equal(reads, 1)
    assert.deepEqual(library.listSources(notebook.id), [])
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('URL HTML imports save its title and readable text while preserving the source URL', async () => {
  const html = '<!doctype html><html><head><title>Copper &amp; plants</title><style>.secret-style{}</style></head><body><main><h1>光合作用</h1><p>Plants convert light into sugar.</p><script>secret_script_token()</script></main></body></html>'
  const { dir, library } = tempLib({
    fetch: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
  }, { maxUrlBytes: 1000, maxUploadBytes: 1000 })
  try {
    const notebook = library.createNotebook({ title: 'Web' })
    const url = 'https://example.test/article?topic=plants#details'
    const source = await library.addUrl(notebook.id, url)
    const stored = library.getSource(notebook.id, source.id)
    assert.equal(stored.title, 'Copper & plants')
    assert.equal(stored.kind, 'url')
    assert.equal(stored.locator, url)
    assert.match(stored.body, /光合作用/)
    assert.match(stored.body, /Plants convert light into sugar\./)
    assert.doesNotMatch(stored.body, /secret_script_token|secret-style|<p>|<script>/)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('empty HTML is rejected and JSON strings containing tags remain unchanged', async () => {
  let html = true
  const json = '{"text":"<main>keep this tag</main>"}'
  const { dir, library } = tempLib({
    fetch: async () => new Response(html ? '<html><head><title>Empty</title></head><body><script>hidden()</script></body></html>' : json, {
      headers: { 'content-type': html ? 'text/html' : 'application/json' },
    }),
  }, { maxUrlBytes: 1000, maxUploadBytes: 1000 })
  try {
    const notebook = library.createNotebook({ title: 'Formats' })
    await assert.rejects(library.addUrl(notebook.id, 'https://example.test/empty'), /document is empty/)
    assert.deepEqual(library.listSources(notebook.id), [])
    html = false
    const source = await library.addUrl(notebook.id, 'https://example.test/data.json')
    assert.equal(library.getSource(notebook.id, source.id).body, json)
  } finally {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
