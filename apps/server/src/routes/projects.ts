import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { issues: true, events: true } } },
    })
    return { ok: true, data: projects }
  })

  app.post('/api/projects', async (request, reply) => {
    const { appId, name, platform } = request.body as { appId?: string; name?: string; platform?: string }
    if (!appId) return reply.code(400).send({ ok: false, message: 'appId is required' })

    const project = await prisma.project.upsert({
      where: { appId },
      create: { appId, name: name ?? appId, platform: platform ?? 'web' },
      update: { name: name ?? appId },
    })
    return { ok: true, data: project }
  })

  /** 告警规则管理 */
  app.get('/api/alerts/:appId', async (request) => {
    const { appId } = request.params as { appId: string }
    const rules = await prisma.alertRule.findMany({ where: { appId } })
    return { ok: true, data: rules }
  })

  app.post('/api/alerts', async (request, reply) => {
    const { appId, type, threshold, webhook } = request.body as {
      appId?: string
      type?: string
      threshold?: number
      webhook?: string
    }
    if (!appId || !type || !webhook) {
      return reply.code(400).send({ ok: false, message: 'appId / type / webhook are required' })
    }
    const rule = await prisma.alertRule.create({
      data: { appId, type, threshold: threshold ?? 1, webhook },
    })
    return { ok: true, data: rule }
  })

  app.delete('/api/alerts/:id', async (request) => {
    const { id } = request.params as { id: string }
    await prisma.alertRule.delete({ where: { id } }).catch(() => undefined)
    return { ok: true }
  })
}
