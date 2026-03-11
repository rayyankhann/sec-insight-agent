/**
 * vite.config.js — Vite build configuration for the SEC Insight Agent frontend.
 *
 * Key settings:
 * - React plugin for JSX transform and Fast Refresh
 * - Proxy rules: /api requests are forwarded to the agent backend (port 8000)
 *   This avoids CORS issues during local development — the browser only ever
 *   talks to the Vite dev server, which proxies backend calls server-side.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward any request starting with /api to the agent backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
