import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/db'
import { hashPassword } from '../src/services/auth'

let app: FastifyInstance
let token = ''

// 固定管理员凭据：before 中 upsert 保证一定存在，避免多文件共用 test.db 的竞态
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

test('未登录访问 /api/auth/me 返回 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
  assert.equal(res.statusCode, 401)
})

test('管理员带 token 注册新账号返回 200', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { authorization: `Bearer ${token}` },
    payload: { username: `reg_${Date.now()}`, password: 'secret123', name: 'reg' },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().ok, true)
})

test('无 token 注册第二个账号返回 403（仅管理员可创建）', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: `reg2_${Date.now()}`, password: 'secret123', name: 'reg2' },
  })
  assert.equal(res.statusCode, 403)
})

test('密码过短注册返回 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { authorization: `Bearer ${token}` },
    payload: { username: `short_${Date.now()}`, password: '123', name: 'x' },
  })
  assert.equal(res.statusCode, 400)
})

test('正确密码登录返回 token', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN })
  assert.equal(res.statusCode, 200)
  assert.ok(res.json().data.token)
})

test('错误密码登录返回 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: ADMIN.username, password: 'wrong' },
  })
  assert.equal(res.statusCode, 401)
})

test('携带 token 获取当前用户返回 200', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().data.username, ADMIN.username)
})

test('原密码错误时修改密码返回 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/password',
    headers: { authorization: `Bearer ${token}` },
    payload: { oldPassword: 'wrong', newPassword: 'newpass123' },
  })
  assert.equal(res.statusCode, 400)
})

test('原密码正确时修改密码返回 200 且新密码可登录', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/password',
    headers: { authorization: `Bearer ${token}` },
    payload: { oldPassword: ADMIN.password, newPassword: 'newpass_123' },
  })
  assert.equal(res.statusCode, 200)
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: ADMIN.username, password: 'newpass_123' },
  })
  assert.equal(login.statusCode, 200)
  // 还原密码，保证多次运行幂等
  await app.inject({
    method: 'POST',
    url: '/api/auth/password',
    headers: { authorization: `Bearer ${login.json().data.token}` },
    payload: { oldPassword: 'newpass_123', newPassword: ADMIN.password },
  })
})
