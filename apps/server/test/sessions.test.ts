import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

let app: FastifyInstance
let token = ''

test.before(async () => {
  app = await buildApp()
  await app.ready()
  // 会话回放接口需登录。用固定凭据：先尝试登录，失败（库里无用户）则注册，保证幂等
  const creds = { username: 'testadmin', password: 'secret123' }
  let login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: creds })
  if (!login.json().ok) {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: creds.username, password: creds.password, name: 'test' },
    })
    login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: creds })
  }
  token = login.json().data.token
})

test.after(async () => {
  await app.close()
})

test('会话回放：behavior(replay) 帧与 error 聚合成带错误的会话', async () => {
  const appId = `sess-${Date.now()}`
  const sessionId = `s-${Date.now()}`
  const auth = { authorization: `Bearer ${token}` }

  // 上报一帧回放快照
  await app.inject({
    method: 'POST',
    url: '/api/report',
    payload: {
      events: [
        {
          kind: 'behavior',
          name: 'replay',
          appId,
          sessionId,
          ts: Date.now(),
          url: 'https://x.com/a',
          extra: {
            type: 'snapshot',
            url: 'https://x.com/a',
            t: 0,
            nodes: [{ tag: 'button', text: '提交订单', rect: { x: 1, y: 1, w: 2, h: 2 } }],
          },
        },
      ],
    },
  })

  // 同一会话上报一个错误
  await app.inject({
    method: 'POST',
    url: '/api/report',
    payload: {
      events: [
        {
          kind: 'error',
          appId,
          fingerprint: `fp-${Date.now()}`,
          sessionId,
          message: 'boom',
          level: 'error',
          errorKind: 'js',
          stack: 'at f (https://x/index.js:1:0)',
          release: '1.0.0',
          ts: Date.now(),
        },
      ],
    },
  })

  const list = await app.inject({ method: 'GET', url: `/api/sessions?appId=${appId}`, headers: auth })
  const listData = list.json().data as { items: Array<{ sessionId: string; hasError: boolean; frameCount: number }> }
  const sess = listData.items.find((s) => s.sessionId === sessionId)
  assert.ok(sess, '应列出该会话')
  assert.equal(sess!.hasError, true)
  assert.equal(sess!.frameCount, 1)

  const detail = await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}?appId=${appId}`, headers: auth })
  const detailData = detail.json().data as {
    sessionId: string
    events: Array<{ frame: { nodes: Array<{ text: string }> } | null }>
  }
  assert.equal(detailData.sessionId, sessionId)
  const replayEv = detailData.events.find((e) => e.frame)
  assert.ok(replayEv, '详情应包含回放帧')
  assert.equal(replayEv!.frame!.nodes[0].text, '提交订单')
})
