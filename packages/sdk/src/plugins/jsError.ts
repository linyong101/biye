import type { VigilClient } from '../core/client'

/**
 * 全局异常采集。
 * - window.error 捕获阶段：既能拿到 JS 运行时错误，也能拿到资源加载失败（捕获阶段才冒泡得到）
 * - unhandledrejection：未处理的 Promise 拒绝
 */
export function installErrorPlugin(client: VigilClient): void {
  window.addEventListener(
    'error',
    (e: ErrorEvent) => {
      const target = e.target as (EventTarget & { tagName?: string; src?: string; href?: string }) | null

      // 资源加载失败：target 是具体 DOM 节点，没有 message
      if (target && target !== window && target.tagName) {
        const src = target.src || target.href || ''
        client.captureError({
          errorKind: 'resource',
          level: 'error',
          message: `Resource load failed: ${target.tagName} ${src}`,
          resource: { tagName: target.tagName.toLowerCase(), src },
        })
        return
      }

      if (e.message) {
        client.captureError({
          errorKind: 'js',
          level: 'error',
          message: e.message,
          stack: e.error?.stack,
          extra: { filename: e.filename, lineno: e.lineno, colno: e.colno },
        })
      }
    },
    true,
  )

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : `Unhandled rejection: ${stringify(reason)}`
    client.captureError({
      errorKind: 'promise',
      level: 'error',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })
}

function stringify(val: unknown): string {
  try {
    return typeof val === 'object' ? JSON.stringify(val) : String(val)
  } catch {
    return String(val)
  }
}
