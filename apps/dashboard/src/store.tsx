import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface AppState {
  appId: string
  setAppId: (id: string) => void
  range: string
  setRange: (r: string) => void
}

const AppContext = createContext<AppState | null>(null)

const STORAGE_KEY = 'vigil:appId'

export function AppProvider({ children }: { children: ReactNode }) {
  const [appId, setAppId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? 'demo-shop')
  const [range, setRange] = useState('24h')

  const value = useMemo<AppState>(
    () => ({
      appId,
      setAppId: (id: string) => {
        localStorage.setItem(STORAGE_KEY, id)
        setAppId(id)
      },
      range,
      setRange,
    }),
    [appId, range],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState 必须在 AppProvider 内使用')
  return ctx
}
