import { SourceMapConsumer } from 'source-map-js'
import type { RawSourceMap } from 'source-map-js'
import { prisma } from '../db'

/**
 * Source Map 还原服务。
 *
 * 线上报错的堆栈形如：
 *   TypeError: x is not a function
 *       at onClick (https://cdn.example.com/assets/index-a1b2c3.js:1:23456)
 *
 * 还原后：
 *       at onClick (src/views/Order.tsx:42:13)
 *
 * 这是"能定位到源码"与"只能看到压缩后一行代码"的分水岭。
 */

type Consumer = InstanceType<typeof SourceMapConsumer>

/** 内存缓存，避免每次上报都解析一遍 map（生产可换 Redis） */
const cache = new Map<string, { consumer: Consumer; at: number }>()
const TTL = 10 * 60 * 1000

async function getConsumer(appId: string, release: string, fileName: string): Promise<Consumer | null> {
  const key = `${appId}:${release}:${fileName}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.consumer

  const record = await prisma.sourceMap.findFirst({
    where: { appId, OR: [{ release }, { release: '*' }], fileName: { endsWith: fileName } },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) return null

  try {
    const consumer = new SourceMapConsumer(JSON.parse(record.content) as RawSourceMap)
    cache.set(key, { consumer, at: Date.now() })
    return consumer
  } catch {
    return null
  }
}

const FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/

interface Frame {
  raw: string
  fn?: string
  url: string
  line: number
  column: number
}

function parseFrames(stack: string): Frame[] {
  return stack
    .split('\n')
    .map((raw) => {
      const m = raw.match(FRAME_RE)
      if (!m) return null
      const [, fn, url, line, column] = m
      return { raw, fn, url, line: Number(line), column: Number(column) }
    })
    .filter((f): f is Frame => !!f)
}

function fileNameOf(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  // 兼容浏览器 URL（/）与 Node 运行时堆栈（Windows 反斜杠路径）
  const parts = clean.split(/[/\\]/)
  return parts[parts.length - 1] || clean
}

/** 还原整段堆栈；无可用 map 时原样返回 */
export async function restoreStack(appId: string, release: string, stack?: string): Promise<string | undefined> {
  if (!stack) return stack
  const frames = parseFrames(stack)
  if (frames.length === 0) return stack

  const lines = stack.split('\n')
  let restored = 0

  for (const frame of frames) {
    const consumer = await getConsumer(appId, release, fileNameOf(frame.url))
    if (!consumer) continue
    const pos = consumer.originalPositionFor({ line: frame.line, column: frame.column })
    if (!pos.source || pos.line == null) continue

    const idx = lines.findIndex((l) => l === frame.raw)
    if (idx >= 0) {
      const fnName = pos.name || frame.fn || '<anonymous>'
      lines[idx] = `    at ${fnName} (${pos.source}:${pos.line}:${pos.column ?? 0})`
      restored++
    }
  }

  return restored > 0 ? lines.join('\n') : stack
}

/** 提取堆栈首个有效帧，作为 Issue 的定位信息 */
export function extractCulprit(stack?: string): string | undefined {
  if (!stack) return undefined
  const [first] = parseFrames(stack)
  if (!first) return undefined
  return `${first.fn || '<anonymous>'} @ ${fileNameOf(first.url)}:${first.line}:${first.column}`
}

export function invalidateCache(appId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${appId}:`)) cache.delete(key)
  }
}
