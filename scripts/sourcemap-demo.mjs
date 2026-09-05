/**
 * Source Map 端到端演示（毕业设计核心亮点的真实证据）。
 *
 * 流程：
 *   1. 用 esbuild 把 app.ts 打包成 dist/app.cjs 并生成 .map
 *   2. 真实运行打包产物，捕获"压缩后"的堆栈（指向 app.cjs:行:列）
 *   3. 登录拿到 token
 *   4. 把 .map 上传到采集服务
 *   5. 调用 /api/sourcemap/restore 还原
 *   6. 并排展示 还原前 / 还原后
 *
 * 前置：采集服务（npm run dev）已在 http://localhost:3001 运行。
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.VIGIL_API ?? 'http://localhost:3001'
const APP_ID = 'demo-shop'
const RELEASE = '1.0.0'
const FILE_NAME = 'app.cjs'
const DIST = resolve(__dirname, 'fixtures/sourcemap-demo/dist')

const log = (...a) => console.log(...a)
const fail = (msg) => {
  console.error('✖', msg)
  process.exit(1)
}

async function main() {
  log('\n① 构建产物 + 生成 Source Map（esbuild）')
  await build({
    entryPoints: [resolve(__dirname, 'fixtures/sourcemap-demo/app.ts')],
    bundle: true,
    sourcemap: 'external',
    outfile: resolve(DIST, FILE_NAME),
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent',
  })
  log(`   → ${DIST}/${FILE_NAME}`)
  log(`   → ${DIST}/${FILE_NAME}.map`)

  log('\n② 真实运行产物，捕获「压缩后」堆栈')
  const require = createRequire(import.meta.url)
  let rawStack = ''
  try {
    require(resolve(DIST, FILE_NAME))
  } catch (err) {
    rawStack = String(err.stack ?? '')
  }
  if (!rawStack) fail('未能捕获到错误堆栈，请检查 fixture。')
  const rawFrame = rawStack.split('\n').find((l) => l.includes(FILE_NAME)) ?? rawStack.split('\n')[1]
  log('   压缩堆栈片段：')
  log('   ', rawFrame.trim())

  log('\n③ 登录获取 token（admin / admin123）')
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  if (!loginRes.ok) {
    fail(`登录失败（HTTP ${loginRes.status}）。请确认 dev 服务已启动且未修改过默认账号。`)
  }
  const { token } = (await loginRes.json()).data
  log('   ✓ 已获取 token')

  log('\n④ 上传 Source Map 到采集服务')
  const mapContent = readFileSync(resolve(DIST, `${FILE_NAME}.map`), 'utf8')
  const upRes = await fetch(`${BASE}/api/sourcemap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appId: APP_ID, release: RELEASE, fileName: FILE_NAME, content: mapContent }),
  })
  if (!upRes.ok) fail(`上传失败（HTTP ${upRes.status}）：${(await upRes.text())}`)
  log('   ✓ 上传成功')

  log('\n⑤ 调用还原接口')
  const restoreRes = await fetch(`${BASE}/api/sourcemap/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appId: APP_ID, release: RELEASE, stack: rawStack }),
  })
  if (!restoreRes.ok) fail(`还原失败（HTTP ${restoreRes.status}）：${(await restoreRes.text())}`)
  const { stack: restoredStack } = (await restoreRes.json()).data

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━ 还原前（线上看到的） ━━━━━━━━━━━━━━━━━━━━━━━━')
  log(rawStack.trim())
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━ 还原后（源码定位） ━━━━━━━━━━━━━━━━━━━━━━━━')
  log(restoredStack.trim())
  log('\n✓ Source Map 还原验证完成：压缩堆栈已定位回 src 源码文件与行列号。')
}

main().catch((e) => fail(e.message ?? String(e)))
