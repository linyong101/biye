import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export interface SessionSummary {
  sessionId: string
  lastTs: number
  page: string
  frameCount: number
  eventCount: number
  hasError: boolean
}

/**
 * 会话回放接口。
 * 回放帧在上报时被存为 `behavior` 事件（name = 'replay'，帧数据在 payload.extra），
 * 这里按 sessionId 聚合，便于看板列出「会话」并进入逐帧回放。
 */
export async function registerSessionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sessions', async (request) => {
    const { appId = 'demo-shop', limit = '50' } = request.query as { appId?: string; limit?: string }
    const take = Math.min(Number(limit) || 50, 200)

    const behaviorEvents = await prisma.event.findMany({
      where: { appId, kind: 'behavior' },
      orderBy: { ts: 'desc' },
      take: 2000,
      select: { sessionId: true, ts: true, url: true, payload: true },
    })

    const errorRows = await prisma.event.findMany({
      where: { appId, kind: 'error' },
      select: { sessionId: true },
      distinct: ['sessionId'],
    })
    const errorSessions = new Set((errorRows.map((e) => e.sessionId).filter(Boolean) as string[]))

    const map = new Map<string, SessionSummary>()
    for (const e of behaviorEvents) {
      const sid = e.sessionId
      if (!sid) continue
      let payload: Record<string, unknown> | null = null
      try {
        payload = JSON.parse(e.payload) as Record<string, unknown>
      } catch {
        continue
      }
      if (payload?.name !== 'replay') continue

      const ts = e.ts.getTime()
      const existing = map.get(sid)
      if (!existing) {
        map.set(sid, {
          sessionId: sid,
          lastTs: ts,
          page: e.url ?? '',
          frameCount: 1,
          eventCount: 1,
          hasError: errorSessions.has(sid),
        })
      } else {
        existing.frameCount += 1
        existing.eventCount += 1
        if (ts > existing.lastTs) existing.lastTs = ts
      }
    }

    const items = [...map.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, take)
    return { ok: true, data: { items, total: items.length } }
  })

  app.get('/api/sessions/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string }
    const { appId = 'demo-shop' } = request.query as { appId?: string }

    const rows = await prisma.event.findMany({
      where: { appId, sessionId },
      orderBy: { ts: 'asc' },
      select: { id: true, kind: true, ts: true, url: true, payload: true },
    })

    const events = rows.map((e) => {
      let payload: Record<string, unknown> | null = null
      try {
        payload = JSON.parse(e.payload) as Record<string, unknown>
      } catch {
        payload = null
      }
      const isReplay = payload?.name === 'replay'
      return {
        id: e.id,
        kind: e.kind,
        ts: e.ts.getTime(),
        url: e.url,
        level: e.level,
        title: e.title,
        message: e.message,
        frame: isReplay ? (payload?.extra as Record<string, unknown> | null) : null,
      }
    })

    return { ok: true, data: { sessionId, events } }
  })
}
