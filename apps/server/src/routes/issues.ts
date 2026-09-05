import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function registerIssueRoutes(app: FastifyInstance): Promise<void> {
  /** 问题列表：支持按状态 / 等级 / 类型筛选与关键字搜索 */
  app.get('/api/issues', async (request) => {
    const {
      appId = 'demo-shop',
      status,
      level,
      errorKind,
      keyword,
      page = '1',
      pageSize = '20',
      sort = 'lastSeen',
    } = request.query as Record<string, string>

    const where = {
      appId,
      ...(status ? { status } : {}),
      ...(level ? { level } : {}),
      ...(errorKind ? { errorKind } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.issue.findMany({
        where,
        orderBy: sort === 'eventCount' ? { eventCount: 'desc' } : { lastSeen: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      prisma.issue.count({ where }),
    ])

    return { ok: true, data: { items, total, page: Number(page), pageSize: Number(pageSize) } }
  })

  /** 问题详情 + 最近事件 */
  app.get('/api/issues/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const issue = await prisma.issue.findUnique({ where: { id } })
    if (!issue) return reply.code(404).send({ ok: false, message: 'issue not found' })

    const events = await prisma.event.findMany({
      where: { issueId: id },
      orderBy: { ts: 'desc' },
      take: 20,
    })

    // 按维度统计，回答"这个问题影响了谁"
    const [browsers, releases, urls] = await Promise.all([
      groupCount(id, 'browser'),
      groupCount(id, 'release'),
      groupCount(id, 'url'),
    ])

    return {
      ok: true,
      data: {
        ...issue,
        events: events.map((e) => ({ ...e, payload: safeParse(e.payload) })),
        distribution: { browsers, releases, urls },
      },
    }
  })

  /** 修改问题状态：标记已解决 / 忽略 */
  app.patch('/api/issues/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status?: string }
    if (!status || !['unresolved', 'resolved', 'ignored'].includes(status)) {
      return reply.code(400).send({ ok: false, message: 'invalid status' })
    }
    const issue = await prisma.issue.update({ where: { id }, data: { status } })
    return { ok: true, data: issue }
  })
}

async function groupCount(issueId: string, field: 'browser' | 'release' | 'url') {
  const rows = await prisma.event.findMany({
    where: { issueId },
    select: { browser: true, release: true, url: true },
  })
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = String(row[field] ?? 'Unknown')
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
}

function safeParse(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}
