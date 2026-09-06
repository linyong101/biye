/**
 * 演示数据生成脚本：npm run seed
 *
 * 生成近 7 天的模拟数据，让看板一打开就有内容可看（演示/毕设答辩场景很有用）。
 * 数据分布刻意做成"有涨有跌 + 一个突增"，便于展示趋势分析与告警效果。
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const APP_ID = 'demo-shop'
const RELEASE = '1.4.2'

const BROWSERS = [
  ['Chrome', '131'],
  ['Chrome', '120'],
  ['Edge', '131'],
  ['Safari', '17'],
  ['Firefox', '133'],
]
const OS_LIST = ['Windows', 'macOS', 'iOS', 'Android']
const PAGES = ['/', '/product/10086', '/cart', '/order/confirm', '/user/profile']

const ERROR_TEMPLATES = [
  {
    kind: 'js',
    level: 'error',
    message: "TypeError: Cannot read properties of undefined (reading 'price')",
    stack: `TypeError: Cannot read properties of undefined (reading 'price')
    at calcTotal (src/utils/cart.ts:28:19)
    at Cart.render (src/views/Cart.tsx:57:24)`,
    weight: 40,
  },
  {
    kind: 'promise',
    level: 'error',
    message: 'Unhandled rejection: Error: request timeout',
    stack: `Error: request timeout
    at fetchOrder (src/api/order.ts:15:11)
    at async onSubmit (src/views/Order.tsx:88:5)`,
    weight: 25,
  },
  {
    kind: 'http',
    level: 'error',
    message: 'GET /api/order/list -> 500 (1203ms)',
    stack: `Error: HTTP 500
    at request (src/api/request.ts:44:13)`,
    weight: 20,
  },
  {
    kind: 'resource',
    level: 'warning',
    message: 'Resource load failed: img https://cdn.example.com/banner-8f2a.png',
    stack: undefined,
    weight: 10,
  },
  {
    kind: 'whiteScreen',
    level: 'fatal',
    message: 'White screen detected on /order/confirm',
    stack: undefined,
    weight: 5,
  },
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function weightedError() {
  const total = ERROR_TEMPLATES.reduce((s, t) => s + t.weight, 0)
  let r = Math.random() * total
  for (const t of ERROR_TEMPLATES) {
    r -= t.weight
    if (r <= 0) return t
  }
  return ERROR_TEMPLATES[0]
}

function hash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i)
  return (h >>> 0).toString(36)
}

// ---- 演示会话回放 & 告警规则（答辩演示用，可控、可讲解） ----
const DEMO_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=DEMO_REPLACE_ME'

interface SeedReplayNode {
  tag: string
  text?: string
  cls?: string
  id?: string
  rect: { x: number; y: number; w: number; h: number }
  value?: string
}
interface SeedReplayFrame {
  type: string
  url: string
  t: number
  nodes: SeedReplayNode[]
}
interface SeedScenario {
  sessionId: string
  browser: string
  os: string
  frames: SeedReplayFrame[]
  error?: { kind: string; level: string; message: string }
}

const DEMO_PAGES = {
  home: 'https://shop.example.com/',
  product: 'https://shop.example.com/product/10086',
  cart: 'https://shop.example.com/cart',
  confirm: 'https://shop.example.com/order/confirm',
}

function navNodes(): SeedReplayNode[] {
  return [
    { tag: 'header', cls: 'topbar', rect: { x: 0, y: 0, w: 100, h: 8 }, text: 'Vigil Shop' },
    { tag: 'a', cls: 'nav', rect: { x: 4, y: 2, w: 8, h: 4 }, text: '首页' },
    { tag: 'a', cls: 'nav', rect: { x: 14, y: 2, w: 8, h: 4 }, text: '商品' },
    { tag: 'a', cls: 'nav', rect: { x: 24, y: 2, w: 10, h: 4 }, text: '购物车' },
  ]
}

const SCENARIOS: SeedScenario[] = [
  {
    sessionId: 'demo-s-cart-500',
    browser: 'Chrome',
    os: 'Windows',
    error: { kind: 'http', level: 'error', message: 'POST /api/order/submit -> 500 (1203ms)' },
    frames: [
      { type: 'snapshot', url: DEMO_PAGES.cart, t: 0,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '我的购物车' },
          { tag: 'div', cls: 'goods', rect: { x: 6, y: 20, w: 60, h: 18 }, text: '机械键盘 ×1  ¥399' },
          { tag: 'button', id: 'btn-checkout', cls: 'btn primary', rect: { x: 6, y: 42, w: 28, h: 8 }, text: '去结算' }] },
      { type: 'click', url: DEMO_PAGES.cart, t: 1200,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '我的购物车' },
          { tag: 'button', id: 'btn-checkout', cls: 'btn primary active', rect: { x: 6, y: 42, w: 28, h: 8 }, text: '去结算' }] },
      { type: 'route', url: DEMO_PAGES.confirm, t: 1700,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '订单确认' },
          { tag: 'input', id: 'addr', cls: 'field', rect: { x: 6, y: 22, w: 60, h: 8 } },
          { tag: 'button', id: 'btn-submit', cls: 'btn primary', rect: { x: 6, y: 34, w: 28, h: 8 }, text: '提交订单' }] },
      { type: 'input', url: DEMO_PAGES.confirm, t: 2700,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '订单确认' },
          { tag: 'input', id: 'addr', cls: 'field filled', rect: { x: 6, y: 22, w: 60, h: 8 }, value: '北京市朝阳区建国路88号' },
          { tag: 'button', id: 'btn-submit', cls: 'btn primary', rect: { x: 6, y: 34, w: 28, h: 8 }, text: '提交订单' }] },
      { type: 'click', url: DEMO_PAGES.confirm, t: 3500,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '订单确认' },
          { tag: 'input', id: 'addr', cls: 'field filled', rect: { x: 6, y: 22, w: 60, h: 8 }, value: '北京市朝阳区建国路88号' },
          { tag: 'button', id: 'btn-submit', cls: 'btn primary loading', rect: { x: 6, y: 34, w: 28, h: 8 }, text: '提交中…' }] },
      { type: 'snapshot', url: DEMO_PAGES.confirm, t: 4300,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '订单确认' },
          { tag: 'div', cls: 'alert error', rect: { x: 6, y: 20, w: 70, h: 8 }, text: '网络错误：提交订单失败 (500)' },
          { tag: 'button', id: 'btn-submit', cls: 'btn primary', rect: { x: 6, y: 32, w: 28, h: 8 }, text: '重新提交' }] },
    ],
  },
  {
    sessionId: 'demo-s-whitescreen',
    browser: 'Safari',
    os: 'iOS',
    error: { kind: 'whiteScreen', level: 'fatal', message: 'White screen detected on /order/confirm' },
    frames: [
      { type: 'snapshot', url: DEMO_PAGES.confirm, t: 0,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '订单确认' },
          { tag: 'div', cls: 'card', rect: { x: 6, y: 20, w: 60, h: 30 }, text: '加载中…' }] },
      { type: 'snapshot', url: DEMO_PAGES.confirm, t: 1500,
        nodes: [...navNodes(),
          { tag: 'div', cls: 'empty', rect: { x: 10, y: 30, w: 80, h: 30 }, text: '（页面空白 / 白屏）' }] },
    ],
  },
  {
    sessionId: 'demo-s-browse',
    browser: 'Edge',
    os: 'macOS',
    frames: [
      { type: 'snapshot', url: DEMO_PAGES.home, t: 0,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: 'Vigil Shop 首页' },
          { tag: 'div', cls: 'banner', rect: { x: 6, y: 20, w: 60, h: 16 }, text: '新人专享 · 满199减50' }] },
      { type: 'click', url: DEMO_PAGES.home, t: 900,
        nodes: [...navNodes(),
          { tag: 'div', cls: 'banner active', rect: { x: 6, y: 20, w: 60, h: 16 }, text: '新人专享 · 满199减50' }] },
      { type: 'route', url: DEMO_PAGES.product, t: 1400,
        nodes: [...navNodes(),
          { tag: 'h1', cls: 'title', rect: { x: 6, y: 12, w: 60, h: 6 }, text: '机械键盘' },
          { tag: 'button', id: 'btn-buy', cls: 'btn primary', rect: { x: 6, y: 40, w: 28, h: 8 }, text: '加入购物车' }] },
    ],
  },
]

function behaviorEvent(s: SeedScenario, f: SeedReplayFrame, ts: number) {
  return {
    eventId: `seed-replay-${s.sessionId}-${f.t}-${Math.random().toString(36).slice(2, 7)}`,
    appId: APP_ID,
    kind: 'behavior' as const,
    ts: new Date(ts),
    sessionId: s.sessionId,
    url: f.url,
    browser: s.browser,
    os: s.os,
    device: s.os === 'iOS' || s.os === 'Android' ? 'Mobile' : 'Desktop',
    payload: JSON.stringify({ name: 'replay', extra: f }),
  }
}

async function seedReplaySessions(): Promise<void> {
  const base = Date.now() - 30 * 60 * 1000
  for (const s of SCENARIOS) {
    for (const f of s.frames) {
      await prisma.event.create({ data: behaviorEvent(s, f, base + f.t) })
    }
    if (s.error) {
      const last = s.frames[s.frames.length - 1]
      await prisma.event.create({
        data: {
          eventId: `seed-err-${s.sessionId}`,
          appId: APP_ID,
          kind: 'error',
          ts: new Date(base + (last?.t ?? 0)),
          sessionId: s.sessionId,
          url: last?.url ?? DEMO_PAGES.home,
          browser: s.browser,
          os: s.os,
          device: s.os === 'iOS' || s.os === 'Android' ? 'Mobile' : 'Desktop',
          errorKind: s.error.kind,
          level: s.error.level,
          fingerprint: `demo-${s.sessionId}`,
          release: RELEASE,
          environment: 'production',
          payload: JSON.stringify({ kind: 'error', errorKind: s.error.kind, level: s.error.level, message: s.error.message, url: last?.url }),
        },
      })
    }
  }
  console.log(`[vigil] 演示会话回放：${SCENARIOS.length} 个会话（含错误 ${SCENARIOS.filter((s) => s.error).length} 个）`)
}

async function seedAlertRules(): Promise<void> {
  await prisma.alertRule.createMany({
    data: [
      { appId: APP_ID, type: 'new_issue', threshold: 1, webhook: DEMO_WEBHOOK },
      { appId: APP_ID, type: 'error_spike', threshold: 3, webhook: DEMO_WEBHOOK },
      { appId: APP_ID, type: 'perf_degrade', threshold: 2, webhook: DEMO_WEBHOOK },
    ],
  })
  console.log('[vigil] 演示告警规则：new_issue / error_spike / perf_degrade 各 1 条')
}

async function main(): Promise<void> {
  console.log('[vigil] 清理旧演示数据...')
  await prisma.alertRule.deleteMany({ where: { appId: APP_ID } })
  await prisma.event.deleteMany({ where: { appId: APP_ID } })
  await prisma.issueUser.deleteMany({ where: { appId: APP_ID } })
  await prisma.issue.deleteMany({ where: { appId: APP_ID } })
  await prisma.project.upsert({
    where: { appId: APP_ID },
    create: { appId: APP_ID, name: '演示商城 Web', platform: 'web' },
    update: {},
  })

  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  console.log('[vigil] 生成近 7 天数据...')

  for (let d = 6; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      // 每天 10-22 点为流量高峰
      const factor = h >= 10 && h <= 22 ? 1 : 0.25
      // 最后一天制造一次突增，用于演示告警
      const spike = d === 0 && h >= 14 && h <= 16 ? 6 : 1
      const count = Math.round(6 * factor * spike * (0.6 + Math.random() * 0.8))

      for (let i = 0; i < count; i++) {
        const ts = new Date(now - d * DAY - (23 - h) * 60 * 60 * 1000 - Math.floor(Math.random() * 3600) * 1000)
        const [browser, browserVersion] = pick(BROWSERS)
        const os = pick(OS_LIST)
        const url = pick(PAGES)
        const sessionId = `s-${hash(browser + os + i + d + h)}`

        // 70% 概率写错误事件，其余写性能事件
        if (Math.random() < 0.7) {
          const tpl = weightedError()
          const fingerprint = hash(`${tpl.kind}|${tpl.message}`)
          const issue = await prisma.issue.upsert({
            where: { appId_fingerprint: { appId: APP_ID, fingerprint } },
            create: {
              appId: APP_ID,
              fingerprint,
              errorKind: tpl.kind,
              level: tpl.level,
              title: tpl.message.slice(0, 500),
              culprit: tpl.stack ? tpl.stack.split('\n')[1]?.trim() : undefined,
              stack: tpl.stack,
              firstSeen: ts,
              lastSeen: ts,
            },
            update: {},
          })

          await prisma.event.create({
            data: {
              eventId: `seed-${d}-${h}-${i}-${Math.random().toString(36).slice(2, 8)}`,
              appId: APP_ID,
              kind: 'error',
              ts,
              issueId: issue.id,
              fingerprint,
              errorKind: tpl.kind,
              level: tpl.level,
              release: RELEASE,
              environment: 'production',
              sessionId,
              url: `https://shop.example.com${url}`,
              browser,
              os,
              device: os === 'iOS' || os === 'Android' ? 'Mobile' : 'Desktop',
              payload: JSON.stringify({
                kind: 'error',
                errorKind: tpl.kind,
                level: tpl.level,
                message: tpl.message,
                stack: tpl.stack,
                fingerprint,
                url: `https://shop.example.com${url}`,
                device: { browser, browserVersion, os, device: 'Desktop', ua: `${browser}/${browserVersion}` },
                breadcrumbs: [
                  { type: 'navigation', message: `navigate to ${url}`, ts: ts.getTime() - 3000 },
                  { type: 'click', message: 'click button.submit#pay', ts: ts.getTime() - 1500 },
                  { type: 'http', message: `GET /api/order/list 500 (1203ms)`, ts: ts.getTime() - 800 },
                ],
              }),
            },
          })

          await prisma.issueUser
            .upsert({
              where: { appId_fingerprint_sessionId: { appId: APP_ID, fingerprint, sessionId } },
              create: { appId: APP_ID, fingerprint, sessionId },
              update: {},
            })
            .catch(() => undefined)
        } else {
          const names = ['LCP', 'FCP', 'CLS', 'INP', 'TTFB']
          const name = pick(names)
          const base = name === 'CLS' ? 0.08 : name === 'TTFB' ? 420 : name === 'INP' ? 120 : name === 'FCP' ? 1200 : 1900
          const value = Number((base * (0.6 + Math.random() * 1.2)).toFixed(3))
          await prisma.event.create({
            data: {
              eventId: `seed-p-${d}-${h}-${i}-${Math.random().toString(36).slice(2, 8)}`,
              appId: APP_ID,
              kind: 'performance',
              ts,
              perfName: name,
              perfValue: value,
              perfRating: value <= base ? 'good' : value <= base * 1.8 ? 'needs-improvement' : 'poor',
              release: RELEASE,
              environment: 'production',
              sessionId,
              url: `https://shop.example.com${url}`,
              browser,
              os,
              device: 'Desktop',
              payload: JSON.stringify({ kind: 'performance', name, value, rating: 'good' }),
            },
          })
        }
      }
    }
  }

  // 刷新聚合计数
  const issues = await prisma.issue.findMany({ where: { appId: APP_ID } })
  for (const issue of issues) {
    const [eventCount, userCount] = await Promise.all([
      prisma.event.count({ where: { issueId: issue.id } }),
      prisma.issueUser.count({ where: { appId: APP_ID, fingerprint: issue.fingerprint } }),
    ])
    const last = await prisma.event.findFirst({ where: { issueId: issue.id }, orderBy: { ts: 'desc' } })
    await prisma.issue.update({
      where: { id: issue.id },
      data: { eventCount, userCount, lastSeen: last?.ts ?? issue.lastSeen },
    })
  }

  // 生成可控的演示会话（含「出错前操作路径」），让会话回放页有干净、可讲解的内容
  await seedReplaySessions()
  // 生成演示用告警规则，让告警配置页非空、答辩时可讲解三类规则
  await seedAlertRules()

  const totalEvents = await prisma.event.count({ where: { appId: APP_ID } })
  console.log(`[vigil] 完成：${issues.length} 个 issue，${totalEvents} 条事件`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
