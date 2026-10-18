// App icons for the home screen (iPhone), the Dock (Mac) and Android, made from public/app-icon.svg.
// Run `npm run icons` after changing the icon; the PNGs land in public/.
import { defineConfig } from '@vite-pwa/assets-generator/config'

const green = { background: '#1d5c4a', fit: 'contain' as const }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0 },
    maskable: { sizes: [512], padding: 0, resizeOptions: green },
    apple: { sizes: [180], padding: 0, resizeOptions: green },
  },
  images: ['public/app-icon.svg'],
})
