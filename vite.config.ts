import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Gitee Pages 子路径部署时设置：VITE_BASE=/仓库名/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
})
