import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/bricolage-grotesque'
import './styles.css'
import App from './App.tsx'
import { startDataSync } from './data'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Save the app on the device so it opens offline, and update it quietly when a new version is published.
registerSW({ immediate: true })

// Check for new market data now, and whenever the app comes back to the screen.
startDataSync()
