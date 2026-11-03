import { create } from 'zustand'
import { getPageText, loadPdfFile, renderThumbnail, type SheetMeta } from './lib/pdf'
import {
  describeCandidate,
  distinctScales,
  equivalentRatio,
  findScaleCandidates,
  formatRatio,
  mmPerPtFromRatio,
  type PaperName,
  type ScaleCandidate,
} from './lib/scale'

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
  /** distinct scales found in the sheet's text */
  candidates: ScaleCandidate[]
}

interface AppState {
  sheets: SheetMeta[]
  selectedSheetId: string | null
  thumbnails: Record<string, string>
  scales: Record<string, SheetScale | undefined>
  detections: Record<string, ScaleDetection | undefined>
  loading: boolean
  errors: string[]
  tool: Tool

  openFiles: (files: File[]) => Promise<void>
  selectSheet: (id: string) => void
  dismissErrors: () => void
  setTool: (tool: Tool) => void
  /** Use a ratio scale (from detection or picked by the user) — always confirmed. */
  setRatioScale: (sheetId: string, ratio: number, paper: PaperName | null, source: 'detected' | 'manual') => void
  setCalibratedScale: (sheetId: string, realMmPerPt: number) => void
  confirmScale: (sheetId: string) => void
  clearScale: (sheetId: string) => void
}

export function ratioScale(
  sheet: SheetMeta,
  ratio: number,
  paper: PaperName | null,
): { realMmPerPt: number; label: string } {
  const realMmPerPt = mmPerPtFromRatio(ratio, paper, sheet.widthPt, sheet.heightPt)
  let label = describeCandidate({ ratio, paper })
  const effective = equivalentRatio(realMmPerPt)
  if (Math.abs(effective - ratio) / ratio > 0.01) label += ` (${formatRatio(effective)} on this page)`
  return { realMmPerPt, label }
}

export const useApp = create<AppState>((set, get) => ({
  sheets: [],
  selectedSheetId: null,
  thumbnails: {},
  scales: {},
  detections: {},
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
      let candidates: ScaleCandidate[] = []
      try {
        candidates = distinctScales(findScaleCandidates(await getPageText(sheet)))
      } catch (err) {
        console.error('Text extraction failed', sheet.id, err)
      }
      set((s) => {
        const detections = { ...s.detections, [sheet.id]: { done: true, candidates } }
        // Exactly one scale found → suggest it (still needs verifying).
        if (candidates.length === 1 && !s.scales[sheet.id]) {
          const c = candidates[0]
          const scale: SheetScale = {
            ...ratioScale(sheet, c.ratio, c.paper),
            status: 'detected',
            source: 'detected',
          }
          return { detections, scales: { ...s.scales, [sheet.id]: scale } }
        }
        return { detections }
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

  setRatioScale: (sheetId, ratio, paper, source) => {
    const sheet = get().sheets.find((s) => s.id === sheetId)
    if (!sheet) return
    const scale: SheetScale = { ...ratioScale(sheet, ratio, paper), status: 'confirmed', source }
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
}))
