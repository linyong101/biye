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
  build: {
    // echarts 是按需引入的可视化第三方库（gzip 后仍约 186KB），
    // 已独立成单独 chunk 以最大化浏览器缓存命中；此类库体积超过
    // 默认 500KB 阈值属正常现象，故将告警阈值放宽到 700KB。
    chunkSizeWarningLimit: 700,
    // 拆包：把体积较大的 echarts 与框架依赖拆成独立 chunk，
    // 消除单包 >500KB 的构建警告，并提升浏览器缓存命中率
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
