import { applyUpdate, installApp, usePwa } from '../pwa'

/** Header button: "Install app", shown when the browser offers it and we're not already the installed app. */
export function InstallButton() {
  const prompt = usePwa((s) => s.installPrompt)
  const installed = usePwa((s) => s.installed)
  if (!prompt || installed) return null
  return (
    <button
      onClick={() => void installApp()}
      className="rounded-md border border-chalk/40 px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-chalk hover:bg-white/10"
      title="Install CycloMeasure as a desktop app: its own window and icon, and it works offline"
      data-testid="install-app"
    >
      Install app
    </button>
  )
}

/** "A new version is ready" — never reloads by itself, so nobody's work is interrupted. */
export function UpdateBanner() {
  const ready = usePwa((s) => s.updateReady)
  if (!ready) return null
  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm text-graphite"
      role="status"
      data-testid="update-banner"
    >
      <span>A new version of CycloMeasure is ready. Your work is saved.</span>
      <button onClick={applyUpdate} className="rounded bg-accent px-3 py-1 font-medium text-graphite hover:bg-accent-hover">
        Reload
      </button>
      <button onClick={() => usePwa.setState({ updateReady: false })} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100">
        Later
      </button>
    </div>
  )
}

/** Settings section: install, or how to. */
export function DesktopAppSettings() {
  const prompt = usePwa((s) => s.installPrompt)
  const installed = usePwa((s) => s.installed)
  return (
    <>
      <h3 className="section-label mt-4">Desktop app</h3>
      {installed ? (
        <p className="mt-0.5 text-xs text-neutral-500">You’re using the installed CycloMeasure app. It works offline and updates itself.</p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-neutral-500">
            Install CycloMeasure to get its own window and a desktop or taskbar icon. It works offline, updates itself, and uses the same projects as this website.
          </p>
          {prompt ? (
            <button onClick={() => void installApp()} className="mt-2 rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover" data-testid="settings-install">
              Install app
            </button>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              In Chrome or Edge: the install icon at the right of the address bar, or the browser menu → “Install CycloMeasure” (Edge: Apps → Install this site as an app). Already installed? Open it from the Start menu or desktop.
            </p>
          )}
        </>
      )}
    </>
  )
}
