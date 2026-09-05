import { buildApp } from './app'
import { checkErrorSpike } from './services/alerts'
import { ensureDefaultAdmin } from './services/auth'
import { prisma } from './db'

const PORT = Number(process.env.PORT ?? 3001)

async function bootstrap(): Promise<void> {
  const app = await buildApp()

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
