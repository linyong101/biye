import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { invalidateCache, restoreStack } from '../services/sourcemap'

export async function registerSourceMapRoutes(app: FastifyInstance): Promise<void> {
  /**
   * 上传 Source Map。
   * 真实落地场景由 CI 调用：
   *   curl -X POST /api/sourcemap -d '{appId, release, fileName, content}'
   */
  app.post('/api/sourcemap', async (request, reply) => {
    const { appId, release, fileName, content } = request.body as {
      appId?: string
      release?: string
      fileName?: string
      content?: string
    }
    if (!appId || !release || !fileName || !content) {
      return reply.code(400).send({ ok: false, message: 'appId / release / fileName / content are required' })
    }

    const record = await prisma.sourceMap.upsert({
      where: { appId_release_fileName: { appId, release, fileName } },
      create: { appId, release, fileName, content },
      update: { content },
    })
    invalidateCache(appId)
    return { ok: true, data: { id: record.id } }
  })

  app.get('/api/sourcemap/:appId', async (request) => {
    const { appId } = request.params as { appId: string }
    const maps = await prisma.sourceMap.findMany({
      where: { appId },
      select: { id: true, release: true, fileName: true, createdAt: true },
    })
    return { ok: true, data: maps }
  })

  /** 在线调试：给一段压缩堆栈，返回还原结果 */
  app.post('/api/sourcemap/restore', async (request, reply) => {
    const { appId, release, stack } = request.body as { appId?: string; release?: string; stack?: string }
    if (!appId || !stack) return reply.code(400).send({ ok: false, message: 'appId / stack are required' })
    const restored = await restoreStack(appId, release ?? 'unknown', stack)
    return { ok: true, data: { stack: restored } }
  })
}
