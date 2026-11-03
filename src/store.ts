import { create } from 'zustand'
import { loadPdfFile, renderThumbnail, type SheetMeta } from './lib/pdf'

export type Tool = 'pan'

interface AppState {
  sheets: SheetMeta[]
  selectedSheetId: string | null
  thumbnails: Record<string, string>
  loading: boolean
  errors: string[]
  tool: Tool

  openFiles: (files: File[]) => Promise<void>
  selectSheet: (id: string) => void
  dismissErrors: () => void
}

export const useApp = create<AppState>((set) => ({
  sheets: [],
  selectedSheetId: null,
  thumbnails: {},
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

    // Thumbnails are generated one at a time in the background.
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
}))
