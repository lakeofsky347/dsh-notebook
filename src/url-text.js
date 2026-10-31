import { parseHTML } from 'linkedom'

/** Extract readable saved text without running page scripts or loading subresources. */
export function extractUrlDocument(raw, contentType, url) {
  const parsed = new URL(url)
  const fallback = parsed.hostname + parsed.pathname
  const html = /\bhtml\b/i.test(contentType) || (!contentType && /^\s*<(?:!doctype\s+html|html|head|body|article|main)(?=[\s>])/i.test(raw))
  if (!html) return { body: raw, title: fallback }
  const { document } = parseHTML(raw)
  const title = document.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || fallback
  for (const element of document.querySelectorAll('script, style, noscript, template, svg, canvas, iframe, nav, footer, form, [hidden], [aria-hidden="true"]')) element.remove()
  const root = document.querySelector('article, main, [role="main"]') || document.body || document.documentElement
  if (!root) return { body: '', title }
  for (const anchor of root.querySelectorAll('a[href]')) {
    try {
      const href = new URL(anchor.getAttribute('href'), parsed)
      if (['http:', 'https:'].includes(href.protocol)) anchor.appendChild(document.createTextNode(' (' + href.href + ')'))
    } catch {}
  }
  for (const element of root.querySelectorAll('br, h1, h2, h3, h4, h5, h6, p, div, section, li, tr, blockquote, pre')) {
    element.before(document.createTextNode('\n'))
    element.after(document.createTextNode('\n'))
  }
  const body = root.textContent.replace(/\r\n?/g, '\n').split('\n')
    .map(line => line.replace(/[\t\f\v ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { body, title }
}
