import type { FastifyInstance } from 'fastify'
import { aiStatus, diagnoseIssue } from '../services/ai'

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  /** 对指定问题执行 AI 根因诊断；已诊断过的默认返回缓存 */
  app.post('/api/ai/diagnose', async (request, reply) => {
    const { issueId, force } = request.body as { issueId?: string; force?: boolean }
    if (!issueId) return reply.code(400).send({ ok: false, message: 'issueId is required' })

    try {
      const result = await diagnoseIssue(issueId, force === true)
      return { ok: true, data: result }
    } catch (err) {
      return reply.code(500).send({ ok: false, message: (err as Error).message })
    }
  })

  /** 查询当前 AI 配置状态，前端据此提示"规则兜底"或"大模型" */
  app.get('/api/ai/status', async () => ({ ok: true, data: aiStatus() }))
}
