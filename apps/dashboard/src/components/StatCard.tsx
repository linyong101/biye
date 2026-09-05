import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  /** 环比变化，正数红色、负数绿色（错误类指标） */
  delta?: number
  icon?: ReactNode
  accent?: 'brand' | 'rose' | 'amber' | 'emerald' | 'sky'
}

const ACCENT: Record<string, string> = {
  brand: 'from-brand-500/20',
  rose: 'from-rose-500/20',
  amber: 'from-amber-500/20',
  emerald: 'from-emerald-500/20',
  sky: 'from-sky-500/20',
}

export function StatCard({ label, value, hint, delta, icon, accent = 'brand' }: StatCardProps) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${ACCENT[accent]} to-transparent opacity-60`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
          {icon && <span className="text-slate-400">{icon}</span>}
        </div>
        <div className="mt-3 text-3xl font-semibold tabular-nums text-white">{value}</div>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          {delta !== undefined && (
            <span className={delta > 0 ? 'text-rose-300' : delta < 0 ? 'text-emerald-300' : 'text-slate-400'}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)}%
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      </div>
    </div>
  )
}
