import { parseHTML } from 'linkedom'

/** Extract readable saved text without running page scripts or loading subresources. */
export function extractUrlDocument(raw, contentType, url) {
  const parsed = new URL(url)
  const fallback = parsed.hostname + parsed.pathname
  const html = /\bhtml\b/i.test(contentType) || (!contentType && /^\s*<(?:!doctype\s+html|html|head|body|article|main)(?=[\s>])/i.test(raw))
  if (!html) return { body: raw, title: fallback }
  const { document } = parseHTML(raw)
  const title = document.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || fallback
  // Require both a provider-specific marker and a shell title; articles explaining
  // browser verification or embedding an ordinary CAPTCHA are still documents.
  const challengeShell = !document.querySelector('article, [itemtype*="Article"]') &&
    /^(?:just a moment[.!…\s]*|attention required!?(?:\s*[|–-]\s*cloudflare)?)$/i.test(title) &&
    Boolean(document.querySelector('#challenge-running, #challenge-form, #cf-challenge-running, script[src*="/cdn-cgi/challenge-platform/"]'))
  for (const element of document.querySelectorAll('script, style, noscript, template, svg, canvas, iframe, object, embed, nav, footer, form, [hidden]')) element.remove()
  for (const element of document.querySelectorAll('[style], [aria-hidden], input[type]')) {
    const hidden = element.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true' ||
      (element.tagName === 'INPUT' && element.getAttribute('type')?.toLowerCase() === 'hidden') ||
      (element.getAttribute('style') || '').split(';').some(declaration => {
        const separator = declaration.indexOf(':')
        if (separator < 0) return false
        const property = declaration.slice(0, separator).trim().toLowerCase()
        const value = declaration.slice(separator + 1).trim().toLowerCase().replace(/\s*!important\s*$/, '')
        return (property === 'display' && value === 'none') || (property === 'visibility' && ['hidden', 'collapse'].includes(value))
      })
    if (hidden) element.remove()
  }
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
  if (challengeShell && body.length < 1500 && /verify (?:that )?you are human|verifying you are human|checking your browser|enable javascript and cookies to continue|performing security verification/i.test(body)) {
    throw new Error('网页返回人机验证页面，未获取到资料正文')
  }
  return { body, title }
}
