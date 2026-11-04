/**
 * Which side panels and bars are open. A per-person convenience, so it's kept
 * in this browser's local storage (not in the project).
 */
import { create } from 'zustand'
import type { DimensionStyle, DimensionUnits } from './lib/dimensions'

/** How lengths are shown on shapes (a personal preference). */
export interface DimensionPrefs {
  style: DimensionStyle
  /** which shapes show their segment lengths */
  show: 'selected' | 'all' | 'off'
  units: DimensionUnits
  size: 'normal' | 'large'
}
export const DEFAULT_DIMS: DimensionPrefs = { style: 'offset', show: 'selected', units: 'm', size: 'normal' }

/** Advanced features, switched on in Settings when needed. */
export interface AdvancedPrefs {
  /** parts of a sheet at a different scale */
  scaleAreas: boolean
  /** compare two revisions of a plan set */
  compare: boolean
}
const DEFAULT_ADVANCED: AdvancedPrefs = { scaleAreas: false, compare: false }

export interface PanelState {
  sheets: boolean
  items: boolean
  scaleBar: boolean
}
type PanelName = keyof PanelState

const KEY = 'planmeasure.panels'
const ALL_OPEN: PanelState = { sheets: true, items: true, scaleBar: true }

function load(): { open: PanelState; beforeFocus: PanelState | null; snap: boolean; dims: DimensionPrefs; advanced: AdvancedPrefs } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { open: { ...ALL_OPEN, ...p.open }, beforeFocus: p.beforeFocus ?? null, snap: p.snap ?? true, dims: { ...DEFAULT_DIMS, ...p.dims }, advanced: { ...DEFAULT_ADVANCED, ...p.advanced } }
    }
  } catch {
    // storage unavailable (private window etc.) — just use the defaults
  }
  return { open: ALL_OPEN, beforeFocus: null, snap: true, dims: DEFAULT_DIMS, advanced: DEFAULT_ADVANCED }
}

interface Panels {
  open: PanelState
  /** what was open before Focus hid everything, so Focus again restores it */
  beforeFocus: PanelState | null
  setPanel: (name: PanelName, open: boolean) => void
  /** Hide every panel so the plan fills the screen; again to bring them back. */
  toggleFocus: () => void
  /** Snap to the drawing's linework while drawing (a personal preference). */
  snap: boolean
  setSnap: (on: boolean) => void
  dims: DimensionPrefs
  setDims: (patch: Partial<DimensionPrefs>) => void
  advanced: AdvancedPrefs
  setAdvanced: (patch: Partial<AdvancedPrefs>) => void
}

export const usePanels = create<Panels>((set, get) => ({
  ...load(),
  setSnap: (on) => set({ snap: on }),
  setDims: (patch) => set((s) => ({ dims: { ...s.dims, ...patch } })),
  setAdvanced: (patch) => set((s) => ({ advanced: { ...s.advanced, ...patch } })),
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
    localStorage.setItem(KEY, JSON.stringify({ open: s.open, beforeFocus: s.beforeFocus, snap: s.snap, dims: s.dims, advanced: s.advanced }))
  } catch {
    // ignore — it's only a convenience
  }
})

/** True when everything is hidden (Focus mode). */
export const isFocused = (s: PanelState) => !s.sheets && !s.items && !s.scaleBar
