import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 使用相对路径，产物可部署在任意子路径（GitHub Pages、EdgeOne Pages、对象存储等）。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
