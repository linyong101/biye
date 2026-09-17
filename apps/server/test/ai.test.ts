import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/db'
import { hashPassword } from '../src/services/auth'

let app: FastifyInstance
let token = ''
const APP = `ai_${Date.now()}`

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
})

test.after(async () => {
  await app.close()
})

async function createIssueId(): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/api/report',
    payload: {
      events: [
        {
          kind: 'error',
          appId: APP,
          fingerprint: `fp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          message: 'Cannot read properties of undefined',
          level: 'error',
          errorKind: 'js',
          stack: 'at f (https://x/index.js:1:0)',
          release: '1.0.0',
          ts: Date.now(),
          sessionId: 's1',
        },
      ],
    },
  })
  const issue = await prisma.issue.findFirst({
    where: { appId: APP },
    orderBy: { lastSeen: 'desc' },
  })
  return issue!.id
}

test('AI 状态接口返回 200', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/ai/status',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 200)
  assert.ok('enabled' in res.json().data)
})

test('诊断缺少 issueId 返回 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/ai/diagnose',
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  })
  assert.equal(res.statusCode, 400)
})

test('诊断真实 issue 返回规则兜底结果（source=rule）', async () => {
  const id = await createIssueId()
  const res = await app.inject({
    method: 'POST',
    url: '/api/ai/diagnose',
    headers: { authorization: `Bearer ${token}` },
    payload: { issueId: id },
  })
  assert.equal(res.statusCode, 200)
  // 测试环境未配置 AI_API_KEY，必然走内置规则库兜底
  assert.equal(res.json().data.source, 'rule')
})

test('诊断不存在的 issue 返回 500', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/ai/diagnose',
    headers: { authorization: `Bearer ${token}` },
    payload: { issueId: 'not_exist_id' },
  })
  assert.equal(res.statusCode, 500)
})
