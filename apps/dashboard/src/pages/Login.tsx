import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-base font-bold text-white">
            V
          </div>
          <div>
            <div className="text-lg font-semibold text-white">Vigil</div>
            <div className="text-xs text-slate-500">前端稳定性监控平台</div>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="admin"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-slate-400">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="admin123"
              className="input"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>
          )}

          <button type="submit" disabled={pending || !username || !password} className="btn-primary w-full justify-center py-2">
            {pending ? '登录中…' : '登 录'}
          </button>

          <p className="text-center text-[11px] leading-relaxed text-slate-500">
            默认账号：admin / admin123
            <br />
            首次启动由服务自动创建，登录后请尽快修改密码
          </p>
        </form>
      </div>
    </div>
  )
}
