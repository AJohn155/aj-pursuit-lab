import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/space-grotesk/index.css'
import './index.css'
import App from './App.tsx'
import { ensureSeeded } from './store/db.ts'
import { initSync } from './store/sync.ts'

await ensureSeeded()
initSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/aj-pursuit-lab">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
