import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { openLibrary } from '../src/library.js'

const limits = {
  maxNotebooks: 2,
  maxSourcesPerNotebook: 2,
  maxWordsPerSource: 100,
  maxUploadBytes: 1000,
  chunkChars: 100,
  chunkOverlap: 10,
  topK: 3,
  urlTimeoutMs: 50,
  maxUrlBytes: 1000,
}

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-workspace-'))
  const file = join(dir, 'library.sqlite')
  let library = openLibrary(file, limits)
  t.after(() => {
    library.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return {
    get library() { return library },
    file,
    reopen() {
      library.close()
      library = openLibrary(file, limits)
      return library
    },
  }
}

test('workspaces persist settings and resolve their optional notebook binding', (t) => {
  const store = setup(t)
  const workspace = store.library.createWorkspace()
  assert.equal(workspace.title, '新对话')
  assert.equal(workspace.mode, 'research')
  assert.equal(workspace.provider, '')
  assert.equal(workspace.model, '')
  assert.equal(workspace.notebookId, null)
  assert.equal(store.library.listNotebooks().length, 0)
  const notebook = store.library.createNotebook({ title: 'Research' })
  store.library.bind('workbench:' + workspace.id, notebook.id)
  const changed = store.library.updateWorkspace(workspace.id, { title: ' Research chat ', provider: 'local', model: 'test-model', mode: 'chat' })
  assert.deepEqual({ title: changed.title, provider: changed.provider, model: changed.model, mode: changed.mode, notebookId: changed.notebookId }, {
    title: 'Research chat', provider: 'local', model: 'test-model', mode: 'chat', notebookId: notebook.id,
  })
  assert.equal(changed.createdAt, workspace.createdAt)
  const library = store.reopen()
  assert.deepEqual(library.getWorkspace(workspace.id), changed)
  assert.deepEqual(library.listWorkspaces(), [changed])
  library.unbind('workbench:' + workspace.id)
  assert.equal(library.getWorkspace(workspace.id).notebookId, null)
  assert.equal(library.getWorkspace('missing'), null)
  assert.throws(() => library.createWorkspace({ title: ' ' }), /title is required/)
  assert.throws(() => library.updateWorkspace(workspace.id, { title: '' }), /title is required/)
  assert.throws(() => library.updateWorkspace('missing', {}), /workspace not found/)
})

test('messages preserve native content, tool metadata, and recent creation order after reopening', (t) => {
  const store = setup(t)
  const workspace = store.library.createWorkspace({ provider: 'provider', model: 'model' })
  const other = store.library.createWorkspace({ title: 'Other' })
  const user = store.library.appendMessage(workspace.id, { role: 'user', text: 'question' })
  assert.deepEqual(user.content, [{ type: 'text', text: 'question' }])
  assert.deepEqual(user.metadata, {})
  const content = [{ type: 'thinking', text: 'reasoning' }, { type: 'tool-call', id: 'call-1', name: 'notebook.search', args: { query: 'copper' } }]
  const assistant = store.library.appendMessage(workspace.id, { role: 'assistant', text: '', content, provider: 'provider', model: 'model', status: 'streaming' })
  const tool = store.library.appendMessage(workspace.id, { role: 'tool', text: 'copper result', toolName: 'notebook.search', metadata: { callId: 'call-1', sources: ['source-1'] } })
  assert.equal(tool.toolName, 'notebook.search')
  assert.deepEqual(tool.metadata, { callId: 'call-1', sources: ['source-1'] })
  assert.equal(assistant.provider, 'provider')
  assert.equal(assistant.model, 'model')
  assert.deepEqual(assistant.content, content)
  assert.deepEqual(store.library.listMessages(other.id), [])
  assert.deepEqual(store.library.listMessages(workspace.id, 2).map(row => row.id), [assistant.id, tool.id])
  assert.deepEqual(store.library.listMessages(workspace.id, 0), [])
  const library = store.reopen()
  assert.deepEqual(library.listMessages(workspace.id).map(row => row.id), [user.id, assistant.id, tool.id])
  assert.deepEqual(library.listMessages(workspace.id)[1].content, content)
})

test('streamed message updates preserve creation identity and unrelated fields', (t) => {
  const { library } = setup(t)
  const workspace = library.createWorkspace()
  const initial = library.appendMessage(workspace.id, { role: 'assistant', text: 'partial', status: 'streaming', provider: 'local', model: 'model', metadata: { partial: true } })
  const updated = library.updateMessage(initial.id, { text: 'complete', content: [{ type: 'text', text: 'complete' }], status: 'done', metadata: { tokens: 5 } })
  assert.equal(updated.id, initial.id)
  assert.equal(updated.workspaceId, initial.workspaceId)
  assert.equal(updated.createdAt, initial.createdAt)
  assert.equal(updated.provider, 'local')
  assert.equal(updated.model, 'model')
  assert.equal(updated.status, 'done')
  assert.equal(updated.text, 'complete')
  assert.deepEqual(updated.content, [{ type: 'text', text: 'complete' }])
  assert.deepEqual(updated.metadata, { tokens: 5 })
  const textOnly = library.updateMessage(initial.id, { text: 'display correction' })
  assert.deepEqual(textOnly.content, updated.content)
  assert.equal(library.listMessages(workspace.id).length, 1)
})

test('message validation rejects missing workspaces and invalid roles, arrays, JSON, and limits', (t) => {
  const { library } = setup(t)
  const workspace = library.createWorkspace()
  assert.throws(() => library.appendMessage('missing', { role: 'user' }), /workspace not found/)
  assert.throws(() => library.listMessages('missing'), /workspace not found/)
  assert.throws(() => library.appendMessage(workspace.id, { role: 'developer' }), /unknown message role/)
  assert.throws(() => library.appendMessage(workspace.id, { role: 'user', content: {} }), /content must be an array/)
  const cyclic = {}; cyclic.self = cyclic
  assert.throws(() => library.appendMessage(workspace.id, { role: 'user', metadata: cyclic }), /JSON serializable/)
  assert.deepEqual(library.listMessages(workspace.id), [])
  const message = library.appendMessage(workspace.id, { role: 'system' })
  assert.throws(() => library.updateMessage(message.id, { content: null }), /content must be an array/)
  assert.throws(() => library.updateMessage(message.id, { metadata: cyclic }), /JSON serializable/)
  assert.throws(() => library.updateMessage('missing', {}), /message not found/)
  assert.throws(() => library.listMessages(workspace.id, -1), /non-negative integer/)
  assert.throws(() => library.listMessages(workspace.id, 1.5), /non-negative integer/)
  assert.equal(library.listMessages(workspace.id).length, 1)
})

test('message writes roll back if the workspace update fails', (t) => {
  const { library, file } = setup(t)
  const workspace = library.createWorkspace()
  const initial = library.appendMessage(workspace.id, { role: 'assistant', text: 'original' })
  const db = new DatabaseSync(file)
  try {
    db.exec("CREATE TRIGGER reject_workspace_touch BEFORE UPDATE ON workspaces BEGIN SELECT RAISE(ABORT, 'touch rejected'); END")
    assert.throws(() => library.appendMessage(workspace.id, { role: 'user', text: 'discarded' }), /touch rejected/)
    assert.throws(() => library.updateMessage(initial.id, { text: 'discarded' }), /touch rejected/)
    assert.deepEqual(library.listMessages(workspace.id), [initial])
  } finally { db.close() }
})

test('opening an existing notebook database creates workspace tables without losing its data', (t) => {
  const store = setup(t)
  const notebook = store.library.createNotebook({ title: 'Existing notebook' })
  const source = store.library.addText(notebook.id, 'Existing source', 'copper conductivity')
  const db = new DatabaseSync(store.file)
  try {
    db.exec('DROP TABLE workspace_messages; DROP TABLE workspaces')
  } finally { db.close() }
  const library = store.reopen()
  assert.equal(library.getNotebook(notebook.id).title, notebook.title)
  assert.equal(library.getSource(notebook.id, source.id).body, 'copper conductivity')
  assert.equal(library.search(notebook.id, 'copper').length, 1)
  const workspace = library.createWorkspace()
  assert.equal(library.appendMessage(workspace.id, { role: 'user', text: 'new feature' }).text, 'new feature')
})
