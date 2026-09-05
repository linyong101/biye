/** 相对时间：3 分钟前 */
export function fromNow(input: string | number | Date): string {
  const ts = typeof input === 'number' ? input : new Date(input).getTime()
  const diff = Date.now() - ts
  if (diff < 0) return '刚刚'
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

export function formatTime(input: string | number | Date): string {
  return new Date(input).toLocaleString('zh-CN', { hour12: false })
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export const LEVEL_STYLE: Record<string, string> = {
  fatal: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  error: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',
  warning: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  info: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
}

export const LEVEL_LABEL: Record<string, string> = {
  fatal: '致命',
  error: '错误',
  warning: '警告',
  info: '提示',
}

export const KIND_LABEL: Record<string, string> = {
  js: 'JS 异常',
  promise: 'Promise',
  resource: '资源加载',
  http: '接口错误',
  whiteScreen: '白屏',
  custom: '自定义',
}

export const RATING_STYLE: Record<string, string> = {
  good: 'text-emerald-300',
  'needs-improvement': 'text-amber-300',
  poor: 'text-rose-300',
}

/** Web Vitals 官方阈值，用于给指标打健康标签 */
export const VITALS_THRESHOLD: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  FCP: [1800, 3000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
}
