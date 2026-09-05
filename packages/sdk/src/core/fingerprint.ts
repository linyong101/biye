import { hash } from '../utils'

/**
 * 错误指纹算法。
 *
 * 目标：把成千上万条上报归并成少量 issue，同时不能把不同根因的错误误合并。
 * 做法：取「错误类型 + 归一化 message + 堆栈首帧」做哈希。
 *
 * 归一化规则：
 * - 数字序列 -> N       （如 id=12345 与 id=67890 视为同一问题）
 * - 哈希串   -> H       （打包产物文件名带 hash）
 * - 引号内容 -> S       （避免具体文案差异造成误拆分）
 * - URL 路径参数数字 -> 保留路径结构
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\/\d+(?=\/|$|\?)/g, '/N')
    .replace(/\b\d+\b/g, 'N')
    .replace(/\b[0-9a-f]{8,}\b/gi, 'H')
    .replace(/"[^"]*"/g, 'S')
    .replace(/'[^']*'/g, 'S')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** 从堆栈中提取第一个有意义的业务帧（排除 node_modules 与 SDK 自身） */
export function firstMeaningfulFrame(stack?: string): string {
  if (!stack) return ''
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (line.includes('node_modules')) continue
    if (line.includes('vigil')) continue
    const m = line.match(/at\s+(.+?)\s+\((.+?)\)/) || line.match(/at\s+(.+?)$/)
    if (m) return m[1].slice(0, 120)
  }
  return lines[1]?.slice(0, 120) ?? ''
}

export function makeFingerprint(errorKind: string, message: string, stack?: string): string {
  const raw = [errorKind, normalizeMessage(message), firstMeaningfulFrame(stack)].join('|')
  return hash(raw)
}
