import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KIND_LABEL, LEVEL_LABEL, LEVEL_STYLE, compact, fromNow } from '../lib/format'
import { useAppState } from '../store'

const STATUSES = [
  { value: 'unresolved', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'ignored', label: '已忽略' },
]

const KINDS = [
  { value: 'js', label: 'JS 异常' },
  { value: 'promise', label: 'Promise' },
  { value: 'resource', label: '资源加载' },
  { value: 'http', label: '接口错误' },
  { value: 'whiteScreen', label: '白屏' },
]

export function Issues() {
  const { appId } = useAppState()
  const [status, setStatus] = useState('unresolved')
  const [errorKind, setErrorKind] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['issues', appId, status, errorKind, keyword, page],
    queryFn: () => api.issues({ appId, status, errorKind, keyword, page, pageSize }),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-ink-800/60 p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatus(s.value)
                setPage(1)
              }}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                status === s.value ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={errorKind}
          onChange={(e) => {
            setErrorKind(e.target.value)
            setPage(1)
          }}
          className="input w-36 cursor-pointer py-1.5"
        >
          <option value="">全部类型</option>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>

        <input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
          placeholder="搜索问题标题…"
          className="input w-64 py-1.5"
        />

        <span className="ml-auto text-xs text-slate-500">共 {total} 条</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-white/5 bg-white/[0.02]">
            <tr>
              <th className="th w-20">等级</th>
              <th className="th">问题</th>
              <th className="th w-28">类型</th>
              <th className="th w-24 text-right">次数</th>
              <th className="th w-24 text-right">用户</th>
              <th className="th w-32 text-right">最近出现</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.map((issue) => (
              <tr key={issue.id} className="transition-colors hover:bg-white/[0.03]">
                <td className="td">
                  <span className={`rounded px-2 py-0.5 text-[11px] ring-1 ${LEVEL_STYLE[issue.level] ?? LEVEL_STYLE.info}`}>
                    {LEVEL_LABEL[issue.level] ?? issue.level}
                  </span>
                </td>
                <td className="td">
                  <Link to={`/issues/${issue.id}`} className="block max-w-2xl truncate text-slate-200 hover:text-brand-400">
                    {issue.title}
                  </Link>
                  {issue.culprit && <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{issue.culprit}</div>}
                </td>
                <td className="td text-slate-400">{KIND_LABEL[issue.errorKind] ?? issue.errorKind}</td>
                <td className="td text-right tabular-nums">{compact(issue.eventCount)}</td>
                <td className="td text-right tabular-nums">{compact(issue.userCount)}</td>
                <td className="td text-right text-slate-400">{fromNow(issue.lastSeen)}</td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-500">
                  没有符合条件的问题
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
