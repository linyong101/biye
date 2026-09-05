import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  // iife 产物供 <script> 直接引入（输出 index.global.js，挂载 window.Vigil）
  format: ['esm', 'cjs', 'iife'],
  globalName: 'Vigil',
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: true,
  target: 'es2019',
  // 体积统计改由 npm script 在构建成功后执行（Windows 下 onSuccess 工作目录不可靠）
})
