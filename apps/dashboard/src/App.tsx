import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AppProvider } from './store'
import { AuthProvider, useAuth } from './auth'
import { getToken } from './lib/api'
import { Overview } from './pages/Overview'
import { Issues } from './pages/Issues'
import { IssueDetail } from './pages/IssueDetail'
import { Performance } from './pages/Performance'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { Sessions } from './pages/Sessions'
import { SessionReplay } from './pages/SessionReplay'

/** 路由守卫：未登录跳转登录页，登录中显示加载态 */
function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (!getToken()) return <Navigate to="/login" replace />
  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          正在校验登录状态…
        </div>
      </div>
    )
  }
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <AppProvider>
                <Layout />
              </AppProvider>
            }
          >
            <Route path="/" element={<Overview />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/issues/:id" element={<IssueDetail />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionReplay />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
