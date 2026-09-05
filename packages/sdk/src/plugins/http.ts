import type { VigilClient } from '../core/client'

/**
 * HTTP 请求监控：劫持 fetch / XMLHttpRequest。
 *
 * 只做"包裹"不改写业务语义：请求照常发出，异常继续向上抛，
 * 只在响应阶段记录状态码与耗时，慢请求与失败请求单独上报。
 */
export function installHttpPlugin(client: VigilClient): void {
  patchFetch(client)
  patchXHR(client)
}

function patchFetch(client: VigilClient): void {
  if (typeof window.fetch !== 'function') return
  const original = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
    const start = performance.now()
    let body: string | undefined
    if (init?.body && typeof init.body === 'string') body = init.body.slice(0, 1000)

    try {
      const res = await original(input, init)
      const duration = Math.round(performance.now() - start)
      const cloned = res.clone()
      cloned.text().then((text) => {
        client.addBreadcrumb({
          type: 'http',
          message: `${method} ${url} ${res.status} (${duration}ms)`,
          ts: Date.now(),
          data: { status: res.status, duration },
        })
        const failed = res.status >= 400
        const slow = duration >= client.options.slowRequestThreshold
        if (failed || slow) {
          client.captureError({
            errorKind: 'http',
            level: res.status >= 500 ? 'error' : 'warning',
            message: `${method} ${url} -> ${res.status} (${duration}ms)`,
            http: {
              url,
              method,
              status: res.status,
              duration,
              requestBody: body,
              responseText: text.slice(0, 1000),
              slow,
            },
          })
        }
      }).catch(() => undefined)
      return res
    } catch (err) {
      const duration = Math.round(performance.now() - start)
      client.captureError({
        errorKind: 'http',
        level: 'error',
        message: `${method} ${url} -> network error (${duration}ms)`,
        http: { url, method, status: 0, duration, requestBody: body },
      })
      throw err
    }
  }
}

function patchXHR(client: VigilClient): void {
  const OriginalXHR = window.XMLHttpRequest
  if (!OriginalXHR) return

  const open = OriginalXHR.prototype.open
  const send = OriginalXHR.prototype.send

  OriginalXHR.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    // @ts-expect-error 挂载私有元信息
    this.__vigil = { method: method.toUpperCase(), url: String(url), start: 0 }
    // @ts-expect-error 透传剩余参数
    return open.call(this, method, url, ...rest)
  } as typeof open

  OriginalXHR.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = (this as unknown as { __vigil?: { method: string; url: string; start: number } }).__vigil
    if (meta) meta.start = performance.now()

    this.addEventListener('loadend', () => {
      if (!meta) return
      const duration = Math.round(performance.now() - meta.start)
      client.addBreadcrumb({
        type: 'http',
        message: `${meta.method} ${meta.url} ${this.status} (${duration}ms)`,
        ts: Date.now(),
        data: { status: this.status, duration },
      })
      const failed = this.status >= 400
      const slow = duration >= client.options.slowRequestThreshold
      if (failed || slow) {
        client.captureError({
          errorKind: 'http',
          level: this.status >= 500 ? 'error' : 'warning',
          message: `${meta.method} ${meta.url} -> ${this.status} (${duration}ms)`,
          http: {
            url: meta.url,
            method: meta.method,
            status: this.status,
            duration,
            requestBody: typeof body === 'string' ? body.slice(0, 1000) : undefined,
            responseText: safeResponseText(this).slice(0, 1000),
            slow,
          },
        })
      }
    })

    return send.call(this, body)
  } as typeof send
}

function safeResponseText(xhr: XMLHttpRequest): string {
  try {
    return xhr.responseText ?? ''
  } catch {
    return ''
  }
}
