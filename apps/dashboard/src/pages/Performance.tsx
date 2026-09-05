import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { Chart, axisStyle, baseGrid } from '../components/Chart'
import { api } from '../lib/api'
import { VITALS_THRESHOLD } from '../lib/format'
import { useAppState } from '../store'

const METRICS = [
  { key: 'LCP', name: 'LCP', desc: '最大内容绘制，衡量首屏加载速度', unit: 'ms' },
  { key: 'FCP', name: 'FCP', desc: '首次内容绘制，用户看到第一帧内容的时间', unit: 'ms' },
  { key: 'INP', name: 'INP', desc: '交互到下一次绘制，衡量页面响应能力', unit: 'ms' },
  { key: 'CLS', name: 'CLS', desc: '累积布局偏移，衡量视觉稳定性', unit: '' },
  { key: 'TTFB', name: 'TTFB', desc: '首字节时间，反映服务端与网络耗时', unit: 'ms' },
]

export function Performance() {
  const { appId, range } = useAppState()
  const { data, isLoading } = useQuery({
    queryKey: ['overview', appId, range],
    queryFn: () => api.overview(appId, range),
  })

  const perf = data?.perf ?? {}

  const option = useMemo<EChartsOption>(() => {
    const metricNames = METRICS.map((m) => m.key)
    return {
      tooltip: { trigger: 'axis', backgroundColor: '#111834', borderColor: 'rgba(148,163,184,0.2)', textStyle: { color: '#e2e8f0' } },
      legend: { data: ['P50', 'P75', 'P95'], right: 0, textStyle: { color: '#94a3b8', fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
      grid: baseGrid,
      xAxis: { type: 'category', data: metricNames, ...axisStyle },
      yAxis: { type: 'value', name: 'ms', nameTextStyle: { color: '#94a3b8' }, ...axisStyle },
      series: [
        { name: 'P50', type: 'bar', data: metricNames.map((m) => perf[m]?.p50 ?? 0), itemStyle: { color: '#34d399', borderRadius: [4, 4, 0, 0] } },
        { name: 'P75', type: 'bar', data: metricNames.map((m) => perf[m]?.p75 ?? 0), itemStyle: { color: '#5b7cfa', borderRadius: [4, 4, 0, 0] } },
        { name: 'P95', type: 'bar', data: metricNames.map((m) => perf[m]?.p95 ?? 0), itemStyle: { color: '#fb7185', borderRadius: [4, 4, 0, 0] } },
      ],
    }
  }, [perf])

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="card-title mb-2">Web Vitals 分位数对比</h2>
        <p className="mb-4 text-xs text-slate-500">
          分位数比平均值更能反映真实体验：P75 意味着 75% 的访问快于该值，也是 Google 推荐的评估口径。
        </p>
        {isLoading ? <div className="h-[300px] animate-pulse rounded-lg bg-white/5" /> : <Chart option={option} height={300} />}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-white/5 bg-white/[0.02]">
            <tr>
              <th className="th w-28">指标</th>
              <th className="th">说明</th>
              <th className="th w-28 text-right">P50</th>
              <th className="th w-28 text-right">P75</th>
              <th className="th w-28 text-right">P95</th>
              <th className="th w-24 text-right">采样数</th>
              <th className="th w-24 text-right">健康度</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {METRICS.map((m) => {
              const stat = perf[m.key]
              const [good, poor] = VITALS_THRESHOLD[m.key] ?? [0, 0]
              const p75 = stat?.p75 ?? 0
              const rating = !stat ? 'unknown' : p75 <= good ? 'good' : p75 <= poor ? 'needs-improvement' : 'poor'
              return (
                <tr key={m.key} className="transition-colors hover:bg-white/[0.03]">
                  <td className="td font-medium text-slate-200">{m.name}</td>
                  <td className="td text-slate-500">{m.desc}</td>
                  <td className="td text-right tabular-nums">{stat ? `${stat.p50}${m.unit}` : '—'}</td>
                  <td className="td text-right tabular-nums">{stat ? `${stat.p75}${m.unit}` : '—'}</td>
                  <td className="td text-right tabular-nums">{stat ? `${stat.p95}${m.unit}` : '—'}</td>
                  <td className="td text-right tabular-nums text-slate-400">{stat?.count ?? 0}</td>
                  <td className="td text-right">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] ${
                        rating === 'good'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : rating === 'needs-improvement'
                            ? 'bg-amber-500/10 text-amber-300'
                            : rating === 'poor'
                              ? 'bg-rose-500/10 text-rose-300'
                              : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {rating === 'good' ? '良好' : rating === 'needs-improvement' ? '待优化' : rating === 'poor' ? '较差' : '无数据'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
