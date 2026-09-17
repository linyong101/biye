// 测试环境引导：通过 `node --import` 在最前面加载，确保早于 PrismaClient 实例化。
// 强制指向独立的测试库，绝不连接开发库 dev.db（否则会清空其中的 admin，导致登录过期）。
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'file:./test.db'
export {}
