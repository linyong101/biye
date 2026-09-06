import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AuthUser } from '../lib/api'
import { useAuth } from '../auth'
import { useAppState } from '../store'

const NPM_SNIPPET = `import { init } from '@vigil/web-sdk'

init({
  appId: 'APP_ID',
  endpoint: 'http://localhost:3001/api/report',
  release: '1.0.0',
  environment: 'production',
  sampleRate: 1,          // 高流量项目可降到 0.1
  sensitiveKeys: ['phone'], // 额外脱敏字段
})`

const SCRIPT_SNIPPET = `<script src="https://unpkg.com/@vigil/web-sdk@latest/dist/index.global.js"></script>
<script>
  Vigil.init({ appId: 'APP_ID', endpoint: 'http://localhost:3001/api/report' })
</script>`

const CI_SNIPPET = `# 构建后自动上传 SourceMap，让线上堆栈还原到源码
npx vigil-cli upload --app-id APP_ID --release $GIT_COMMIT --dir dist/assets`

const ALERT_TYPES = [
  { value: 'new_issue', label: '出现新问题' },
  { value: 'error_spike', label: '错误量突增' },
  { value: 'perf_degrade', label: '性能劣化' },
]

export function Settings() {
  const { appId } = useAppState()
  const queryClient = useQueryClient()
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects })
  const { data: alerts = [] } = useQuery({ queryKey: ['alerts', appId], queryFn: () => api.alerts(appId) })

  const createAlert = useMutation({
    mutationFn: api.createAlert,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts', appId] }),
  })
  const deleteAlert = useMutation({
    mutationFn: api.deleteAlert,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts', appId] }),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="NPM 接入" desc="现代前端项目推荐方式，支持 Vite / Webpack / Next.js">
          <CodeBlock code={NPM_SNIPPET.replace('APP_ID', appId)} />
        </Card>
        <Card title="Script 接入" desc="适用于 jQuery / 服务端渲染等传统项目">
          <CodeBlock code={SCRIPT_SNIPPET.replace('APP_ID', appId)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Source Map 上传" desc="上传后，压缩堆栈可自动还原到源码行列">
          <CodeBlock code={CI_SNIPPET.replace('APP_ID', appId)} />
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            也可调用接口手动上传：
            <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
              POST /api/sourcemap
            </code>
          </p>
        </Card>

        <Card title="已接入项目" desc="SDK 首次上报时会自动创建项目">
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <div>
                  <div className="text-sm text-slate-200">{p.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">{p.appId}</div>
                </div>
                <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">{p.platform}</span>
              </div>
            ))}
            {projects.length === 0 && <p className="text-sm text-slate-500">还没有项目接入</p>}
          </div>
        </Card>
      </div>

      <Card title="AI 根因诊断" desc="结合堆栈、源码定位与用户行为轨迹，自动给出根因与修复建议">
        <AiStatusPanel />
      </Card>

      <Card title="告警规则" desc="支持企业微信 / 钉钉 / 飞书机器人 Webhook">
        <div className="space-y-3">
          {alerts.map((rule) => (
            <div key={rule.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="rounded bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-400">
                {ALERT_TYPES.find((t) => t.value === rule.type)?.label ?? rule.type}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">{rule.webhook}</span>
              <button
                className="text-xs text-slate-400 hover:text-rose-300"
                onClick={() => deleteAlert.mutate(rule.id)}
              >
                删除
              </button>
            </div>
          ))}
          {alerts.length === 0 && <p className="text-sm text-slate-500">未配置告警规则</p>}
        </div>
        <AddAlertForm onSubmit={(type, webhook, threshold) => createAlert.mutate({ appId, type, webhook, threshold })} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="修改密码" desc="建议首次登录后立即修改默认密码">
          <PasswordForm />
        </Card>
        <Card title="用户管理" desc="管理员可创建账号、调整角色与启停状态">
          <UserManagement />
        </Card>
      </div>
    </div>
  )
}

function PasswordForm() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setOldPassword('')
      setNewPassword('')
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    },
  })

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <input
        type="password"
        value={oldPassword}
        onChange={(e) => setOldPassword(e.target.value)}
        placeholder="原密码"
        className="input py-1.5"
      />
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="新密码（至少 6 位）"
        className="input py-1.5"
      />
      <div className="flex items-center gap-3">
        <button className="btn-primary py-1.5" disabled={!oldPassword || newPassword.length < 6 || mutation.isPending}>
          {mutation.isPending ? '提交中…' : '修改密码'}
        </button>
        {done && <span className="text-xs text-emerald-300">修改成功</span>}
        {mutation.isError && <span className="text-xs text-rose-300">{(mutation.error as Error).message}</span>}
      </div>
    </form>
  )
}

