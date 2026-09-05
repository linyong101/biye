import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeFingerprint, normalizeMessage } from '../src/core/fingerprint.ts'

/**
 * 错误指纹算法测试。
 *
 * 这是本项目的核心创新点：既要保证同类错误被合并，又要避免不同根因被误合并。
 * 这两条边界必须同时被测试覆盖，否则算法调整时很容易悄悄退化。
 */
describe('normalizeMessage 消息归一化', () => {
  it('应将数字泛化为 N', () => {
    assert.equal(normalizeMessage('Cannot read user 12345'), 'Cannot read user N')
  })

  it('应将 URL 中的数字路径段泛化', () => {
    assert.equal(normalizeMessage('GET /api/order/9987/detail'), 'GET /api/order/N/detail')
  })

  it('应将打包产物的 hash 串泛化为 H', () => {
    assert.equal(normalizeMessage('chunk vendors-a1b2c3d4e5f6 failed'), 'chunk vendors-H failed')
  })

  it('应将引号内容泛化为 S，避免具体文案造成拆分', () => {
    assert.equal(normalizeMessage('load user "zhangsan" failed'), 'load user S failed')
  })

  it('应将连续空白压缩为单个空格', () => {
    assert.equal(normalizeMessage('error   occurred\n\tat page'), 'error occurred at page')
  })
})

describe('makeFingerprint 指纹生成', () => {
  const stack = `TypeError: x is not a function
    at calcTotal (src/utils/cart.ts:28:19)
    at Cart.render (src/views/Cart.tsx:57:24)`

  it('相同错误、仅数字不同，应生成相同指纹', () => {
    const a = makeFingerprint('js', 'Cannot read properties of undefined (reading price) id=12345', stack)
    const b = makeFingerprint('js', 'Cannot read properties of undefined (reading price) id=67890', stack)
    assert.equal(a, b)
  })

  it('打包文件名 hash 不同，应生成相同指纹', () => {
    const a = makeFingerprint('http', 'GET /assets/index-a1b2c3d4.js -> 500', stack)
    const b = makeFingerprint('http', 'GET /assets/index-ffff00ab.js -> 500', stack)
    assert.equal(a, b)
  })

  it('错误信息不同，应生成不同指纹', () => {
    const a = makeFingerprint('js', 'Cannot read properties of undefined', stack)
    const b = makeFingerprint('js', 'Cannot read properties of null', stack)
    assert.notEqual(a, b)
  })

  it('错误类型不同，应生成不同指纹', () => {
    const a = makeFingerprint('js', 'request failed', stack)
    const b = makeFingerprint('promise', 'request failed', stack)
    assert.notEqual(a, b)
  })

  it('堆栈首帧不同，应生成不同指纹', () => {
    const a = makeFingerprint('js', 'TypeError: undefined', 'at calcTotal (src/utils/cart.ts:28:19)')
    const b = makeFingerprint('js', 'TypeError: undefined', 'at fetchOrder (src/api/order.ts:15:11)')
    assert.notEqual(a, b)
  })

  it('应忽略 node_modules 中的堆栈帧，定位到业务代码', () => {
    const withLib = `TypeError: boom
    at node_modules/react-dom/index.js:1:2
    at calcTotal (src/utils/cart.ts:28:19)`
    const withoutLib = `TypeError: boom
    at calcTotal (src/utils/cart.ts:28:19)`
    assert.equal(makeFingerprint('js', 'TypeError: boom', withLib), makeFingerprint('js', 'TypeError: boom', withoutLib))
  })

  it('无堆栈时也应能生成稳定指纹', () => {
    assert.equal(makeFingerprint('resource', 'img load failed'), makeFingerprint('resource', 'img load failed'))
  })
})
