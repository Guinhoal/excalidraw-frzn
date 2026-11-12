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
    plugins: [react()],
    build: { chunkSizeWarningLimit: 2500, license: { fileName: 'THIRD-PARTY-LICENSES.md' } },
    server: {
      fs: { allow: [resolve('.')] }
    }
  }
})
