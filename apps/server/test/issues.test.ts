import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/db'
import { hashPassword } from '../src/services/auth'

let app: FastifyInstance
let token = ''
const APP = `it_${Date.now()}`
let seq = 0
const fp = () => `fp_${process.pid}_${seq++}`

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

async function reportError(): Promise<void> {
  await app.inject({
    method: 'POST',
    url: '/api/report',
    payload: {
      events: [
        {
          kind: 'error',
          appId: APP,
          fingerprint: fp(),
          message: 'boom',
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
}

async function firstIssueId(): Promise<string> {
  const list = await app.inject({
    method: 'GET',
    url: `/api/issues?appId=${APP}`,
    headers: { authorization: `Bearer ${token}` },
  })
  return (list.json().data.items as Array<{ id: string }>)[0].id
}

test('未登录获取 issue 列表返回 401', async () => {
  const res = await app.inject({ method: 'GET', url: `/api/issues?appId=${APP}` })
  assert.equal(res.statusCode, 401)
})

test('上报错误后列表可查到该 issue', async () => {
  await reportError()
  const res = await app.inject({
    method: 'GET',
    url: `/api/issues?appId=${APP}`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 200)
  assert.ok((res.json().data.items as unknown[]).length >= 1)
})

test('issue 详情返回 200', async () => {
  await reportError()
  const id = await firstIssueId()
  const res = await app.inject({
    method: 'GET',
    url: `/api/issues/${id}`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 200)
  assert.ok(res.json().data.id)
})

test('修改 issue 状态为 resolved 返回 200', async () => {
  await reportError()
  const id = await firstIssueId()
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/issues/${id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'resolved' },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().data.status, 'resolved')
})

test('非法状态修改返回 400', async () => {
  await reportError()
  const id = await firstIssueId()
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/issues/${id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'xx' },
  })
  assert.equal(res.statusCode, 400)
})

test('查询不存在的 issue 返回 404', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/issues/not_exist_id`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 404)
})
