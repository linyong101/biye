import type { VigilClient } from '../core/client'

type Rating = 'good' | 'needs-improvement' | 'poor'

/** 各指标阈值，参考 Google Web Vitals 官方标准 */
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  FCP: [1800, 3000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
}

function rate(name: string, value: number): Rating {
  const [good, poor] = THRESHOLDS[name] ?? [0, 0]
  if (value <= good) return 'good'
  if (value <= poor) return 'needs-improvement'
  return 'poor'
}

/**
 * 性能采集：Web Vitals（LCP / CLS / INP）+ FCP / TTFB。
 * 使用 PerformanceObserver 被动订阅，不主动轮询，对主线程零负担。
 */
export function installPerformancePlugin(client: VigilClient): void {
  if (typeof PerformanceObserver !== 'function') return

  // LCP / FCP
  observe(['largest-contentful-paint', 'paint'], (entry) => {
    if (entry.entryType === 'largest-contentful-paint') {
      report(client, 'LCP', entry.startTime)
    } else if (entry.name === 'first-contentful-paint') {
      report(client, 'FCP', entry.startTime)
    }
  })

  // CLS：布局偏移是累积值，只上报最后一次
  let clsValue = 0
  observe(['layout-shift'], (entry) => {
    const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
    if (e.hadRecentInput) return
    clsValue += e.value ?? 0
  })

  // INP：交互到下一次绘制
  let inpValue = 0
  observe(['event'], (entry) => {
    const e = entry as PerformanceEntry & { duration?: number }
    inpValue = Math.max(inpValue, e.duration ?? 0)
  })

  // TTFB 与页面导航计时
  observe(['navigation'], (entry) => {
    const nav = entry as PerformanceEntry & { responseStart?: number; domContentLoadedEventEnd?: number }
    if (nav.responseStart) report(client, 'TTFB', nav.responseStart)
    if (nav.domContentLoadedEventEnd) report(client, 'DCL', nav.domContentLoadedEventEnd)
  })

  // 页面隐藏/卸载时汇总上报一次性的累积指标
  const flushCumulative = () => {
    if (clsValue > 0) report(client, 'CLS', Number(clsValue.toFixed(4)))
    if (inpValue > 0) report(client, 'INP', inpValue)
    clsValue = 0
    inpValue = 0
    client.flush()
  }
  window.addEventListener('pagehide', flushCumulative, { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCumulative()
  })
}

function report(client: VigilClient, name: string, value: number): void {
  client.capturePerformance({
    name,
    value: Number(value.toFixed(2)),
    rating: rate(name, value),
    extra: { navigationType: getNavigationType() },
  })
}

function observe(types: string[], cb: (entry: PerformanceEntry) => void): void {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) cb(entry)
    })
    po.observe({ type: types[0], buffered: true } as PerformanceObserverInit)
    // 其余类型逐个订阅，某一类型不被支持时静默降级
    for (const type of types.slice(1)) {
      try {
        po.observe({ type, buffered: true } as PerformanceObserverInit)
      } catch {
        /* 浏览器不支持该 entryType，忽略 */
      }
    }
  } catch {
    /* PerformanceObserver 不可用 */
  }
}

function getNavigationType(): string {
  const nav = performance.getEntriesByType?.('navigation')?.[0] as (PerformanceEntry & { type?: string }) | undefined
  return nav?.type ?? 'unknown'
}
