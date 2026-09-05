import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发期代理到采集服务，避免跨域
      '/api': {
        target: process.env.VIGIL_SERVER ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
