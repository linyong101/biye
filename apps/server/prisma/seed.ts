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

async function main(): Promise<void> {
  console.log('[vigil] 清理旧演示数据...')
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

  const totalEvents = await prisma.event.count({ where: { appId: APP_ID } })
  console.log(`[vigil] 完成：${issues.length} 个 issue，${totalEvents} 条事件`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
