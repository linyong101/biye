import test from 'node:test'
import assert from 'node:assert/strict'
import { pickReplayNodes, type ElementLike } from '../src/plugins/replay'

function el(p: Partial<ElementLike> & { tagName: string }): ElementLike {
  return {
    tagName: p.tagName,
    textContent: p.textContent ?? '',
    id: p.id ?? '',
    className: p.className ?? '',
    value: p.value,
    getBoundingClientRect:
      p.getBoundingClientRect ??
      (() => ({ left: 0, top: 0, width: 10, height: 10, bottom: 10, right: 10 })),
  }
}

test('pickReplayNodes 将可见元素转为百分比坐标节点', () => {
  const els = [
    el({
      tagName: 'BUTTON',
      textContent: '提交订单',
      className: 'btn-primary',
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 30, bottom: 230, right: 180 }),
    }),
    el({
      tagName: 'INPUT',
      className: 'field',
      value: '13800000000',
      getBoundingClientRect: () => ({ left: 50, top: 100, width: 200, height: 40, bottom: 140, right: 250 }),
    }),
  ]
  const nodes = pickReplayNodes(els, 1000, 1000)
  assert.equal(nodes.length, 2)
  assert.equal(nodes[0].tag, 'button')
  assert.equal(nodes[0].text, '提交订单')
  assert.equal(nodes[0].cls, 'btn-primary')
  assert.deepEqual(nodes[0].rect, { x: 10, y: 20, w: 8, h: 3 })
  assert.equal(nodes[1].tag, 'input')
  assert.equal(nodes[1].value, '13800000000')
})

test('pickReplayNodes 跳过视口外与零尺寸元素', () => {
  const els = [
    el({
      tagName: 'DIV',
      textContent: '视口外',
      getBoundingClientRect: () => ({ left: 0, top: 2000, width: 10, height: 10, bottom: 2010, right: 10 }),
    }),
    el({
      tagName: 'DIV',
      textContent: '零尺寸',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    }),
  ]
  const nodes = pickReplayNodes(els, 1000, 1000)
  assert.equal(nodes.length, 0)
})

test('pickReplayNodes 对交互元素不取文本、输入框取 value', () => {
  const els = [
    el({
      tagName: 'INPUT',
      textContent: '不应出现的文本',
      value: 'hello',
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 20, bottom: 30, right: 110 }),
    }),
  ]
  const nodes = pickReplayNodes(els, 1000, 1000)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0].text, undefined)
  assert.equal(nodes[0].value, 'hello')
})
