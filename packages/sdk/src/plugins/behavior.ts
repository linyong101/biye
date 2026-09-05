import type { VigilClient } from '../core/client'

/**
 * 用户行为采集：PV 与页面停留时长。
 * 停留时长在页面隐藏时用 sendBeacon 发出，保证数据不丢。
 */
export function installBehaviorPlugin(client: VigilClient): void {
  const start = Date.now()

  client.captureBehavior({ name: 'pv', extra: { referrer: document.referrer } })

  const reportStay = () => {
    client.captureBehavior({ name: 'stay', duration: Date.now() - start })
    client.flush()
  }

  window.addEventListener('pagehide', reportStay, { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reportStay()
  })
}
