import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/space-grotesk/index.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { ensureSeeded } from './store/db.ts'
import { initSync } from './store/sync.ts'

// Startup must never be able to blank the page: this await is top-level, so an IndexedDB
// failure here (blocked upgrade from a second open tab, private-browsing storage denial)
// used to reject before render() was ever reached — nothing mounted, no message. Boot the
// UI either way and let the boundary below report anything the app then can't do.
let bootError: Error | null = null
try {
  await ensureSeeded()
  initSync()
} catch (e) {
  bootError = e instanceof Error ? e : new Error(String(e))
  console.error('Startup failed:', bootError)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/aj-pursuit-lab">
      <ErrorBoundary error={bootError}>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
