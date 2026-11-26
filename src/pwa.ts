/**
 * The installable desktop app: register the offline helper (production only),
 * offer "Install app", and say when a new version is ready.
 */
import { create } from 'zustand'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** the browser's install offer, when it has one */
  installPrompt: InstallPrompt | null
  /** a new version has downloaded and is waiting */
  updateReady: boolean
  /** running as the installed app (its own window) */
  installed: boolean
}

export const usePwa = create<PwaState>(() => ({
  installPrompt: null,
  updateReady: false,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
}))

let waiting: ServiceWorker | null = null

export function startPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    usePwa.setState({ installPrompt: e as InstallPrompt })
  })
  window.addEventListener('appinstalled', () => usePwa.setState({ installPrompt: null }))
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => usePwa.setState({ installed: e.matches }))

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const watch = (w: ServiceWorker | null) => {
          if (!w) return
          w.addEventListener('statechange', () => {
            // installed while an older version runs this page: a new version is ready
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = w
              usePwa.setState({ updateReady: true })
            }
          })
        }
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting
          usePwa.setState({ updateReady: true })
        }
        watch(reg.installing)
        reg.addEventListener('updatefound', () => watch(reg.installing))
        // check for a new version every half hour while the app is open
        window.setInterval(() => void reg.update().catch(() => {}), 30 * 60 * 1000)
      })
      .catch((err) => console.warn('Offline helper not registered', err))
  })
}

/** Switch to the new version (reloads the page). */
export function applyUpdate(): void {
  if (waiting) waiting.postMessage('skip-waiting')
  else window.location.reload()
}

/** Show the browser's "Install CycloMeasure?" box. */
export async function installApp(): Promise<void> {
  const p = usePwa.getState().installPrompt
  if (!p) return
  await p.prompt()
  await p.userChoice.catch(() => null)
  usePwa.setState({ installPrompt: null })
}
