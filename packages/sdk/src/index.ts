import type { Level, VigilOptions } from './types'
import { VigilClient } from './core/client'
import { instrumentBreadcrumbs } from './core/breadcrumb'
import { installErrorPlugin } from './plugins/jsError'
import { installHttpPlugin } from './plugins/http'
import { installPerformancePlugin } from './plugins/performance'
import { installWhiteScreenPlugin } from './plugins/whiteScreen'
import { installBehaviorPlugin } from './plugins/behavior'
import { installReplayPlugin } from './plugins/replay'

export * from './types'
export { VigilClient } from './core/client'
export { makeFingerprint, normalizeMessage } from './core/fingerprint'

let instance: VigilClient | null = null

/**
 * 初始化 Vigil 监控。
 *
 * @example
 * ```ts
 * import { init } from '@vigil/web-sdk'
 * init({ appId: 'demo-shop', endpoint: 'http://localhost:3001/api/report' })
 * ```
 */
export function init(options: VigilOptions): VigilClient {
  if (instance) return instance

  const client = new VigilClient(options)
  instance = client

  if (options.enableBreadcrumb !== false) {
    instrumentBreadcrumbs(client.breadcrumbs, options)
  }
  if (options.enableError !== false) installErrorPlugin(client)
  // HTTP 既服务于错误定位，也是面包屑来源，默认常开
  installHttpPlugin(client)
  if (options.enablePerformance !== false) installPerformancePlugin(client)
  if (options.enableWhiteScreen !== false) installWhiteScreenPlugin(client)
  if (options.enableBehavior !== false) installBehaviorPlugin(client)
  if (options.enableReplay !== false) installReplayPlugin(client, { intervalMs: options.replayIntervalMs })

  return client
}

/** 获取已初始化的实例（未初始化时返回 null） */
export function getInstance(): VigilClient | null {
  return instance
}

/** 主动上报异常，用于 try/catch 与框架错误边界 */
export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  instance?.captureException(err, extra)
}

/** 主动上报消息 */
export function captureMessage(message: string, level: Level = 'info', extra?: Record<string, unknown>): void {
  instance?.captureMessage(message, level, extra)
}

export function setUser(userId: string): void {
  instance?.setUser(userId)
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  instance?.addBreadcrumb({ type: 'custom', message, ts: Date.now(), data })
}

/** 立即上报队列（如关键流程结束前） */
export function flush(): void {
  instance?.flush()
}
