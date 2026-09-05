import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

const RANGE_MAP: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

function rangeStart(range: string): Date {
  return new Date(Date.now() - (RANGE_MAP[range] ?? RANGE_MAP['24h']))
}

/** 计算分位数（P50 / P75 / P95） */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export async function registerOverviewRoutes(app: FastifyInstance): Promise<void> {
  /** 看板概览：核心指标 + 趋势 + 分布 */
  app.get('/api/overview', async (request) => {
    const { appId = 'demo-shop', range = '24h' } = request.query as { appId?: string; range?: string }
    const start = rangeStart(range)

    const [errorEvents, perfEvents, issues, allEvents] = await Promise.all([
      prisma.event.findMany({
        where: { appId, kind: 'error', ts: { gte: start } },
        select: { ts: true, level: true, sessionId: true },
      }),
      prisma.event.findMany({
        where: { appId, kind: 'performance', ts: { gte: start } },
        select: { perfName: true, perfValue: true, perfRating: true },
      }),
      prisma.issue.findMany({
        where: { appId },
        orderBy: { lastSeen: 'desc' },
        take: 100,
      }),
      prisma.event.findMany({
        where: { appId, ts: { gte: start } },
        select: { ts: true, kind: true, browser: true, os: true, device: true, url: true, sessionId: true },
      }),
    ])

    const uniqueUsers = new Set(errorEvents.map((e) => e.sessionId).filter(Boolean)).size

    // 趋势：按时间桶聚合（桶大小随范围自适应）
    const bucketMs = range === '1h' ? 5 * 60 * 1000 : range === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    const buckets = buildBuckets(allEvents, start, Date.now(), bucketMs)

    // 性能指标统计
    const perfStats = buildPerfStats(perfEvents)

    // 维度分布
    const distribution = countBy(allEvents, (e) => e.browser ?? 'Unknown')

    const topIssues = issues
      .filter((i) => i.status === 'unresolved')
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        title: i.title,
        culprit: i.culprit,
        level: i.level,
        errorKind: i.errorKind,
        eventCount: i.eventCount,
        userCount: i.userCount,
        lastSeen: i.lastSeen,
      }))

    return {
      ok: true,
      data: {
        summary: {
          errorCount: errorEvents.length,
          issueCount: issues.filter((i) => i.status === 'unresolved').length,
          affectedUsers: uniqueUsers,
          pvCount: allEvents.filter((e) => e.kind === 'behavior').length,
        },
        trend: buckets,
        perf: perfStats,
        topIssues,
        browsers: distribution,
      },
    }
  })
}

function buildBuckets(
  events: Array<{ ts: Date; kind: string }>,
  start: number,
  end: number,
  bucketMs: number,
): Array<{ time: number; error: number; performance: number; total: number }> {
  const map = new Map<number, { time: number; error: number; performance: number; total: number }>()
  const first = Math.floor(start / bucketMs) * bucketMs
  for (let t = first; t <= end; t += bucketMs) {
    map.set(t, { time: t, error: 0, performance: 0, total: 0 })
  }
  for (const e of events) {
    const key = Math.floor(e.ts.getTime() / bucketMs) * bucketMs
    const bucket = map.get(key)
    if (!bucket) continue
    bucket.total++
    if (e.kind === 'error') bucket.error++
    if (e.kind === 'performance') bucket.performance++
  }
  return [...map.values()].sort((a, b) => a.time - b.time)
}

function buildPerfStats(events: Array<{ perfName: string | null; perfValue: number | null }>) {
  const byName = new Map<string, number[]>()
  for (const e of events) {
    if (!e.perfName || e.perfValue == null) continue
    const arr = byName.get(e.perfName) ?? []
    arr.push(e.perfValue)
    byName.set(e.perfName, arr)
  }

  const result: Record<string, { p50: number; p75: number; p95: number; count: number }> = {}
  for (const [name, values] of byName) {
    const sorted = values.slice().sort((a, b) => a - b)
    result[name] = {
      p50: round(percentile(sorted, 50)),
      p75: round(percentile(sorted, 75)),
      p95: round(percentile(sorted, 95)),
      count: sorted.length,
    }
  }
  return result
}

function countBy<T>(items: T[], key: (item: T) => string): Array<{ name: string; value: number }> {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

const round = (n: number) => Number(n.toFixed(2))
