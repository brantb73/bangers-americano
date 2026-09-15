import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ttsApiPlugin } from './server/ttsPlugin.ts'

export default defineConfig({
  base: '/bangers-americano/',
  plugins: [react(), ttsApiPlugin()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
})
