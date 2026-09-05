import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Markdown } from '../components/Markdown'
import { api, type Diagnosis, type IssueEvent } from '../lib/api'
import { KIND_LABEL, LEVEL_LABEL, LEVEL_STYLE, formatTime, fromNow } from '../lib/format'

export function IssueDetail() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [activeEvent, setActiveEvent] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['issue', id], queryFn: () => api.issue(id) })

  const updateStatus = useMutation({
    mutationFn: (status: string) => api.updateIssue(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issue', id] })
      void queryClient.invalidateQueries({ queryKey: ['issues'] })
    },
  })

  if (isLoading) return <div className="card p-8 text-sm text-slate-500">加载中…</div>
  if (!data) return <div className="card p-8 text-sm text-rose-300">问题不存在或已被删除</div>

  return (
    <div className="space-y-5">
      <div>
        <Link to="/issues" className="text-xs text-slate-400 hover:text-brand-400">
          ← 返回问题列表
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[11px] ring-1 ${LEVEL_STYLE[data.level] ?? LEVEL_STYLE.info}`}>
                {LEVEL_LABEL[data.level] ?? data.level}
              </span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                {KIND_LABEL[data.errorKind] ?? data.errorKind}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] ${
                  data.status === 'resolved'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : data.status === 'ignored'
                      ? 'bg-slate-500/10 text-slate-400'
                      : 'bg-amber-500/10 text-amber-300'
                }`}
              >
                {data.status === 'resolved' ? '已解决' : data.status === 'ignored' ? '已忽略' : '待处理'}
              </span>
            </div>
            <h1 className="mt-2 break-all text-lg font-medium text-white">{data.title}</h1>
            {data.culprit && <p className="mt-1 font-mono text-xs text-slate-500">{data.culprit}</p>}
          </div>

          <div className="flex gap-2">
            {data.status !== 'resolved' && (
              <button className="btn-primary" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate('resolved')}>
                标记已解决
              </button>
            )}
            {data.status !== 'ignored' && (
              <button className="btn-ghost" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate('ignored')}>
                忽略
              </button>
            )}
            {data.status !== 'unresolved' && (
              <button className="btn-ghost" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate('unresolved')}>
                重新打开
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="发生次数" value={data.eventCount} />
        <Metric label="影响用户" value={data.userCount} />
        <Metric label="首次出现" value={fromNow(data.firstSeen)} />
        <Metric label="最近出现" value={fromNow(data.lastSeen)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <h2 className="card-title mb-3">堆栈信息</h2>
          {data.stack ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-ink-900/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
              {data.stack}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">该类型错误没有堆栈信息</p>
          )}
        </div>

        <div className="space-y-4">
          <DistributionCard title="浏览器分布" rows={data.distribution.browsers} />
          <DistributionCard title="版本分布" rows={data.distribution.releases} />
          <DistributionCard title="页面分布" rows={data.distribution.urls} />
        </div>
      </div>

      <AiPanel issueId={data.id} cached={data.aiDiagnosis} />

      <div className="card overflow-hidden">
        <div className="border-b border-white/5 px-5 py-3">
          <h2 className="card-title">最近事件（{data.events.length}）</h2>
        </div>
        <div className="divide-y divide-white/5">
          {data.events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              expanded={activeEvent === ev.id}
              onToggle={() => setActiveEvent(activeEvent === ev.id ? null : ev.id)}
            />
          ))}
          {data.events.length === 0 && <div className="py-10 text-center text-sm text-slate-500">暂无事件</div>}
        </div>
      </div>
    </div>
  )
}

