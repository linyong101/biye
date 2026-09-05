import type { Breadcrumb } from '../types'
import type { VigilOptions } from '../types'

/**
 * 用户行为面包屑：定长环形存储。
 * 出错时把最近 N 条行为一起上报，是"复现现场"的关键数据。
 */
export class BreadcrumbStore {
  private items: Breadcrumb[] = []
  private max: number

  constructor(max: number = 20) {
    this.max = max
  }

  push(item: Breadcrumb): void {
    this.items.push(item)
    if (this.items.length > this.max) {
      this.items.shift()
    }
  }

  /**
   * 返回深拷贝副本，防止调用方修改对象属性污染内部状态。
   * 注意：slice() 只是数组浅拷贝，对象仍是同一引用，必须逐条克隆。
   */
  drain(): Breadcrumb[] {
    return this.items.map((b) => ({ ...b }))
  }

  clear(): void {
    this.items = []
  }
}

/**
 * 自动采集通用行为（点击 / 路由跳转 / console），
 * 由 BreadcrumbPlugin 在 init 时调用一次。
 */
export function instrumentBreadcrumbs(store: BreadcrumbStore, options: VigilOptions): () => void {
  const disposers: Array<() => void> = []

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return
    store.push({
      type: 'click',
      message: `click ${describeElement(target)}`,
      ts: Date.now(),
      data: { x: e.clientX, y: e.clientY },
    })
  }
  document.addEventListener('click', onClick, true)
  disposers.push(() => document.removeEventListener('click', onClick, true))

  // 劫持 history，记录 SPA 路由跳转
  // 注意：pushState / replaceState 的联合类型会让 Parameters 推导失效，
  // 必须先收敛成单一函数签名，否则展开参数时报 TS2556
  type HistoryMethod = (data: unknown, unused: string, url?: string | URL | null) => void
  const patchHistory = (method: 'pushState' | 'replaceState') => {
    const original = history[method].bind(history) as HistoryMethod
    history[method] = ((...args: Parameters<HistoryMethod>) => {
      store.push({
        type: 'navigation',
        message: `navigate to ${String(args[2] ?? '')}`,
        ts: Date.now(),
        data: { from: location.href, to: String(args[2] ?? '') },
      })
      return original(...args)
    }) as HistoryMethod
    disposers.push(() => {
      history[method] = original
    })
  }
  patchHistory('pushState')
  patchHistory('replaceState')

  const onHashChange = () => {
    store.push({ type: 'navigation', message: `hash -> ${location.hash}`, ts: Date.now() })
  }
  window.addEventListener('hashchange', onHashChange)
  disposers.push(() => window.removeEventListener('hashchange', onHashChange))

  if (options.debug) {
    // debug 模式下记录 console，便于本地排查
    const levels = ['log', 'warn', 'error'] as const
    for (const lv of levels) {
      const original = console[lv].bind(console)
      console[lv] = ((...args: unknown[]) => {
        store.push({
          type: 'console',
          message: args.map((a) => String(a)).join(' ').slice(0, 200),
          ts: Date.now(),
          level: lv === 'log' ? 'info' : lv === 'warn' ? 'warning' : 'error',
        })
        return original(...args)
      }) as typeof console.log
      disposers.push(() => {
        console[lv] = original
      })
    }
  }

  return () => disposers.forEach((d) => d())
}

/** 生成元素的语义化描述，如 button.submit#pay */
function describeElement(el: HTMLElement): string {
  const tag = el.tagName?.toLowerCase() ?? 'unknown'
  const id = el.id ? `#${el.id}` : ''
  const cls = el.className && typeof el.className === 'string'
    ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
    : ''
  const text = (el.innerText || '').trim().slice(0, 20)
  return `${tag}${id}${cls}${text ? ` "${text}"` : ''}`
}
