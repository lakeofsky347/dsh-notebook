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

test('HTML extraction drops hidden subtrees and embedded objects while preserving visible styles', () => {
  const html = `<html><body><main>
    <section style="DISPLAY: none !IMPORTANT"><p>hidden-display</p></section>
    <p style="color: red; VISIBILITY : HIDDEN">hidden-visibility</p>
    <p style="visibility: collapse">hidden-collapse</p>
    <p aria-hidden="TRUE">hidden-aria</p>
    <p hidden>hidden-attribute</p>
    <object>hidden-object</object><embed src="https://example.org/media">
    <input type="HIDDEN" value="hidden-input">
    <p style="display: block; visibility: visible">Visible evidence.</p>
    <p style="--display: none; color: red" aria-hidden="false">Visible custom property.</p>
  </main></body></html>`
  const result = extractUrlDocument(html, 'text/html', 'https://example.org/research')
  assert.doesNotMatch(result.body, /hidden-/)
  assert.match(result.body, /Visible evidence\./)
  assert.match(result.body, /Visible custom property\./)
})

test('short provider-marked browser challenge shells are rejected instead of saved as evidence', () => {
  const html = '<html><head><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></head><body><main><h1>Verify you are human</h1><p>Checking your browser before continuing.</p></main></body></html>'
  assert.throws(() => extractUrlDocument(html, 'text/html', 'https://example.org/research'), /人机验证页面/)
})

test('verification tutorials and documents with captcha widgets are not rejected by keyword', () => {
  const tutorial = '<html><head><title>How browser verification works</title></head><body><main><h1>Verify you are human</h1><p>Checking your browser is wording shown by verification services. This tutorial explains the accessibility tradeoffs.</p><pre>&lt;script src="/cdn-cgi/challenge-platform/example"&gt;&lt;/script&gt;</pre></main></body></html>'
  assert.match(extractUrlDocument(tutorial, 'text/html', 'https://example.org/tutorial').body, /accessibility tradeoffs/)
  const article = '<html><head><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/example"></script></head><body><article><p>Verify you are human is a phrase discussed in this article about browser challenges.</p></article></body></html>'
  assert.match(extractUrlDocument(article, 'text/html', 'https://example.org/article').body, /discussed in this article/)
  const widget = '<html><head><title>Contact the research team</title><script src="https://www.google.com/recaptcha/api.js"></script></head><body><main><p>Our research studies human verification and privacy. Verify you are human before submitting a comment.</p></main></body></html>'
  assert.match(extractUrlDocument(widget, 'text/html', 'https://example.org/contact').body, /research studies/)
})
