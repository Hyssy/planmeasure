import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startPersistence } from './persist'

startPersistence()

// Let automated tests inspect app state (development builds only).
if (import.meta.env.DEV) void import('./store').then(({ useApp }) => Object.assign(window, { __planmeasure: useApp }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
