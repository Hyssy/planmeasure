import { create } from 'zustand'
import { getPageText, loadPdfFile, renderThumbnail, type SheetMeta } from './lib/pdf'
import {
  describeCandidate,
  distinctScales,
  equivalentRatio,
  findScaleCandidates,
  formatRatio,
  mmPerPtFromRatio,
  scaleSuitsPage,
  type ScaleCandidate,
} from './lib/scale'
import { detectSheetLabel } from './lib/sheetLabel'

export type Tool = 'pan' | 'calibrate' | 'measure'

/**
 * A sheet's scale.
 *  - 'detected': read from the sheet's text — a suggestion the user must verify.
 *  - 'confirmed': calibrated, chosen or confirmed by the user.
 */
export interface SheetScale {
  realMmPerPt: number
  status: 'detected' | 'confirmed'
  source: 'detected' | 'calibrated' | 'manual'
  /** e.g. "1:100 @ A1" or "Calibrated" */
  label: string
}

export interface ScaleDetection {
  done: boolean
  /** distinct scales found in the sheet's text that apply to this page */
  candidates: ScaleCandidate[]
  /** scales for a different sheet size (e.g. "@ A1" on an A3 page) — must calibrate */
  mismatched: ScaleCandidate[]
}

/** A sheet's number and title — detected, then editable. Empty string = unknown. */
export interface SheetLabel {
  number: string
  title: string
  /** true once the user has edited it */
  edited: boolean
}

/** "A-101", or "Sheet 3" when no number is known. */
export function sheetName(label: SheetLabel | undefined, index: number): string {
  return label?.number || `Sheet ${index + 1}`
}

interface AppState {
  sheets: SheetMeta[]
  selectedSheetId: string | null
  thumbnails: Record<string, string>
  scales: Record<string, SheetScale | undefined>
  detections: Record<string, ScaleDetection | undefined>
  labels: Record<string, SheetLabel | undefined>
  loading: boolean
  errors: string[]
  tool: Tool

  openFiles: (files: File[]) => Promise<void>
  selectSheet: (id: string) => void
  dismissErrors: () => void
  setTool: (tool: Tool) => void
  /** Use a ratio scale (from detection or picked by the user) — always confirmed. */
  setRatioScale: (sheetId: string, c: Pick<ScaleCandidate, 'ratio' | 'paper'>, source: 'detected' | 'manual') => void
  setCalibratedScale: (sheetId: string, realMmPerPt: number) => void
  confirmScale: (sheetId: string) => void
  clearScale: (sheetId: string) => void
  setLabel: (sheetId: string, number: string, title: string) => void
}

/** Scale for a 1:ratio drawing printed at its intended size on this page. */
export function ratioScale(c: Pick<ScaleCandidate, 'ratio' | 'paper'>): { realMmPerPt: number; label: string } {
  return { realMmPerPt: mmPerPtFromRatio(c.ratio), label: describeCandidate(c) }
}

export const useApp = create<AppState>((set) => ({
  sheets: [],
  selectedSheetId: null,
  thumbnails: {},
  scales: {},
  detections: {},
  labels: {},
  loading: false,
  errors: [],
  tool: 'pan',

  openFiles: async (files) => {
    const pdfs = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    const skipped = files.filter((f) => !pdfs.includes(f))
    const errors = skipped.map((f) => `${f.name} is not a PDF, so it was skipped.`)
    set({ loading: true, errors })

    const added: SheetMeta[] = []
    for (const file of pdfs) {
      try {
        const sheets = await loadPdfFile(file)
        added.push(...sheets)
        set((s) => ({
          sheets: [...s.sheets, ...sheets],
          selectedSheetId: s.selectedSheetId ?? sheets[0]?.id ?? null,
        }))
      } catch (err) {
        console.error(err)
        set((s) => ({ errors: [...s.errors, `Couldn't open ${file.name}. Is it a valid PDF?`] }))
      }
    }
    set({ loading: false })

    // Scale detection: read each sheet's text (fast), then make thumbnails (slower).
    for (const sheet of added) {
      let found: ScaleCandidate[] = []
      let label: SheetLabel = { number: '', title: '', edited: false }
      try {
        const { text, items } = await getPageText(sheet)
        found = distinctScales(findScaleCandidates(text))
        const pagesInFile = added.filter((a) => a.fileId === sheet.fileId).length
        const guess = detectSheetLabel(items, sheet.widthPt, sheet.heightPt, sheet.fileName, pagesInFile)
        label = { number: guess.number ?? '', title: guess.title ?? '', edited: false }
      } catch (err) {
        console.error('Text extraction failed', sheet.id, err)
      }
      const fits = (c: ScaleCandidate) => scaleSuitsPage(c, sheet.widthPt, sheet.heightPt)
      const candidates = found.filter(fits)
      const mismatched = found.filter((c) => !fits(c))
      set((s) => {
        const detections = { ...s.detections, [sheet.id]: { done: true, candidates, mismatched } }
        const labels = s.labels[sheet.id]?.edited ? s.labels : { ...s.labels, [sheet.id]: label }
        // Exactly one scale found, and it suits this page size → suggest it (still needs verifying).
        if (candidates.length === 1 && mismatched.length === 0 && !s.scales[sheet.id]) {
          const scale: SheetScale = { ...ratioScale(candidates[0]), status: 'detected', source: 'detected' }
          return { detections, labels, scales: { ...s.scales, [sheet.id]: scale } }
        }
        return { detections, labels }
      })
    }

    for (const sheet of added) {
      try {
        const url = await renderThumbnail(sheet)
        set((s) => ({ thumbnails: { ...s.thumbnails, [sheet.id]: url } }))
      } catch (err) {
        console.error('Thumbnail failed', sheet.id, err)
      }
    }
  },

  selectSheet: (id) => set({ selectedSheetId: id }),
  dismissErrors: () => set({ errors: [] }),
  setTool: (tool) => set({ tool }),

  setRatioScale: (sheetId, c, source) => {
    const scale: SheetScale = { ...ratioScale(c), status: 'confirmed', source }
    set((s) => ({ scales: { ...s.scales, [sheetId]: scale } }))
  },

  setCalibratedScale: (sheetId, realMmPerPt) => {
    const scale: SheetScale = {
      realMmPerPt,
      status: 'confirmed',
      source: 'calibrated',
      label: `Calibrated (≈ ${formatRatio(equivalentRatio(realMmPerPt))})`,
    }
    set((s) => ({ scales: { ...s.scales, [sheetId]: scale } }))
  },

  confirmScale: (sheetId) =>
    set((s) => {
      const scale = s.scales[sheetId]
      if (!scale) return {}
      return { scales: { ...s.scales, [sheetId]: { ...scale, status: 'confirmed' } } }
    }),

  clearScale: (sheetId) => set((s) => ({ scales: { ...s.scales, [sheetId]: undefined } })),

  setLabel: (sheetId, number, title) =>
    set((s) => ({
      labels: { ...s.labels, [sheetId]: { number: number.trim(), title: title.trim(), edited: true } },
    })),
}))
