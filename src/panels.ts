/**
 * Which side panels and bars are open. A per-person convenience, so it's kept
 * in this browser's local storage (not in the project).
 */
import { create } from 'zustand'

export interface PanelState {
  sheets: boolean
  items: boolean
  scaleBar: boolean
}
type PanelName = keyof PanelState

const KEY = 'planmeasure.panels'
const ALL_OPEN: PanelState = { sheets: true, items: true, scaleBar: true }

function load(): { open: PanelState; beforeFocus: PanelState | null } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { open: { ...ALL_OPEN, ...p.open }, beforeFocus: p.beforeFocus ?? null }
    }
  } catch {
    // storage unavailable (private window etc.) — just use the defaults
  }
  return { open: ALL_OPEN, beforeFocus: null }
}

interface Panels {
  open: PanelState
  /** what was open before Focus hid everything, so Focus again restores it */
  beforeFocus: PanelState | null
  setPanel: (name: PanelName, open: boolean) => void
  /** Hide every panel so the plan fills the screen; again to bring them back. */
  toggleFocus: () => void
}

export const usePanels = create<Panels>((set, get) => ({
  ...load(),
  setPanel: (name, open) => set((s) => ({ open: { ...s.open, [name]: open }, beforeFocus: null })),
  toggleFocus: () => {
    const { open, beforeFocus } = get()
    const anyOpen = open.sheets || open.items || open.scaleBar
    if (anyOpen) set({ open: { sheets: false, items: false, scaleBar: false }, beforeFocus: open })
    else set({ open: beforeFocus ?? ALL_OPEN, beforeFocus: null })
  },
}))

usePanels.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ open: s.open, beforeFocus: s.beforeFocus }))
  } catch {
    // ignore — it's only a convenience
  }
})

/** True when everything is hidden (Focus mode). */
export const isFocused = (s: PanelState) => !s.sheets && !s.items && !s.scaleBar
