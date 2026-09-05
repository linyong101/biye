import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 构建后打印产物体积（含 gzip），体积是 SDK 的硬性 KPI */
// 用脚本自身位置定位，避免受 tsup 工作目录影响
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'sdk', 'dist')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

try {
  if (!existsSync(dist)) process.exit(0)
  const files = walk(dist).filter((f) => /\.(js|cjs)$/.test(f) && !f.endsWith('.map'))
  console.log('\n[vigil] SDK 产物体积')
  for (const f of files) {
    const raw = readFileSync(f)
    const gz = gzipSync(raw).length
    console.log(
      `  ${f.replace(dist, '').padEnd(20)} ${(raw.length / 1024).toFixed(2).padStart(8)} KB  →  gzip ${(gz / 1024).toFixed(2).padStart(7)} KB`,
    )
  }
} catch {
  // dist 不存在时跳过
}
