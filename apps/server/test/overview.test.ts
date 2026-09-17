import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/db'
import { hashPassword } from '../src/services/auth'

let app: FastifyInstance
let token = ''
const APP = `ov_${Date.now()}`

const ADMIN = { username: 'test_admin', password: 'test_pass_123' }

test.before(async () => {
  app = await buildApp()
  await app.ready()
  await prisma.user.upsert({
    where: { username: ADMIN.username },
    update: { passwordHash: hashPassword(ADMIN.password), role: 'admin', enabled: true },
    create: {
      username: ADMIN.username,
      passwordHash: hashPassword(ADMIN.password),
      name: 'test-admin',
      role: 'admin',
    },
  })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN })
  token = login.json().data.token

  // 预置若干错误事件，让概览有统计依据
  for (let i = 0; i < 3; i++) {
    await app.inject({
      method: 'POST',
      url: '/api/report',
      payload: {
        events: [
          {
            kind: 'error',
            appId: APP,
            fingerprint: `fp_${i}_${Date.now()}`,
            message: 'boom',
            level: 'error',
            errorKind: 'js',
            stack: 'at f (https://x/index.js:1:0)',
            release: '1.0.0',
            ts: Date.now(),
            sessionId: `s${i}`,
          },
        ],
      },
    })
  }
})

test.after(async () => {
  await app.close()
})

test('未登录获取概览返回 401', async () => {
  const res = await app.inject({ method: 'GET', url: `/api/overview?appId=${APP}` })
  assert.equal(res.statusCode, 401)
})

test('概览返回核心指标', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/overview?appId=${APP}`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 200)
  const data = res.json().data as Record<string, unknown>
  assert.ok('summary' in data)
  assert.ok('trend' in data)
  assert.ok('topIssues' in data)
  assert.ok('browsers' in data)
  const summary = data.summary as { errorCount: number }
  assert.ok(summary.errorCount >= 1)
})
