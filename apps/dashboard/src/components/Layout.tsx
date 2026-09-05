import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../auth'
import { useAppState } from '../store'

const NAV = [
  { to: '/', label: '概览', icon: '◧' },
  { to: '/issues', label: '问题', icon: '⚠' },
  { to: '/performance', label: '性能', icon: '◔' },
  { to: '/settings', label: '接入与告警', icon: '⚙' },
]

const RANGES = [
  { value: '1h', label: '近 1 小时' },
  { value: '24h', label: '近 24 小时' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
]

export function Layout() {
  const { appId, setAppId, range, setRange } = useAppState()
  const { user, logout } = useAuth()
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects })

  return (
    <div className="flex min-h-screen">
      {/* 侧边栏 */}
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-white/5 bg-ink-900/80 px-4 py-6 backdrop-blur">
        <div className="flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">V</div>
          <div>
            <div className="text-sm font-semibold text-white">Vigil</div>
            <div className="text-[11px] text-slate-500">前端稳定性监控</div>
          </div>
        </div>

        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand-500/15 text-brand-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <span className="w-4 text-center text-xs">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-lg border border-white/5 bg-ink-800/60 p-3 text-[11px] leading-relaxed text-slate-500">
          SDK 体积 <span className="text-slate-300">&lt; 10KB</span> gzip
          <br />
          接入只需一行 <span className="text-slate-300">init()</span>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="ml-56 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-ink-900/70 px-8 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <select
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="input w-52 cursor-pointer py-1.5"
            >
              {projects.length === 0 && <option value={appId}>{appId}</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.appId}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">{appId}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-ink-800/60 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`rounded-md px-3 py-1 text-xs transition-colors ${
                    range === r.value ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-ink-800/60 px-3 py-1.5">
              <div className="grid h-6 w-6 place-items-center rounded-md bg-brand-500/20 text-[11px] font-medium text-brand-400">
                {user?.name?.slice(0, 1) ?? 'U'}
              </div>
              <div className="leading-tight">
                <div className="text-xs text-slate-200">{user?.name ?? '未登录'}</div>
                <div className="text-[10px] text-slate-500">{user?.role === 'admin' ? '管理员' : '成员'}</div>
              </div>
            </div>

            <button onClick={logout} className="btn-ghost py-1.5">
              退出登录
            </button>
          </div>
        </header>

        <main className="px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