function EventRow({ event, expanded, onToggle }: { event: IssueEvent; expanded: boolean; onToggle: () => void }) {
  const payload = event.payload
  const breadcrumbs = (payload?.breadcrumbs as Array<{ type: string; message: string; ts: number }> | undefined) ?? []

  return (
    <div className="px-5 py-3">
      <button onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <span className="text-xs text-slate-500">{expanded ? '▾' : '▸'}</span>
        <span className="font-mono text-xs text-slate-400">{event.sessionId?.slice(0, 12) ?? 'anonymous'}</span>
        <span className="truncate text-xs text-slate-400">{event.url ?? '—'}</span>
        <span className="ml-auto shrink-0 text-xs text-slate-500">{formatTime(event.ts)}</span>
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-4 pl-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">环境信息</div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs text-slate-400">
              <dt>浏览器</dt>
              <dd className="text-slate-300">{event.browser ?? '—'}</dd>
              <dt>系统</dt>
              <dd className="text-slate-300">{event.os ?? '—'}</dd>
              <dt>版本</dt>
              <dd className="text-slate-300">{event.release ?? '—'}</dd>
              <dt>环境</dt>
              <dd className="text-slate-300">{event.environment ?? '—'}</dd>
            </dl>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">用户行为轨迹（最近 {breadcrumbs.length} 步）</div>
            <ol className="space-y-1">
              {breadcrumbs.map((crumb, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="shrink-0 text-slate-600">{i + 1}.</span>
                  <span className="rounded bg-white/5 px-1.5 text-[10px] text-slate-400">{crumb.type}</span>
                  <span className="truncate text-slate-300">{crumb.message}</span>
                </li>
              ))}
              {breadcrumbs.length === 0 && <li className="text-xs text-slate-500">无面包屑记录</li>}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</div>
    </div>
  )
}

function DistributionCard({ title, rows }: { title: string; rows: Array<{ name: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="card p-4">
      <h3 className="card-title mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-slate-400" title={row.name}>
                {row.name}
              </span>
              <span className="tabular-nums text-slate-300">{row.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${(row.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-xs text-slate-500">暂无数据</div>}
      </div>
    </div>
  )
}

/**
 * AI 根因诊断面板。
 * 已诊断过的直接展示缓存结果，点击按钮可强制重新分析。
 * 未配置大模型时，服务端会自动回退到内置规则库，功能不中断。
 */
function AiPanel({ issueId, cached }: { issueId: string; cached?: string | null }) {
  const queryClient = useQueryClient()
  const { data: status } = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus })

  const mutation = useMutation({
    mutationFn: () => api.diagnose(issueId, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issue', issueId] })
    },
  })

  const parsed = useMemo<Diagnosis | null>(() => {
    if (!cached) return null
    try {
      return JSON.parse(cached) as Diagnosis
    } catch {
      return null
    }
  }, [cached])

  const result = mutation.data ?? parsed

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="card-title">AI 根因诊断</h2>
          <span
            className={`rounded px-2 py-0.5 text-[11px] ${
              status?.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-400'
            }`}
          >
            {status?.enabled ? `大模型 · ${status.model}` : '规则库兜底'}
          </span>
        </div>
        <button className="btn-primary py-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? '分析中…' : result ? '重新诊断' : '开始诊断'}
        </button>
      </div>

      {!status?.enabled && (
        <p className="mb-4 rounded-lg bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-slate-500">
          当前未配置大模型，使用内置规则库诊断。在{' '}
          <code className="font-mono text-slate-300">apps/server/.env</code> 中填入{' '}
          <code className="font-mono text-slate-300">AI_API_KEY</code> 即可切换为真实 AI 分析
          （支持 DeepSeek / 通义千问 / 智谱 / OpenAI 等兼容接口）。
        </p>
      )}

      {mutation.isError && (
        <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          诊断失败：{(mutation.error as Error).message}
        </p>
      )}

      {!result && !mutation.isPending && (
        <div className="py-8 text-center text-sm text-slate-500">
          点击「开始诊断」，系统会结合堆栈、源码定位与用户行为轨迹分析问题根因
        </div>
      )}

      {mutation.isPending && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          正在分析根因…
        </div>
      )}

      {result && !mutation.isPending && (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">根因判断</h3>
            <Markdown text={result.cause} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">修复建议</h3>
            <Markdown text={result.suggestion} />
          </section>

          <section className="grid grid-cols-1 gap-4 border-t border-white/5 pt-4 sm:grid-cols-3">
            <div>
              <h3 className="mb-1 text-xs text-slate-500">影响面</h3>
              <p className="text-sm text-slate-300">{result.impact}</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs text-slate-500">置信度</h3>
              <span
                className={`rounded px-2 py-0.5 text-[11px] ${
                  result.confidence === 'high'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : result.confidence === 'medium'
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-slate-500/10 text-slate-400'
                }`}
              >
                {result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}
              </span>
            </div>
            <div>
              <h3 className="mb-1 text-xs text-slate-500">诊断时间</h3>
              <p className="text-sm text-slate-300">{fromNow(result.diagnosedAt)}</p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
