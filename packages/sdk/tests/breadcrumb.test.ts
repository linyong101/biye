import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BreadcrumbStore } from '../src/core/breadcrumb.ts'

/** 面包屑是"复现现场"的关键数据，环形缓冲的正确性直接影响排查效率 */
describe('BreadcrumbStore 行为轨迹存储', () => {
  it('应按插入顺序保留记录', () => {
    const store = new BreadcrumbStore(5)
    store.push({ type: 'click', message: 'a', ts: 1 })
    store.push({ type: 'click', message: 'b', ts: 2 })
    const items = store.drain()
    assert.equal(items.length, 2)
    assert.equal(items[0].message, 'a')
    assert.equal(items[1].message, 'b')
  })

  it('超出容量时应丢弃最旧的记录', () => {
    const store = new BreadcrumbStore(3)
    for (let i = 1; i <= 5; i++) {
      store.push({ type: 'click', message: `step-${i}`, ts: i })
    }
    const items = store.drain()
    assert.equal(items.length, 3)
    assert.equal(items[0].message, 'step-3')
    assert.equal(items[2].message, 'step-5')
  })

  it('drain 应返回副本，外部修改不影响内部状态', () => {
    const store = new BreadcrumbStore(3)
    store.push({ type: 'click', message: 'original', ts: 1 })

    const items = store.drain()
    items[0].message = 'modified'

    assert.equal(store.drain()[0].message, 'original')
  })

  it('clear 应清空所有记录', () => {
    const store = new BreadcrumbStore(3)
    store.push({ type: 'click', message: 'a', ts: 1 })
    store.clear()
    assert.equal(store.drain().length, 0)
  })

  it('容量为 1 时只保留最新一条', () => {
    const store = new BreadcrumbStore(1)
    store.push({ type: 'click', message: 'old', ts: 1 })
    store.push({ type: 'click', message: 'new', ts: 2 })
    const items = store.drain()
    assert.equal(items.length, 1)
    assert.equal(items[0].message, 'new')
  })
})
