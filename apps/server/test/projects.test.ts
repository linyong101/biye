import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/db'
import { hashPassword } from '../src/services/auth'

let app: FastifyInstance
let token = ''
const APP = `proj_${Date.now()}`

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

test('未登录获取项目列表返回 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects' })
  assert.equal(res.statusCode, 401)
})

test('项目列表返回 200 且为数组', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/projects',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.json().data))
})

test('创建项目缺少 appId 返回 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'x' },
  })
  assert.equal(res.statusCode, 400)
})

test('创建项目返回 200', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { authorization: `Bearer ${token}` },
    payload: { appId: APP, name: 'demo' },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().data.appId, APP)
})

test('告警规则：缺少 webhook 返回 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/alerts',
    headers: { authorization: `Bearer ${token}` },
    payload: { appId: APP, type: 'new_issue' },
  })
  assert.equal(res.statusCode, 400)
})

test('告警规则：创建 / 列表 / 删除 完整流程', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/alerts',
    headers: { authorization: `Bearer ${token}` },
    payload: { appId: APP, type: 'new_issue', threshold: 1, webhook: 'http://hook.example' },
  })
  assert.equal(create.statusCode, 200)
  const ruleId = create.json().data.id

  const list = await app.inject({
    method: 'GET',
    url: `/api/alerts/${APP}`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(list.statusCode, 200)
  assert.ok((list.json().data as Array<{ id: string }>).some((r) => r.id === ruleId))

  const del = await app.inject({
    method: 'DELETE',
    url: `/api/alerts/${ruleId}`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(del.statusCode, 200)
})
