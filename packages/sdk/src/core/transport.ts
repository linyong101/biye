import type { VigilEvent } from '../types'
import { safe } from '../utils'

const STORAGE_KEY = 'vigil:queue'
const MAX_PERSIST = 100
const MAX_RETRY = 3

/**
 * 上报通道。
 *
 * 设计要点（面试高频）：
 * 1. 批量 + 定时双触发，减少请求数
 * 2. 页面卸载时用 navigator.sendBeacon，这是唯一能保证请求发出的 API
 * 3. 普通场景用 fetch + keepalive，允许在卸载阶段继续传输
 * 4. 失败后指数退避重试，仍失败则落 localStorage，下次启动补报（离线可用）
 */
export class Transport {
  private queue: VigilEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private endpoint: string
  private batchSize: number
  private flushInterval: number
  private debug: boolean

  constructor(opts: { endpoint: string; batchSize: number; flushInterval: number; debug?: boolean }) {
    this.endpoint = opts.endpoint
    this.batchSize = opts.batchSize
    this.flushInterval = opts.flushInterval
    this.debug = !!opts.debug

    // 页面进入后台 / 卸载时，尽量把队列清空
    safe(() => {
      const onHide = () => this.flush(true)
      window.addEventListener('pagehide', onHide)
      window.addEventListener('beforeunload', onHide)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush(true)
      })
    }, undefined)

    this.restore()
  }

  enqueue(event: VigilEvent): void {
    this.queue.push(event)
    if (this.queue.length >= this.batchSize) {
      this.flush()
    } else {
      this.schedule()
    }
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.flushInterval)
  }

  /** 立即上报；useBeacon=true 时走 sendBeacon（不可读取响应，用于卸载场景） */
  flush(useBeacon = false): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.queue.length === 0) return

    const batch = this.queue.splice(0, this.queue.length)
    const payload = JSON.stringify({ events: batch })

    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      const ok = safe(() => navigator.sendBeacon(this.endpoint, new Blob([payload], { type: 'application/json' })), false)
      if (ok) {
        this.retryCount = 0
        this.clearPersisted()
        return
      }
    }

    void this.sendWithRetry(payload, batch)
  }

  private async sendWithRetry(payload: string, batch: VigilEvent[]): Promise<void> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.retryCount = 0
      this.clearPersisted()
      if (this.debug) console.log('[vigil] flushed', batch.length, 'events')
    } catch (err) {
      this.retryCount += 1
      if (this.retryCount <= MAX_RETRY) {
        // 指数退避：1s / 2s / 4s
        setTimeout(() => this.flush(), 2 ** (this.retryCount - 1) * 1000)
      } else {
        this.retryCount = 0
        this.persist(batch)
        if (this.debug) console.warn('[vigil] 上报失败，已暂存本地', err)
      }
    }
  }

  /** 上报失败的事件暂存本地，避免数据丢失 */
  private persist(batch: VigilEvent[]): void {
    safe(() => {
      const raw = localStorage.getItem(STORAGE_KEY)
      const prev: VigilEvent[] = raw ? JSON.parse(raw) : []
      const next = [...prev, ...batch].slice(-MAX_PERSIST)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }, undefined)
  }

  private clearPersisted(): void {
    safe(() => localStorage.removeItem(STORAGE_KEY), undefined)
  }

  /** 启动时补报上次未成功的事件 */
  private restore(): void {
    safe(() => {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const prev: VigilEvent[] = JSON.parse(raw)
      if (Array.isArray(prev) && prev.length) {
        this.queue.unshift(...prev)
        this.schedule()
      }
    }, undefined)
  }
}
