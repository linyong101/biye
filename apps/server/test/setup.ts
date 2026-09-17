import { execSync } from 'node:child_process'
import { prisma } from '../src/db'

// 注意：测试库环境变量（NODE_ENV / DATABASE_URL）由 ./test/env.ts 通过 `node --import`
// 在最前面注入，确保早于 PrismaClient 实例化，从而强制连独立的测试库（绝不连 dev.db）。
// 若此处再写 `process.env.DATABASE_URL = ...`，会因 ESM import 提升而晚于 Prisma 初始化，无效。

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
