import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ttsApiPlugin } from './server/ttsPlugin.ts'

export default defineConfig({
  // Custom domain https://bangerstourify.com is served at the site root.
  // Using `/` (not `/bangers-americano/`) so production CSS/JS/logo resolve.
  // Dev and preview use the same root, so http://localhost:5173/ keeps working.
  base: '/',
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
