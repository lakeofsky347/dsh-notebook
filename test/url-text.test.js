import assert from 'node:assert/strict'
import test from 'node:test'
import { extractUrlDocument } from '../src/url-text.js'

test('HTML import preserves readable article text, title and resolved evidence links', () => {
  const result = extractUrlDocument('<html><head><title>研究 &amp; 证据</title><style>bad-style</style></head><body><nav>bad-nav</nav><main><h1>标题</h1><p>光合作用形成糖。</p><script>bad-script</script><p><a href="/paper">论文</a></p></main><footer>bad-footer</footer></body></html>', 'text/html; charset=utf-8', 'https://example.org/study')
  assert.equal(result.title, '研究 & 证据')
  assert.match(result.body, /光合作用形成糖。/)
  assert.match(result.body, /论文 \(https:\/\/example.org\/paper\)/)
  assert.doesNotMatch(result.body, /bad-/)
  assert.match(result.body, /标题\n/)
})

test('plain text and JSON imports are saved verbatim', () => {
  const raw = '{"example":"<script>literal text</script>"}'
  assert.deepEqual(extractUrlDocument(raw, 'application/json', 'https://example.org/data.json'), { body: raw, title: 'example.org/data.json' })
  assert.equal(extractUrlDocument('<html>example</html>', 'text/plain', 'https://example.org').body, '<html>example</html>')
})
