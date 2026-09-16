import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
// base configurável: a prévia sobe em erp.robooster.com.br/previa/ (VITE_BASE=/previa/); produção fica '/'
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
