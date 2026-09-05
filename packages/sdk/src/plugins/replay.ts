import type { VigilClient } from '../core/client'
import type { ReplayFrame, ReplayNode } from '../types'

/** 参与快照的可交互 / 文本元素 */
const SELECTOR = 'a,button,input,select,textarea,img,h1,h2,h3,p,li,label,span'
const MAX_NODES = 60

/** 浏览器元素的最小抽象，便于在测试中用 mock 对象验证 */
export interface ElementLike {
  tagName: string
  textContent: string | null
  id: string
  className: string | { toString(): string }
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number; bottom: number; right: number }
  value?: string
}

function pct(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * 从 DOM 中挑选出用于回放的关键节点，并转换为相对视口的百分比坐标。
 * 只保留可见且非空白的元素，限制数量以控制上报体积。
 */
export function pickReplayNodes(els: ElementLike[], vw: number, vh: number): ReplayNode[] {
  const nodes: ReplayNode[] = []
  for (const el of els) {
    if (nodes.length >= MAX_NODES) break
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > vh || r.width === 0 || r.height === 0) continue

    const tag = el.tagName.toLowerCase()
    const node: ReplayNode = {
      tag,
      rect: {
        x: pct((r.left / vw) * 100),
        y: pct((r.top / vh) * 100),
        w: pct((r.width / vw) * 100),
        h: pct((r.height / vh) * 100),
      },
    }

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (text && tag !== 'input' && tag !== 'textarea' && tag !== 'img') node.text = text

    if (el.id) node.id = el.id
    else {
      const cls = typeof el.className === 'string' ? el.className : el.className.toString()
      const first = cls.trim().split(/\s+/)[0]
      if (first) node.cls = first.slice(0, 24)
    }

    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      node.value = (el.value ?? '').slice(0, 20)
    }

    nodes.push(node)
  }
  return nodes
}

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T {
  let id: ReturnType<typeof setTimeout> | undefined
  return ((...args: never[]) => {
    if (id) clearTimeout(id)
    id = setTimeout(() => fn(...args), wait)
  }) as T
}

/**
 * 安装会话回放插件：周期性采集整页精简快照，并在用户交互 / 路由变化时
 * 额外补帧，从而可以在看板中「回放」出错前的用户操作路径与界面状态。
 */
export function installReplayPlugin(client: VigilClient, opts: { intervalMs?: number } = {}): void {
  const start = Date.now()
  const interval = opts.intervalMs ?? 3000

  const snapshot = (type: string): void => {
    try {
      const nodes = pickReplayNodes(
        Array.from(document.querySelectorAll(SELECTOR)) as unknown as ElementLike[],
        window.innerWidth,
        window.innerHeight,
      )
      const frame: ReplayFrame = { type, url: location.href, t: Date.now() - start, nodes }
      client.captureReplayFrame(frame)
    } catch {
      /* 快照异常不应阻塞主流程 */
    }
  }

  snapshot('snapshot')
  const timer = setInterval(() => snapshot('snapshot'), interval)
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    ;(timer as { unref: () => void }).unref()
  }

  const on = (type: string) => () => snapshot(type)
  window.addEventListener('click', on('click'), { passive: true })
  window.addEventListener('input', on('input'), { passive: true })
  window.addEventListener('scroll', debounce(on('scroll'), 400), { passive: true })

  const origPush = history.pushState.bind(history)
  history.pushState = ((...args: Parameters<typeof history.pushState>) => {
    const result = origPush(...args)
    snapshot('route')
    return result
  }) as typeof history.pushState
  window.addEventListener('popstate', on('route'))
}
