import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerReportRoutes } from './routes/report'
import { registerOverviewRoutes } from './routes/overview'
import { registerIssueRoutes } from './routes/issues'
import { registerProjectRoutes } from './routes/projects'
import { registerSourceMapRoutes } from './routes/sourcemap'
import { registerAiRoutes } from './routes/ai'
import { registerAuthRoutes } from './routes/auth'
import { checkErrorSpike } from './services/alerts'
import { ensureDefaultAdmin, getUserFromRequest } from './services/auth'
import { prisma } from './db'

/** 无需登录即可访问的接口：健康检查、SDK 上报、登录与首个账号注册 */
const PUBLIC_PATHS = ['/api/health', '/api/report', '/api/auth/login', '/api/auth/register']

const PORT = Number(process.env.PORT ?? 3001)
const ORIGIN = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:5173'

async function bootstrap(): Promise<void> {
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

  // 每 5 分钟检查一次错误量突增
  setInterval(() => {
    void prisma.project.findMany({ select: { appId: true } }).then((projects) => {
      for (const p of projects) void checkErrorSpike(p.appId)
    })
  }, 5 * 60 * 1000).unref()

  // 首次启动时创建默认管理员（admin / admin123）
  await ensureDefaultAdmin()

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`\n  Vigil 采集服务已启动  →  http://localhost:${PORT}`)
    console.log(`  上报地址：POST http://localhost:${PORT}/api/report\n`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void bootstrap()