function UserManagement() {
  const { user: me, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: api.users, enabled: isAdmin })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }
  const updateUser = useMutation({
    mutationFn: (vars: { id: string; patch: { role?: string; enabled?: boolean } }) => api.updateUser(vars.id, vars.patch),
    onSuccess: invalidate,
  })
  const deleteUser = useMutation({ mutationFn: (id: string) => api.deleteUser(id), onSuccess: invalidate })

  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'member' })
  const createUser = useMutation({
    mutationFn: () => api.register(form),
    onSuccess: () => {
      setForm({ username: '', password: '', name: '', role: 'member' })
      invalidate()
    },
  })

  if (!isAdmin) {
    return <p className="text-sm text-slate-500">当前账号为普通成员，仅管理员可管理用户。</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-slate-500">加载中…</p>}
        {users.map((u: AuthUser) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-200">
                {u.name}
                {u.id === me?.id && <span className="ml-2 text-[11px] text-brand-400">（当前登录）</span>}
              </div>
              <div className="font-mono text-[11px] text-slate-500">{u.username}</div>
            </div>

            <span
              className={`rounded px-2 py-0.5 text-[11px] ${
                u.role === 'admin' ? 'bg-brand-500/15 text-brand-400' : 'bg-white/5 text-slate-400'
              }`}
            >
              {u.role === 'admin' ? '管理员' : '成员'}
            </span>

            {u.id !== me?.id && (
              <>
                <button
                  className="text-xs text-slate-400 hover:text-brand-400"
                  onClick={() => updateUser.mutate({ id: u.id, patch: { role: u.role === 'admin' ? 'member' : 'admin' } })}
                >
                  {u.role === 'admin' ? '设为成员' : '设为管理员'}
                </button>
                <button
                  className="text-xs text-slate-400 hover:text-amber-300"
                  onClick={() => updateUser.mutate({ id: u.id, patch: { enabled: !u.enabled } })}
                >
                  {u.enabled ? '禁用' : '启用'}
                </button>
                <button
                  className="text-xs text-slate-400 hover:text-rose-300"
                  onClick={() => deleteUser.mutate(u.id)}
                >
                  删除
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form
        className="space-y-2 border-t border-white/5 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.username || form.password.length < 6) return
          createUser.mutate()
        }}
      >
        <div className="text-xs text-slate-400">新增用户</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="登录名"
            className="input w-32 py-1.5"
          />
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="姓名"
            className="input w-32 py-1.5"
          />
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="密码（≥6 位）"
            className="input w-36 py-1.5"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="input w-28 cursor-pointer py-1.5"
          >
            <option value="member">成员</option>
            <option value="admin">管理员</option>
          </select>
          <button className="btn-primary py-1.5" disabled={createUser.isPending}>
            添加
          </button>
        </div>
        {createUser.isError && (
          <p className="text-xs text-rose-300">{(createUser.error as Error).message}</p>
        )}
      </form>
    </div>
  )
}

const AI_ENV_SNIPPET = `# apps/server/.env
AI_API_KEY=sk-xxxxxxxxxxxxxxxx
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat`

function AiStatusPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded px-2 py-1 text-xs ${
            data?.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
          }`}
        >
          {isLoading ? '检测中…' : data?.enabled ? '已启用大模型' : '未配置，使用规则库兜底'}
        </span>
        {data && (
          <span className="font-mono text-[11px] text-slate-500">
            {data.model} @ {data.baseUrl}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        未配置 Key 时系统依然可用——会按错误类型（JS / Promise / 接口 / 资源 / 白屏）匹配内置规则库给出诊断。
        配置后切换为真实大模型分析，兼容所有 OpenAI 接口规范的厂商。
      </p>

      <CodeBlock code={AI_ENV_SNIPPET} />
    </div>
  )
}

function AddAlertForm({ onSubmit }: { onSubmit: (type: string, webhook: string, threshold: number) => void }) {
  const [type, setType] = useState('new_issue')
  const [webhook, setWebhook] = useState('')
  const [threshold, setThreshold] = useState(2)

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/5 pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!webhook.trim()) return
        onSubmit(type, webhook.trim(), threshold)
        setWebhook('')
      }}
    >
      <div>
        <label className="mb-1 block text-xs text-slate-400">触发条件</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="input w-40 cursor-pointer py-1.5">
          {ALERT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[240px] flex-1">
        <label className="mb-1 block text-xs text-slate-400">Webhook 地址</label>
        <input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
          className="input py-1.5"
        />
      </div>
      {(type === 'error_spike' || type === 'perf_degrade') && (
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            {type === 'error_spike' ? '突增倍数' : '劣化倍数'}
          </label>
          <input
            type="number"
            min={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="input w-24 py-1.5"
          />
        </div>
      )}
      <button className="btn-primary py-1.5" type="submit">
        添加规则
      </button>
    </form>
  )
}

function Card({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-medium text-slate-200">{title}</h2>
      {desc && <p className="mt-1 text-xs text-slate-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-ink-900/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
        {code}
      </pre>
      <button
        className="absolute right-2 top-2 rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10"
        onClick={() => {
          void navigator.clipboard.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}
