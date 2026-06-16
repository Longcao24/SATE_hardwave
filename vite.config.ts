import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'testing.sate.agency',
      '.sate.agency', // Allow all subdomains
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'testing.sate.agency',
      '.sate.agency',
    ],
  }
})
