import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = process.cwd()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve(root, 'src/shared') } },
    build: { rollupOptions: { input: { index: resolve(root, 'src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve(root, 'src/shared') } },
    build: { rollupOptions: { input: { index: resolve(root, 'src/preload/index.ts') } } }
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    plugins: [react()],
    resolve: { alias: { '@shared': resolve(root, 'src/shared') } },
    build: { rollupOptions: { input: { index: resolve(root, 'src/renderer/index.html') } } }
  }
})
