import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const API_PORT = Number(process.env.PORT ?? 3022)

export default defineConfig({
  // Relative Basis: funktioniert unter /promptgenerator/ (Nginx) und direkt unter /.
  base: './',
  plugins: [vue(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5177,
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    restoreMocks: true,
  },
})
