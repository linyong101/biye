import test from 'node:test'
import assert from 'node:assert/strict'
import { SourceMapGenerator } from 'source-map-js'
import { extractCulprit, restoreStack } from '../src/services/sourcemap'
import { prisma } from '../src/db'

const APP_ID = 'unit-sourcemap'
const RELEASE = 'test-release'

test('extractCulprit 提取堆栈首帧定位信息', () => {
  const stack = 'TypeError: x is not a function\n    at foo (https://cdn.example.com/assets/index-a1b2c3.js:12:34)'
  const culprit = extractCulprit(stack)
  assert.equal(culprit, 'foo @ index-a1b2c3.js:12:34')
})

test('extractCulprit 对空堆栈返回 undefined', () => {
  assert.equal(extractCulprit(undefined), undefined)
  assert.equal(extractCulprit(''), undefined)
})

test('restoreStack 在无 map 时原样返回', async () => {
  const stack = 'at foo (https://x/index.js:1:0)'
  // 使用独立 appId/release，避免与「命中 map」测试共享数据或缓存
  const out = await restoreStack('unit-no-map-app', 'no-release', stack)
  assert.equal(out, stack)
})

test('restoreStack 命中 map 后还原到源码位置', async () => {
  // 保证父项目存在（SourceMap 外键约束），并清理历史数据以便重复运行
  await prisma.project.upsert({ where: { appId: APP_ID }, create: { appId: APP_ID, name: APP_ID }, update: {} })
  await prisma.sourceMap.deleteMany({ where: { appId: APP_ID } })

  // 构造一个最小 source map：生成位置 (index.js:1:0) -> 源码 (src/app.js:42:13, onClick)
  const gen = new SourceMapGenerator({ file: 'index.js' })
  gen.addMapping({
    generated: { line: 1, column: 0 },
    original: { line: 42, column: 13 },
    source: 'src/app.js',
    name: 'onClick',
  })
  await prisma.sourceMap.create({
    data: { appId: APP_ID, release: RELEASE, fileName: 'index.js', content: gen.toString() },
  })

  const stack = 'TypeError: x is not a function\n    at onClick (https://cdn.example.com/assets/index.js:1:0)'
  const out = await restoreStack(APP_ID, RELEASE, stack)
  assert.match(out!, /src\/app\.js:42:13/)
  assert.match(out!, /onClick/)
})
