import { execSync } from 'node:child_process'
import { prisma } from '../src/db'

// 测试环境：指向独立的 SQLite 库，避免污染开发数据
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./prisma/test.db'

// 首次运行前根据 schema 建表（--accept-data-loss 允许测试库重置）
try {
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'ignore' })
} catch {
  // 建表失败不应阻断测试发现，错误会在首次查询时暴露
}

// 每次测试进程启动时清空数据，保证用例幂等，
// 避免上次运行残留的用户导致「注册需管理员」策略拒绝新用户
await prisma.user.deleteMany({})
await prisma.event.deleteMany({})
await prisma.issue.deleteMany({})
await prisma.sourceMap.deleteMany({})
await prisma.alertRule.deleteMany({})
await prisma.project.deleteMany({})
