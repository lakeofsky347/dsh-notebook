import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' }
export function createPreviewServer() {
  return createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = resolve(root, '.' + (path === '/' ? '/dev/preview.html' : path))
      if (!file.startsWith(root + sep) || path.split('/').some(part => part.startsWith('.')) || !['/dev/', '/src/'].some(prefix => path === '/' || path.startsWith(prefix))) {
        response.writeHead(404); response.end('Not found'); return
      }
      const body = await readFile(file)
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
      response.end(body)
    } catch {
      response.writeHead(404); response.end('Not found')
    }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv.find(item => item.startsWith('--port='))?.split('=')[1] || 8765)
  const server = createPreviewServer()
  server.listen(port, '127.0.0.1', () => console.log(`开发预览（模拟数据）：http://127.0.0.1:${port}/dev/preview.html`))
}
