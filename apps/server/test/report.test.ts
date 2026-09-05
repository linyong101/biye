import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/db'

let app: FastifyInstance

test.before(async () => {
  app = await buildApp()
  await app.ready()
})

test.after(async () => {
  await app.close()
})

test('POST /api/report 空 body 返回 400', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/report', payload: null })
  assert.equal(res.statusCode, 400)
})

test('POST /api/report 上报错误并聚合为单条 Issue', async () => {
  const appId = `rp-${Date.now()}`
  const fingerprint = `fp-${Date.now()}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/report',
    payload: {
      events: [
        {
          kind: 'error',
          appId,
          fingerprint,
          message: 'boom',
          level: 'error',
          errorKind: 'js',
          release: '1.0.0',
          stack: 'at foo (https://x/index.js:1:0)',
          ts: Date.now(),
          sessionId: 's1',
        },
      ],
    },
  })
  assert.equal(res.json().ok, true)

  const issue = await prisma.issue.findUnique({ where: { appId_fingerprint: { appId, fingerprint } } })
  assert.ok(issue, '应生成 Issue')
  assert.equal(issue!.eventCount, 1)
  assert.equal(issue!.userCount, 1)
})

test('相同 fingerprint 二次上报只更新计数，不新建 Issue', async () => {
  const appId = `rp2-${Date.now()}`
  const fingerprint = `fp2-${Date.now()}`
  const payload = (sess: string) => ({
    events: [
      {
        kind: 'error',
        appId,
        fingerprint,
        message: 'boom',
        level: 'error',
        errorKind: 'js',
        release: '1.0.0',
        stack: 'at foo (https://x/index.js:1:0)',
        ts: Date.now(),
        sessionId: sess,
      },
    ],
  })
  await app.inject({ method: 'POST', url: '/api/report', payload: payload('a') })
  await app.inject({ method: 'POST', url: '/api/report', payload: payload('b') })

  const issue = await prisma.issue.findUnique({ where: { appId_fingerprint: { appId, fingerprint } } })
  assert.ok(issue)
  assert.equal(issue!.eventCount, 2)
  assert.equal(issue!.userCount, 2) // 两个不同 session 应被去重计为 2
})
