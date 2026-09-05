/**
 * Demo 站点静态服务（零依赖，仅用 node:http）。
 *
 * 作用：提供一个"异常制造机"页面，让你一键触发各类线上事故，
 * 从而产生真实的监控数据 —— 演示、自测、毕设答辩都靠它。
 *
 * 启动：node demo/server.mjs
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PUBLIC_DIR = join(ROOT, 'demo', 'public')
const SDK_DIST = join(ROOT, 'packages', 'sdk', 'dist')
const PORT = Number(process.env.DEMO_PORT ?? 5174)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

async function resolveFile(pathname) {
  // 统一为正斜杠：Windows 下 normalize() 会把 "/" 变成 "\"，
  // 若不做转换，根路径 "/" 会匹配失败而返回 404
  const clean = normalize(pathname)
    .replace(/\\/g, '/')
    .replace(/^(\.\.\/)+/, '')

  if (clean === '/' || clean === '') return join(PUBLIC_DIR, 'index.html')
  if (clean.startsWith('/sdk/')) {
    return join(SDK_DIST, clean.slice('/sdk/'.length))
  }
  return join(PUBLIC_DIR, clean)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const { pathname } = url

  // ---- 模拟接口：供 SDK 采集 HTTP 错误与慢请求 ----
  if (pathname === '/api/mock/500') {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ code: 500, message: 'Internal Server Error' }))
  }
  if (pathname === '/api/mock/slow') {
    await new Promise((r) => setTimeout(r, 3500))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ code: 0, message: 'slow response' }))
  }
  if (pathname === '/api/mock/ok') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ code: 0, data: { sku: 10086, price: 299 } }))
  }

  // ---- 静态资源 ----
  try {
    const file = await resolveFile(pathname)
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')

    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
  }
})

server.listen(PORT, () => {
  console.log(`\n  Vigil Demo 站点已启动  →  http://localhost:${PORT}`)
  console.log(`  在这里制造异常，然后到 http://localhost:5173 看板上查看\n`)
})
