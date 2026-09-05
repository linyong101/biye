import type { DeviceInfo, Level } from '../types'

/** 生成唯一事件 ID（不依赖 crypto，兼容老浏览器） */
export function uuid(): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}

/** 稳定会话 ID：同一标签页会话内复用 */
export function getSessionId(): string {
  const KEY = 'vigil:sid'
  try {
    let sid = sessionStorage.getItem(KEY)
    if (!sid) {
      sid = uuid()
      sessionStorage.setItem(KEY, sid)
    }
    return sid
  } catch {
    return uuid()
  }
}

/** djb2 字符串哈希，用于生成错误指纹 */
export function hash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}

/** 简易 UA 解析，避免引入 ua-parser 增加体积 */
export function getDeviceInfo(): DeviceInfo {
  const nav = navigator
  const ua = nav.userAgent

  const browsers: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ]
  let browser = 'Unknown'
  let browserVersion = ''
  for (const [re, name] of browsers) {
    const m = ua.match(re)
    if (m) {
      browser = name
      browserVersion = (m[1] || '').split('.')[0]
      break
    }
  }

  const systems: [RegExp, string][] = [
    [/Windows NT/, 'Windows'],
    [/iPhone|iPad|iPod/, 'iOS'],
    [/Android/, 'Android'],
    [/Mac OS X/, 'macOS'],
    [/Linux/, 'Linux'],
  ]
  let os = 'Unknown'
  for (const [re, name] of systems) {
    if (re.test(ua)) {
      os = name
      break
    }
  }

  const device = /Mobile|Android|iPhone|iPad/.test(ua) ? 'Mobile' : 'Desktop'

  return {
    ua,
    browser,
    browserVersion,
    os,
    device,
    language: nav.language,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: window.devicePixelRatio || 1,
  }
}

const DEFAULT_SENSITIVE = ['password', 'token', 'secret', 'authorization', 'idcard', 'phone']

/** 递归脱敏：命中敏感键的值替换为 *** */
export function mask(obj: unknown, extraKeys: string[] = []): unknown {
  const keys = new Set([...DEFAULT_SENSITIVE, ...extraKeys.map((k) => k.toLowerCase())])
  const walk = (val: unknown, depth: number): unknown => {
    if (depth > 6 || val === null || val === undefined) return val
    if (typeof val !== 'object') return val
    if (Array.isArray(val)) return val.map((v) => walk(v, depth + 1))
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = keys.has(k.toLowerCase()) ? '***' : walk(v, depth + 1)
    }
    return out
  }
  return walk(obj, 0)
}

/** 安全取值，任何异常都不允许影响宿主页面 */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const now = () => Date.now()

/** 判断当前事件是否被采样命中 */
export function sampled(rate: number): boolean {
  if (rate >= 1) return true
  if (rate <= 0) return false
  return Math.random() < rate
}

export function levelOf(status: number): Level {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warning'
  return 'info'
}
