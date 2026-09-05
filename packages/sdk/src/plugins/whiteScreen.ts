import type { VigilClient } from '../core/client'

/**
 * 白屏检测。
 *
 * 原理：页面渲染完成后，在视口取 9 个采样点做命中测试。
 * 若所有采样点最顶层元素都仍是容器节点（html / body / #app / #root），
 * 说明业务内容一个都没渲染出来 —— 判定白屏。
 *
 * 相比"监听 DOM 节点数量"，命中测试能识别出"有 DOM 但不可见"的伪正常情况。
 */
const CONTAINER_TAGS = ['html', 'body']
const CONTAINER_IDS = ['app', 'root', '__next', 'nuxt']

export function installWhiteScreenPlugin(client: VigilClient): void {
  const check = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    if (!w || !h) return

    const points: Array<[number, number]> = [
      [w / 2, h / 2],
      [w / 2, h * 0.15],
      [w / 2, h * 0.85],
      [w * 0.15, h / 2],
      [w * 0.85, h / 2],
      [w * 0.25, h * 0.25],
      [w * 0.75, h * 0.25],
      [w * 0.25, h * 0.75],
      [w * 0.75, h * 0.75],
    ]

    let empty = 0
    const samples: string[] = []
    for (const [x, y] of points) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      const tag = el?.tagName?.toLowerCase() ?? 'null'
      const id = el?.id ?? ''
      samples.push(tag + (id ? `#${id}` : ''))
      if (!el || CONTAINER_TAGS.includes(tag) || CONTAINER_IDS.includes(id)) empty++
    }

    if (empty === points.length) {
      client.captureError({
        errorKind: 'whiteScreen',
        level: 'fatal',
        message: `White screen detected on ${location.href}`,
        extra: { samples, viewport: `${w}x${h}`, readyState: document.readyState },
      })
    }
  }

  window.addEventListener(
    'load',
    () => {
      // 留 1s 给首屏异步渲染
      setTimeout(check, 1000)
    },
    { once: true },
  )

  // SPA 路由切换后可能出现新页面白屏
  const onSpaNav = () => setTimeout(check, 1500)
  window.addEventListener('popstate', onSpaNav)
  window.addEventListener('hashchange', onSpaNav)
}
