/**
 * Autosave: whenever the project's content changes, save it to browser storage
 * shortly afterwards. On start-up, reopen the most recent project.
 */
import * as db from './lib/db'
import { toProjectData, useApp } from './store'

type State = ReturnType<typeof useApp.getState>

/** The parts of state that are saved — a change to any of these triggers a save. */
const SAVED_KEYS = ['projectName', 'files', 'sheets', 'labels', 'scales', 'detections', 'items', 'takeoffs', 'selectedSheetId'] as const

const DELAY_MS = 800

let timer: number | undefined
let pending: State | null = null

async function save(s: State): Promise<void> {
  if (!s.projectId || s.restoring) return
  try {
    await db.saveProjectData(s.projectId, toProjectData(s))
    // Only report "saved" if nothing has changed since.
    if (useApp.getState().projectId === s.projectId && pending === null) useApp.setState({ saveStatus: 'saved' })
  } catch (err) {
    console.error('Autosave failed', err)
    useApp.setState({ saveStatus: 'error' })
  }
}

/** Save now if a save is waiting (e.g. the tab is being hidden or closed). */
export function flushSave(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = undefined
  const s = pending
  pending = null
  if (s) void save(s)
}

export function startPersistence(): void {
  useApp.subscribe((s, prev) => {
    // Switching projects: finish saving the one being left first.
    if (prev.projectId && s.projectId !== prev.projectId && pending?.projectId === prev.projectId) flushSave()
    if (!s.projectId || s.restoring) return
    if (!SAVED_KEYS.some((k) => s[k] !== prev[k]) && s.projectId === prev.projectId) return
    pending = s
    if (s.saveStatus !== 'saving') useApp.setState({ saveStatus: 'saving' })
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      const latest = pending
      pending = null
      if (latest) void save(latest)
    }, DELAY_MS)
  })

  window.addEventListener('pagehide', flushSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave()
  })

  void db.requestPersistentStorage()
  void reopenLastProject()
}

async function reopenLastProject(): Promise<void> {
  try {
    const [latest] = await db.listProjects()
    if (latest && !useApp.getState().projectId && !useApp.getState().sheets.length) {
      await useApp.getState().openProject(latest.id)
    }
  } catch (err) {
    console.error('Could not reopen the last project', err)
  }
}
