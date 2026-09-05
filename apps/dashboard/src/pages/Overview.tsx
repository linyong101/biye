import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { Chart, axisStyle, baseGrid } from '../components/Chart'
import { StatCard } from '../components/StatCard'
import { api } from '../lib/api'
import { KIND_LABEL, LEVEL_LABEL, LEVEL_STYLE, compact, fromNow } from '../lib/format'
import { useAppState } from '../store'

export function Overview() {
  const { appId, range } = useAppState()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['overview', appId, range],
    queryFn: () => api.overview(appId, range),
  })

  const trendOption = useMemo<EChartsOption>(() => {
    const points = data?.trend ?? []
    return {
      tooltip: { trigger: 'axis', backgroundColor: '#111834', borderColor: 'rgba(148,163,184,0.2)', textStyle: { color: '#e2e8f0' } },
      legend: { data: ['异常', '性能上报'], right: 0, textStyle: { color: '#94a3b8', fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
      grid: baseGrid,
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => formatAxis(p.time, range)),
        ...axisStyle,
      },
      yAxis: { type: 'value', ...axisStyle },
      series: [
        {
          name: '异常',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: points.map((p) => p.error),
          lineStyle: { width: 2, color: '#fb7185' },
          itemStyle: { color: '#fb7185' },
          areaStyle: { color: 'rgba(251,113,133,0.14)' },
        },
        {
          name: '性能上报',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: points.map((p) => p.performance),
          lineStyle: { width: 2, color: '#7c9cff' },
          itemStyle: { color: '#7c9cff' },
          areaStyle: { color: 'rgba(124,156,255,0.12)' },
        },
      ],
    }
  }, [data, range])

  const browserOption = useMemo<EChartsOption>(() => {
    const rows = data?.browsers ?? []
    return {
      tooltip: { trigger: 'item', backgroundColor: '#111834', borderColor: 'rgba(148,163,184,0.2)', textStyle: { color: '#e2e8f0' } },
      legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
      series: [
        {
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#111834', borderWidth: 2 },
          label: { show: false },
          data: rows.map((r) => ({ name: r.name, value: r.value })),
          color: ['#5b7cfa', '#7c9cff', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#94a3b8'],
        },
      ],
    }
  }, [data])

  if (isError) {
    return (
      <div className="card p-8 text-center text-sm text-rose-300">
        无法连接采集服务，请确认 <code className="font-mono">npm run dev:server</code> 已启动
      </div>
    )
  }

  const summary = data?.summary
  const perf = data?.perf ?? {}

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="异常事件"
          value={isLoading ? '—' : compact(summary?.errorCount ?? 0)}
          hint="所选时间范围内的错误上报总数"
          accent="rose"
        />
        <StatCard
          label="待处理问题"
          value={isLoading ? '—' : summary?.issueCount ?? 0}
          hint="按指纹聚合后仍未解决的问题"
          accent="amber"
        />
        <StatCard
          label="影响用户"
          value={isLoading ? '—' : compact(summary?.affectedUsers ?? 0)}
          hint="按会话去重后的用户数"
          accent="sky"
        />
        <StatCard
          label="LCP P75"
          value={isLoading ? '—' : `${perf.LCP?.p75 ?? 0} ms`}
          hint={perf.LCP ? `${perf.LCP.count} 次采样` : '暂无数据'}
          accent={perf.LCP && perf.LCP.p75 <= 2500 ? 'emerald' : 'amber'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card fade-up p-5 xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="card-title">异常趋势</h2>
            <span className="text-xs text-slate-500">按时间桶聚合</span>
          </div>
          {isLoading ? <Skeleton height={280} /> : <Chart option={trendOption} height={280} />}
        </div>

        <div className="card fade-up p-5">
          <h2 className="card-title mb-2">浏览器分布</h2>
          {isLoading ? <Skeleton height={280} /> : <Chart option={browserOption} height={280} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card fade-up p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="card-title">TOP 待处理问题</h2>
            <Link to="/issues" className="text-xs text-brand-400 hover:underline">
              查看全部 →
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {(data?.topIssues ?? []).map((issue) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.id}`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-white/[0.03]"
              >
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[11px] ring-1 ${LEVEL_STYLE[issue.level] ?? LEVEL_STYLE.info}`}
                >
                  {LEVEL_LABEL[issue.level] ?? issue.level}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">{issue.title}</div>
                  <div className="truncate text-[11px] text-slate-500">
                    {KIND_LABEL[issue.errorKind] ?? issue.errorKind}
                    {issue.culprit ? ` · ${issue.culprit}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums text-slate-200">{compact(issue.eventCount)} 次</div>
                  <div className="text-[11px] text-slate-500">{issue.userCount} 用户 · {fromNow(issue.lastSeen)}</div>
                </div>
              </Link>
            ))}
            {(data?.topIssues ?? []).length === 0 && <Empty text="所选时间范围内没有待处理问题" />}
          </div>
        </div>

        <div className="card fade-up p-5">
          <h2 className="card-title mb-4">Web Vitals（P75）</h2>
          <div className="space-y-3">
            {['LCP', 'FCP', 'INP', 'CLS', 'TTFB'].map((name) => {
              const stat = perf[name]
              const unit = name === 'CLS' ? '' : 'ms'
              return (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{name}</span>
                  <span className="tabular-nums text-slate-200">
                    {stat ? `${stat.p75}${unit ? ` ${unit}` : ''}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Skeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-lg bg-white/5" style={{ height }} />
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-slate-500">{text}</div>
}

function formatAxis(ts: number, range: string): string {
  const d = new Date(ts)
  if (range === '1h' || range === '24h') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
