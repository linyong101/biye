import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, clearToken, getToken, setToken, type AuthUser } from './lib/api'

interface AuthState {
  user: AuthUser | null
  /** 正在校验登录状态 */
  loading: boolean
  isAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setTokenState] = useState<string | null>(() => getToken())

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    enabled: Boolean(token),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.login(username, password)
      setToken(res.token)
      setTokenState(res.token)
      queryClient.setQueryData(['me'], res.user)
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    clearToken()
    setTokenState(null)
    queryClient.clear()
    location.href = '/login'
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      user: user ?? null,
      loading: Boolean(token) && isLoading,
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [user, isLoading, token, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
