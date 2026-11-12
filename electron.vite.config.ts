import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { cpSync } from 'node:fs'

cpSync(resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts'),
  resolve('src/renderer/public/fonts'), { recursive: true })

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react(), {
      name: 'desktop-production-csp',
      apply: 'build',
      transformIndexHtml: html => html.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'")
        .replace("connect-src 'self' ws://localhost:* http://localhost:*", "connect-src 'self'")
    }],
    build: { chunkSizeWarningLimit: 2500, license: { fileName: 'THIRD-PARTY-LICENSES.md' } },
    server: {
      fs: { allow: [resolve('.')] }
    }
  }
})
