import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerReportRoutes } from './routes/report'
import { registerOverviewRoutes } from './routes/overview'
import { registerIssueRoutes } from './routes/issues'
import { registerProjectRoutes } from './routes/projects'
import { registerSourceMapRoutes } from './routes/sourcemap'
import { registerAiRoutes } from './routes/ai'
import { registerAuthRoutes } from './routes/auth'
import { registerSessionsRoutes } from './routes/sessions'
import { getUserFromRequest } from './services/auth'

/** 无需登录即可访问的接口：健康检查、SDK 上报、登录与首个账号注册 */
const PUBLIC_PATHS = ['/api/health', '/api/report', '/api/auth/login', '/api/auth/register']
const ORIGIN = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:5173'

/**
 * 构建 Fastify 应用实例（不含 listen / 定时器 / 默认管理员初始化）。
 * 抽出工厂函数后，测试可以 `const app = await buildApp(); await app.inject(...)`，
 * 直接对路由做接口测试，无需真实监听端口。
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    // 批量上报可能携带多条事件与面包屑，放宽 body 限制
    bodyLimit: 4 * 1024 * 1024,
  })

  await app.register(cors, { origin: [ORIGIN, 'http://localhost:5174'], credentials: true })

  // 全局鉴权：除白名单外，所有 /api 接口需携带 Bearer Token
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]
    if (!path.startsWith('/api/')) return
    if (PUBLIC_PATHS.some((p) => path === p)) return

    if (!getUserFromRequest(request)) {
      return reply.code(401).send({ ok: false, message: '未登录或登录已过期' })
    }
  })

  app.get('/api/health', async () => ({ ok: true, time: Date.now() }))

  await registerReportRoutes(app)
  await registerOverviewRoutes(app)
  await registerIssueRoutes(app)
  await registerProjectRoutes(app)
  await registerSourceMapRoutes(app)
  await registerAiRoutes(app)
  await registerAuthRoutes(app)
  await registerSessionsRoutes(app)

  return app
}

import type { FastifyInstance } from 'fastify'
