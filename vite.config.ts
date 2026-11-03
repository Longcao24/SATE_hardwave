import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

// The web app's version has ONE source: package.json "version" (2026-11-03 — the sidebar badge was a
// hard-coded "v1.5.9" that nobody bumped for months). It is baked into the bundle with the commit and
// build time, and written to /version.json so anyone can ask the live site what it runs:
//   curl https://sate-hardware.vercel.app/version.json
// Release with `npm run release:prod`, which refuses a version that is not newer than the live one.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || (() => {
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
})()).slice(0, 7)
const built = new Date().toISOString()
const versionInfo = { version: pkg.version, commit, built }

const versionJson = (): Plugin => ({
  name: 'sate-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(versionInfo, null, 2) + '\n' })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.version),
    __APP_COMMIT__: JSON.stringify(versionInfo.commit),
    __APP_BUILT__: JSON.stringify(versionInfo.built),
  },
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
