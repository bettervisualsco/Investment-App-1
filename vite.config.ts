import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const dataDir = fileURLToPath(new URL('./data', import.meta.url))

/** Serves the pipeline's /data folder while developing, and copies it into the built site. */
function dataFolder(): Plugin {
  let outDir = 'dist'
  return {
    name: 'data-folder',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `${server.config.base}data/`
        const url = decodeURIComponent((req.url ?? '').split('?')[0])
        if (!url.startsWith(prefix)) return next()
        const file = path.resolve(dataDir, url.slice(prefix.length))
        if (!file.startsWith(dataDir + path.sep) || !file.endsWith('.json') || !fs.existsSync(file)) {
          res.statusCode = 404
          return res.end('not found')
        }
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (!fs.existsSync(dataDir)) return
      fs.cpSync(dataDir, path.join(outDir, 'data'), {
        recursive: true,
        filter: (src) => fs.statSync(src).isDirectory() || src.endsWith('.json'),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo-name>/; the deploy workflow sets BASE_PATH to that.
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    dataFolder(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Investment Planner',
        short_name: 'Planner',
        description: 'Plan your investing timeline and see how it could grow, based on real market history.',
        lang: 'en-AU',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1d5c4a',
        background_color: '#eef2ef',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app itself is saved for offline use. Market data is NOT cached here: the data loader
        // keeps its own copy on the device (IndexedDB) and decides what to download.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['data/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/data\//],
        cleanupOutdatedCaches: true,
        // Switch to a new version as soon as it has downloaded, instead of waiting until every window of the
        // app is closed (on an iPhone that can take days). Saved plans and market data are kept separately.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
