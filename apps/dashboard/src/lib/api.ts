const BASE = import.meta.env.VITE_API_BASE ?? ''
const TOKEN_KEY = 'vigil:token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** 登录过期时统一跳回登录页 */
function handleUnauthorized(): void {
  clearToken()
  if (!location.pathname.startsWith('/login')) {
    location.href = '/login'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error('未登录或登录已过期')
  }
  if (!res.ok) throw new Error(`请求失败：${res.status}`)

  const json = (await res.json()) as { ok?: boolean; data?: T; message?: string }
  if (json.ok === false) throw new Error(json.message ?? '请求失败')
  return json.data as T
}

export interface Summary {
  errorCount: number
  issueCount: number
  affectedUsers: number
  pvCount: number
}

export interface TrendPoint {
  time: number
  error: number
  performance: number
  total: number
}

export interface PerfStat {
  p50: number
  p75: number
  p95: number
  count: number
}

export interface TopIssue {
  id: string
  title: string
  culprit?: string | null
  level: string
  errorKind: string
  eventCount: number
  userCount: number
  lastSeen: string
}

export interface OverviewData {
  summary: Summary
  trend: TrendPoint[]
  perf: Record<string, PerfStat>
  topIssues: TopIssue[]
  browsers: Array<{ name: string; value: number }>
}

export interface Issue {
  id: string
  appId: string
  fingerprint: string
  errorKind: string
  level: string
  title: string
  culprit?: string | null
  stack?: string | null
  eventCount: number
  userCount: number
  status: string
  firstSeen: string
  lastSeen: string
  /** AI 诊断结果 JSON 字符串 */
  aiDiagnosis?: string | null
  aiDiagnosedAt?: string | null
}

export interface Diagnosis {
  cause: string
  suggestion: string
  impact: string
  confidence: 'high' | 'medium' | 'low'
  source: 'llm' | 'rule'
  model?: string
  diagnosedAt: string
}

export interface AiStatus {
  enabled: boolean
  model: string
  baseUrl: string
}

export interface AuthUser {
  id: string
  username: string
  name: string
  role: 'admin' | 'member'
  enabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface IssueEvent {
  id: string
  ts: string
  url?: string | null
  browser?: string | null
  os?: string | null
  release?: string | null
  environment?: string | null
  sessionId?: string | null
  payload: Record<string, unknown> | null
}

export interface SessionSummary {
  sessionId: string
  lastTs: number
  page: string
  frameCount: number
  eventCount: number
  hasError: boolean
}

export interface ReplayNodeView {
  tag: string
  text?: string
  cls?: string
  id?: string
  rect: { x: number; y: number; w: number; h: number }
  value?: string
}

export interface ReplayFrameView {
  type: string
  url: string
  t: number
  nodes: ReplayNodeView[]
}

export interface SessionEvent {
  id: string
  kind: string
  ts: number
  url?: string | null
  level?: string | null
  title?: string | null
  message?: string | null
  frame: ReplayFrameView | null
}

export interface IssueDetail extends Issue {
  events: IssueEvent[]
  distribution: {
    browsers: Array<{ name: string; value: number }>
    releases: Array<{ name: string; value: number }>
    urls: Array<{ name: string; value: number }>
  }
}

export interface Project {
  id: string
  appId: string
  name: string
  platform: string
}

export const api = {
  overview: (appId: string, range: string) =>
    request<OverviewData>(`/api/overview?appId=${encodeURIComponent(appId)}&range=${range}`),

  issues: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== '' && v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    )
    return request<{ items: Issue[]; total: number }>(`/api/issues?${qs}`)
  },

  issue: (id: string) => request<IssueDetail>(`/api/issues/${id}`),

  updateIssue: (id: string, status: string) =>
    request<Issue>(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  projects: () => request<Project[]>('/api/projects'),

  createProject: (appId: string, name: string) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ appId, name }) }),

  alerts: (appId: string) => request<Array<{ id: string; type: string; webhook: string; enabled: boolean }>>(`/api/alerts/${appId}`),

  createAlert: (input: { appId: string; type: string; webhook: string; threshold: number }) =>
    request('/api/alerts', { method: 'POST', body: JSON.stringify(input) }),

  deleteAlert: (id: string) => request(`/api/alerts/${id}`, { method: 'DELETE' }),

  /** AI 根因诊断：force=true 时忽略缓存重新分析 */
  diagnose: (issueId: string, force = true) =>
    request<Diagnosis>('/api/ai/diagnose', { method: 'POST', body: JSON.stringify({ issueId, force }) }),

  aiStatus: () => request<AiStatus>('/api/ai/status'),

  // ===== 认证与用户管理 =====
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (input: { username: string; password: string; name?: string; role?: string }) =>
    request<AuthUser>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  me: () => request<AuthUser>('/api/auth/me'),

  changePassword: (oldPassword: string, newPassword: string) =>
    request('/api/auth/password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) }),

  users: () => request<AuthUser[]>('/api/users'),

  updateUser: (id: string, patch: { name?: string; role?: string; enabled?: boolean }) =>
    request<AuthUser>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteUser: (id: string) => request(`/api/users/${id}`, { method: 'DELETE' }),

  sessions: (appId: string) =>
    request<{ items: SessionSummary[]; total: number }>(`/api/sessions?appId=${encodeURIComponent(appId)}`),

  session: (appId: string, sessionId: string) =>
    request<{ sessionId: string; events: SessionEvent[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}?appId=${encodeURIComponent(appId)}`,
    ),
}
