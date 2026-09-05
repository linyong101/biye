import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAppState } from '../store'
import { fromNow } from '../lib/format'

export function Sessions() {
  const { appId } = useAppState()
  const { data, isLoading } = useQuery({ queryKey: ['sessions', appId], queryFn: () => api.sessions(appId) })

  if (isLoading) return <div className="card p-8 text-sm text-slate-500">加载中…</div>
  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-white">会话回放</h1>
        <p className="mt-1 text-sm text-slate-500">
          按用户会话聚合的轻量操作录屏（DOM 快照）。可回放出错前的操作路径与界面状态，复现问题更直观。
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-white/5">
              <th className="px-5 py-3 text-left">会话</th>
              <th className="px-5 py-3 text-left">最后活跃</th>
              <th className="px-5 py-3 text-left">页面</th>
              <th className="px-5 py-3 text-left">帧数</th>
              <th className="px-5 py-3 text-left">状态</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.map((s) => (
              <tr key={s.sessionId} className="hover:bg-white/5">
                <td className="px-5 py-3 font-mono text-xs text-slate-300">{s.sessionId.slice(0, 16)}</td>
                <td className="px-5 py-3 text-slate-400">{fromNow(new Date(s.lastTs).toISOString())}</td>
                <td className="max-w-[220px] truncate px-5 py-3 text-slate-400">{s.page}</td>
                <td className="px-5 py-3 text-slate-400">{s.frameCount}</td>
                <td className="px-5 py-3">
                  {s.hasError ? (
                    <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">含错误</span>
                  ) : (
                    <span className="text-xs text-slate-500">正常</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link to={`/sessions/${s.sessionId}`} className="btn-ghost py-1">
                    查看回放
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                  暂无会话数据，请先接入 SDK 并触发上报（replay 默认开启）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
