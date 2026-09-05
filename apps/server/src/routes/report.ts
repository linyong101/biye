import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { extractCulprit, restoreStack } from '../services/sourcemap'
import { notifyNewIssue } from '../services/alerts'

/** SDK 上报的事件体（与 packages/sdk/src/types.ts 保持一致） */
interface IncomingEvent {
  eventId?: string
  kind: 'error' | 'performance' | 'behavior'
  ts?: number
  appId: string
  release?: string
  environment?: string
  sessionId?: string
  userId?: string
  url?: string
  title?: string
  device?: Record<string, unknown>
  breadcrumbs?: unknown[]
  // error
  errorKind?: string
  level?: string
  message?: string
  stack?: string
  fingerprint?: string
  http?: Record<string, unknown>
  resource?: Record<string, unknown>
  extra?: Record<string, unknown>
  // performance
  name?: string
  value?: number
  rating?: string
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/report', async (request, reply) => {
    const body = request.body as { events?: IncomingEvent[] } | IncomingEvent | null
    if (!body) {
      return reply.code(400).send({ ok: false, message: 'empty body' })
    }

    const events = Array.isArray(body) ? body : Array.isArray((body as { events?: IncomingEvent[] }).events) ? (body as { events: IncomingEvent[] }).events : [body as IncomingEvent]

    let accepted = 0
    // 本批次涉及到的 issue，用于最后一次性刷新计数，避免 N 次写库
    const touchedIssues = new Set<string>()

    for (const ev of events) {
      if (!ev?.appId || !ev?.kind) continue

      await ensureProject(ev.appId)

      const ts = new Date(typeof ev.ts === 'number' ? ev.ts : Date.now())
      let issueId: string | undefined

      if (ev.kind === 'error' && ev.fingerprint) {
        issueId = await upsertIssue(ev, ts, touchedIssues)
      }

      await prisma.event
        .create({
          data: {
            eventId: ev.eventId ?? `${ev.appId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            appId: ev.appId,
            kind: ev.kind,
            ts,
            issueId,
            fingerprint: ev.fingerprint,
            errorKind: ev.errorKind,
            level: ev.level,
            perfName: ev.kind === 'performance' ? ev.name : null,
            perfValue: ev.kind === 'performance' ? ev.value : null,
            perfRating: ev.kind === 'performance' ? ev.rating : null,
            release: ev.release,
            environment: ev.environment,
            sessionId: ev.sessionId,
            userId: ev.userId,
            url: ev.url,
            browser: (ev.device?.browser as string) ?? null,
            os: (ev.device?.os as string) ?? null,
            device: (ev.device?.device as string) ?? null,
            payload: JSON.stringify(ev),
          },
        })
        .catch((err) => {
          // eventId 唯一键冲突（SDK 重投）直接忽略，保证上报幂等
          if (String(err).includes('Unique')) return null
          throw err
        })

      // 记录影响用户（sessionId 去重）
      if (issueId && ev.sessionId && ev.fingerprint) {
        await prisma.issueUser
          .upsert({
            where: {
              appId_fingerprint_sessionId: {
                appId: ev.appId,
                fingerprint: ev.fingerprint,
                sessionId: ev.sessionId,
              },
            },
            create: { appId: ev.appId, fingerprint: ev.fingerprint, sessionId: ev.sessionId },
            update: {},
          })
          .catch(() => undefined)
      }

      accepted++
    }

    // 批次结束后统一刷新计数，显著减少写库次数
    await refreshIssueCounters(touchedIssues)

    return reply.send({ ok: true, accepted })
  })
}

async function ensureProject(appId: string): Promise<void> {
  await prisma.project
    .upsert({
      where: { appId },
      create: { appId, name: appId },
      update: {},
    })
    .catch(() => undefined)
}

async function upsertIssue(ev: IncomingEvent, ts: Date, touched: Set<string>): Promise<string | undefined> {
  if (!ev.fingerprint || !ev.appId) return undefined

  const existing = await prisma.issue.findUnique({
    where: { appId_fingerprint: { appId: ev.appId, fingerprint: ev.fingerprint } },
  })

  if (!existing) {
    const stack = await restoreStack(ev.appId, ev.release ?? 'unknown', ev.stack)
    const created = await prisma.issue.create({
      data: {
        appId: ev.appId,
        fingerprint: ev.fingerprint,
        errorKind: ev.errorKind ?? 'js',
        level: ev.level ?? 'error',
        title: (ev.message ?? 'Unknown error').slice(0, 500),
        culprit: extractCulprit(stack ?? ev.stack),
        stack: stack,
        firstSeen: ts,
        lastSeen: ts,
      },
    })
    touched.add(created.id)
    // 新 issue 触发告警（异步，不阻塞上报）
    void notifyNewIssue(ev.appId, created.id, created.title, created.level, created.stack ?? undefined)
    return created.id
  }

  await prisma.issue.update({
    where: { id: existing.id },
    data: { lastSeen: ts, eventCount: { increment: 1 }, level: ev.level ?? existing.level },
  })
  touched.add(existing.id)
  return existing.id
}

async function refreshIssueCounters(issueIds: Set<string>): Promise<void> {
  for (const id of issueIds) {
    const issue = await prisma.issue.findUnique({ where: { id } })
    if (!issue) continue
    const [eventCount, userCount] = await Promise.all([
      prisma.event.count({ where: { issueId: id } }),
      prisma.issueUser.count({ where: { appId: issue.appId, fingerprint: issue.fingerprint } }),
    ])
    await prisma.issue.update({ where: { id }, data: { eventCount, userCount } })
  }
}
