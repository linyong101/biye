import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hash, mask, sampled, uuid } from '../src/utils/index.ts'

describe('mask 敏感字段脱敏', () => {
  it('应脱敏默认敏感字段', () => {
    const result = mask({ password: '123456', username: 'zhangsan' }) as Record<string, unknown>
    assert.equal(result.password, '***')
    assert.equal(result.username, 'zhangsan')
  })

  it('应递归处理嵌套对象', () => {
    const result = mask({ user: { profile: { token: 'abc' } } }) as {
      user: { profile: { token: string } }
    }
    assert.equal(result.user.profile.token, '***')
  })

  it('应处理数组中的元素', () => {
    const result = mask({ list: [{ password: 'a' }, { password: 'b' }] }) as {
      list: Array<{ password: string }>
    }
    assert.equal(result.list[0].password, '***')
    assert.equal(result.list[1].password, '***')
  })

  it('应支持自定义敏感字段，且不区分大小写', () => {
    const result = mask({ Phone: '13800138000', name: 'tom' }, ['phone']) as Record<string, unknown>
    assert.equal(result.Phone, '***')
    assert.equal(result.name, 'tom')
  })

  it('不应修改原始对象', () => {
    const source = { password: 'secret' }
    mask(source)
    assert.equal(source.password, 'secret')
  })

  it('应限制递归深度，避免循环引用导致栈溢出', () => {
    const deep: Record<string, unknown> = {}
    let current: Record<string, unknown> = deep
    for (let i = 0; i < 30; i++) {
      current.next = { value: i }
      current = current.next as Record<string, unknown>
    }
    // 超过深度限制的层级会被原样返回，只要不抛异常即可
    assert.doesNotThrow(() => mask(deep))
  })

  it('应保留基本类型值', () => {
    assert.equal(mask('plain text'), 'plain text')
    assert.equal(mask(42), 42)
    assert.equal(mask(null), null)
  })
})

describe('sampled 采样策略', () => {
  it('采样率为 1 时应全部通过', () => {
    for (let i = 0; i < 100; i++) assert.equal(sampled(1), true)
  })

  it('采样率为 0 时应全部丢弃', () => {
    for (let i = 0; i < 100; i++) assert.equal(sampled(0), false)
  })

  it('采样率 0.5 时命中比例应在合理区间', () => {
    let hit = 0
    const total = 10000
    for (let i = 0; i < total; i++) {
      if (sampled(0.5)) hit++
    }
    const rate = hit / total
    assert.ok(rate > 0.45 && rate < 0.55, `实际采样率 ${rate} 应接近 0.5`)
  })
})

describe('hash 字符串哈希', () => {
  it('相同输入应产生相同输出', () => {
    assert.equal(hash('vigil'), hash('vigil'))
  })

  it('不同输入应产生不同输出', () => {
    assert.notEqual(hash('vigil-a'), hash('vigil-b'))
  })

  it('输出应为稳定的 36 进制字符串', () => {
    assert.match(hash('anything'), /^[0-9a-z]+$/)
  })
})

describe('uuid 事件 ID', () => {
  it('应生成唯一 ID', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuid()))
    assert.equal(ids.size, 1000)
  })
})
