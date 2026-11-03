import { create } from 'zustand'
import { needsOcr, ocrSheetText } from './lib/ocr'
import * as db from './lib/db'
import { closeAllDocuments, getPageText, loadPdfBytes, newFileId, renderThumbnail, type PageText, type SheetMeta } from './lib/pdf'
import {
  buildExport,
  exportFileName,
  parseExport,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  sha256Hex,
  type ProjectData,
  type ProjectFileMeta,
} from './lib/projectFile'
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
import { ITEM_COLOURS, KIND_LABEL, type Item, type SheetScaleInfo, type Takeoff, type TakeoffKind } from './lib/takeoff'


export type Tool = 'select' | 'pan' | 'calibrate' | 'measure' | TakeoffKind

export const TAKEOFF_TOOLS: TakeoffKind[] = ['linear', 'area', 'perimeter', 'count']

/** How a takeoff shape is drawn: clicking corners, dragging a rectangle, or freehand. */
export type DrawStyle = 'polygon' | 'rectangle' | 'freehand'
export type StyledKind = 'linear' | 'area' | 'perimeter'
export const DRAW_STYLES: Record<StyledKind, DrawStyle[]> = {
  linear: ['polygon', 'freehand'],
  area: ['polygon', 'rectangle', 'freehand'],
  perimeter: ['polygon', 'rectangle', 'freehand'],
}

export function isTakeoffTool(tool: Tool): tool is TakeoffKind {
  return (TAKEOFF_TOOLS as Tool[]).includes(tool)
}

/** Undo/redo keeps copies of the takeoff data. */
interface Snapshot {
  items: Item[]
  takeoffs: Takeoff[]
}
const HISTORY_LIMIT = 200

let nextId = 1
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(nextId++).toString(36)}`

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
  /**
   * OCR for sheets with no text layer: 'none' = not needed; 'pending'/'running'
   * = in progress; 'done' = results came from OCR; 'failed' = OCR didn't work.
   */
  ocr: 'none' | 'pending' | 'running' | 'done' | 'failed'
}

/** A sheet's number and title — detected, then editable. Empty string = unknown. */
export interface SheetLabel {
  number: string
  title: string
  /** true once the user has edited it */
  edited: boolean
  /** true if read by OCR (less reliable — worth checking) */
  fromOcr?: boolean
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
  /** 'Opening…' message while a project or PDFs load */
  loadingMessage: string

  // ---- Project ----
  projectId: string | null
  projectName: string
  files: ProjectFileMeta[]
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  /** true while a project is being restored (autosave waits) */
  restoring: boolean
  newProject: () => void
  openProject: (id: string) => Promise<void>
  renameProject: (name: string) => void
  deleteProject: (id: string) => Promise<void>
  exportProject: () => Promise<void>
  importProject: (file: File) => Promise<void>
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

  // ---- Takeoff ----
  drawStyles: Record<StyledKind, DrawStyle>
  setDrawStyle: (kind: StyledKind, style: DrawStyle) => void
  items: Item[]
  takeoffs: Takeoff[]
  /** the item new shapes are added to */
  activeItemId: string | null
  selectedTakeoffId: string | null
  past: Snapshot[]
  future: Snapshot[]

  addItem: (kind: TakeoffKind, fields?: Partial<Pick<Item, 'name' | 'colour' | 'trade'>>) => string
  updateItem: (id: string, patch: Partial<Omit<Item, 'id' | 'kind'>>) => void
  deleteItem: (id: string) => void
  /** Make an item active and switch to its drawing tool. */
  activateItem: (id: string) => void
  /** Add a finished shape to the active item (creating an item if needed). Returns its id. */
  addTakeoff: (sheetId: string, kind: TakeoffKind, points: Takeoff['points']) => string
  updateTakeoff: (id: string, patch: Partial<Pick<Takeoff, 'points' | 'holes' | 'itemId'>>, recordUndo?: boolean) => void
  deleteTakeoff: (id: string) => void
  selectTakeoff: (id: string | null) => void
  /** Area shape currently getting a cut-out drawn on it */
  cutoutFor: string | null
  startCutout: (takeoffId: string) => void
  cancelCutout: () => void
  addCutout: (takeoffId: string, points: Takeoff['points']) => void
  removeCutout: (takeoffId: string, index: number) => void
  /** Save the current state for undo (call once before a drag that updates without recording). */
  checkpoint: () => void
  undo: () => void
  redo: () => void
}

/** The sheet's scale in the form quantity maths needs. */
export function scaleInfo(scale: SheetScale | undefined): SheetScaleInfo | undefined {
  if (!scale) return undefined
  return { realMmPerPt: scale.realMmPerPt, state: scale.status === 'confirmed' ? 'confirmed' : 'unverified' }
}

/** Scale for a 1:ratio drawing printed at its intended size on this page. */
export function ratioScale(c: Pick<ScaleCandidate, 'ratio' | 'paper'>): { realMmPerPt: number; label: string } {
  return { realMmPerPt: mmPerPtFromRatio(c.ratio), label: describeCandidate(c) }
}

/**
 * Work out a sheet's scale and label from its text (text layer or OCR) and
 * merge them into state — without overwriting anything the user has set.
 */
function applyTextResults(
  s: AppState,
  sheet: SheetMeta,
  text: PageText,
  pagesInFile: number,
  ocr: ScaleDetection['ocr'],
): Partial<AppState> {
  const found = distinctScales(findScaleCandidates(text.text))
  const fits = (c: ScaleCandidate) => scaleSuitsPage(c, sheet.widthPt, sheet.heightPt)
  const candidates = found.filter(fits)
  const mismatched = found.filter((c) => !fits(c))
  const guess = detectSheetLabel(text.items, sheet.widthPt, sheet.heightPt, sheet.fileName, pagesInFile)
  const fromOcr = ocr === 'done'
  const label: SheetLabel = { number: guess.number ?? '', title: guess.title ?? '', edited: false, fromOcr }

  const detections = { ...s.detections, [sheet.id]: { done: true, candidates, mismatched, ocr } }
  const labels = s.labels[sheet.id]?.edited ? s.labels : { ...s.labels, [sheet.id]: label }
  // Exactly one scale found, and it suits this page size → suggest it (still needs verifying).
  if (candidates.length === 1 && mismatched.length === 0 && !s.scales[sheet.id]) {
    const scale: SheetScale = { ...ratioScale(candidates[0]), status: 'detected', source: 'detected' }
    return { detections, labels, scales: { ...s.scales, [sheet.id]: scale } }
  }
  return { detections, labels }
}

/** Bumped when the open project changes, so background work for the old one stops. */
let generation = 0

/** State for an empty project (keeps tool and UI preferences). */
function emptyProject(): Partial<AppState> {
  return {
    sheets: [],
    selectedSheetId: null,
    thumbnails: {},
    scales: {},
    detections: {},
    labels: {},
    files: [],
    items: [],
    takeoffs: [],
    activeItemId: null,
    selectedTakeoffId: null,
    cutoutFor: null,
    past: [],
    future: [],
  }
}

/** The saved form of the open project. */
export function toProjectData(s: AppState): ProjectData {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: s.projectName,
    savedAt: new Date().toISOString(),
    files: s.files,
    sheets: s.sheets,
    labels: s.labels,
    scales: s.scales,
    detections: s.detections,
    items: s.items,
    takeoffs: s.takeoffs,
    selectedSheetId: s.selectedSheetId,
  }
}

function snap(s: AppState): Snapshot {
  return { items: s.items, takeoffs: s.takeoffs }
}

/** Push the current takeoff data onto the undo stack (and clear redo). */
function record(s: AppState): Pick<AppState, 'past' | 'future'> {
  return { past: [...s.past, snap(s)].slice(-HISTORY_LIMIT), future: [] }
}

/** After undo/redo, drop selections that point at things that no longer exist. */
function keepValidRefs(s: AppState, next: Snapshot): Partial<AppState> {
  return {
    activeItemId: next.items.some((i) => i.id === s.activeItemId) ? s.activeItemId : null,
    selectedTakeoffId: next.takeoffs.some((t) => t.id === s.selectedTakeoffId) ? s.selectedTakeoffId : null,
    cutoutFor: null,
  }
}

function withOcrStatus(s: AppState, sheetId: string, ocr: ScaleDetection['ocr']): Partial<AppState> {
  const d = s.detections[sheetId]
  return d ? { detections: { ...s.detections, [sheetId]: { ...d, ocr } } } : {}
}

export const useApp = create<AppState>((set, get) => ({
  sheets: [],
  selectedSheetId: null,
  thumbnails: {},
  scales: {},
  detections: {},
  labels: {},
  drawStyles: { linear: 'polygon', area: 'polygon', perimeter: 'polygon' },
  setDrawStyle: (kind, style) => set((s) => ({ drawStyles: { ...s.drawStyles, [kind]: style } })),
  items: [],
  takeoffs: [],
  activeItemId: null,
  selectedTakeoffId: null,
  cutoutFor: null,
  past: [],
  future: [],
  loading: false,
  loadingMessage: '',
  errors: [],
  projectId: null,
  projectName: '',
  files: [],
  saveStatus: 'idle',
  restoring: false,
  tool: 'pan',

  openFiles: async (files) => {
    const pdfs = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    const skipped = files.filter((f) => !pdfs.includes(f))
    const errors = skipped.map((f) => `${f.name} is not a PDF, so it was skipped.`)
    if (!pdfs.length) {
      set({ errors })
      return
    }
    set({ loading: true, loadingMessage: 'Opening PDFs…', errors })
    const gen = generation

    // Opening PDFs with no project open starts one, named after the first file.
    let projectId = get().projectId
    if (!projectId) {
      projectId = db.newProjectId()
      const name = pdfs[0].name.replace(/\.pdf$/i, '')
      await db.createProject(projectId, name)
      set({ projectId, projectName: name })
    }

    const added: SheetMeta[] = []
    for (const file of pdfs) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const sha256 = await sha256Hex(bytes)
        if (get().files.some((f) => f.sha256 === sha256)) {
          set((s) => ({ errors: [...s.errors, `${file.name} is already open in this project.`] }))
          continue
        }
        const fileId = newFileId()
        const sheets = await loadPdfBytes(bytes, file.name, fileId)
        await db.savePdf(projectId, fileId, file)
        if (gen !== generation) return
        added.push(...sheets)
        set((s) => ({
          files: [...s.files, { fileId, name: file.name, size: bytes.length, sha256 }],
          sheets: [...s.sheets, ...sheets],
          selectedSheetId: s.selectedSheetId ?? sheets[0]?.id ?? null,
        }))
      } catch (err) {
        console.error(err)
        set((s) => ({ errors: [...s.errors, `Couldn't open ${file.name}. Is it a valid PDF?`] }))
      }
    }
    set({ loading: false })
    await processSheets(added, added)
  },

  newProject: () => {
    generation++
    closeAllDocuments()
    set({ ...emptyProject(), projectId: null, projectName: '', saveStatus: 'idle' })
  },

  openProject: async (id) => {
    const gen = ++generation
    closeAllDocuments()
    set({ ...emptyProject(), projectId: null, restoring: true, loading: true, loadingMessage: 'Opening project…', errors: [] })
    try {
      const [records, data, pdfs] = await Promise.all([db.listProjects(), db.loadProjectData(id), db.loadPdfs(id)])
      const record = records.find((r) => r.id === id)
      if (!record) throw new Error('That project no longer exists.')
      if (!data) {
        // Created but nothing saved yet (e.g. the PDF failed to open).
        set({ projectId: id, projectName: record.name, restoring: false, loading: false })
        return
      }
      const missing: string[] = []
      for (const f of data.files) {
        const bytes = pdfs.get(f.fileId)
        if (!bytes) {
          missing.push(f.name)
          continue
        }
        await loadPdfBytes(bytes, f.name, f.fileId)
        if (gen !== generation) return
      }
      const loadedFiles = new Set(data.files.filter((f) => !missing.includes(f.name)).map((f) => f.fileId))
      const sheets = data.sheets.filter((sh) => loadedFiles.has(sh.fileId))
      set({
        projectId: id,
        projectName: record.name,
        files: data.files.filter((f) => loadedFiles.has(f.fileId)),
        sheets,
        labels: data.labels as AppState['labels'],
        scales: data.scales as AppState['scales'],
        detections: data.detections as AppState['detections'],
        items: data.items,
        takeoffs: data.takeoffs,
        selectedSheetId: sheets.some((sh) => sh.id === data.selectedSheetId) ? data.selectedSheetId : (sheets[0]?.id ?? null),
        restoring: false,
        loading: false,
        saveStatus: 'saved',
        errors: missing.map((n) => `The PDF “${n}” couldn’t be found in browser storage.`),
      })
      // Sheets whose text wasn't finished reading (e.g. OCR still running when the app closed) are read again.
      const unfinished = sheets.filter((sh) => {
        const d = get().detections[sh.id]
        return !d?.done || d.ocr === 'pending' || d.ocr === 'running'
      })
      await processSheets(sheets, unfinished)
    } catch (err) {
      console.error('Open project failed', err)
      if (gen === generation) {
        set({ restoring: false, loading: false, errors: [`Couldn’t open the project: ${(err as Error).message}`] })
      }
    }
  },

  renameProject: (name) => set({ projectName: name.trim() || get().projectName }),

  deleteProject: async (id) => {
    await db.deleteProject(id)
    if (get().projectId === id) get().newProject()
  },

  exportProject: async () => {
    const s = get()
    if (!s.projectId) return
    const pdfs = await db.loadPdfs(s.projectId)
    const text = buildExport(toProjectData(s), pdfs)
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = exportFileName(s.projectName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  },

  importProject: async (file) => {
    set({ loading: true, loadingMessage: 'Importing project…', errors: [] })
    try {
      const { data, pdfs } = await parseExport(await file.text())
      const id = db.newProjectId()
      await db.createProject(id, data.name)
      for (const f of data.files) {
        await db.savePdf(id, f.fileId, new Blob([pdfs.get(f.fileId)! as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
      }
      await db.saveProjectData(id, { ...data, savedAt: new Date().toISOString() })
      await get().openProject(id)
    } catch (err) {
      console.error('Import failed', err)
      set({ loading: false, errors: [(err as Error).message || 'Couldn’t import that file.'] })
    }
  },

  selectSheet: (id) => set({ selectedSheetId: id }),
  dismissErrors: () => set({ errors: [] }),
  setTool: (tool) =>
    set((s) => {
      // Switching to a takeoff tool: keep the active item if it matches, else use the latest of that kind.
      if (!isTakeoffTool(tool)) return { tool, cutoutFor: null }
      const active = s.items.find((i) => i.id === s.activeItemId)
      if (active?.kind === tool) return { tool, selectedTakeoffId: null, cutoutFor: null }
      const latest = [...s.items].reverse().find((i) => i.kind === tool)
      return { tool, activeItemId: latest?.id ?? null, selectedTakeoffId: null, cutoutFor: null }
    }),

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

  addItem: (kind, fields = {}) => {
    const id = newId('i')
    set((s) => {
      const sameKind = s.items.filter((i) => i.kind === kind).length
      const item: Item = {
        id,
        kind,
        name: fields.name ?? `${KIND_LABEL[kind]} ${sameKind + 1}`,
        colour: fields.colour ?? ITEM_COLOURS[s.items.length % ITEM_COLOURS.length],
        trade: fields.trade ?? '',
      }
      return { ...record(s), items: [...s.items, item], activeItemId: id }
    })
    return id
  },

  updateItem: (id, patch) =>
    set((s) => ({ ...record(s), items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

  deleteItem: (id) =>
    set((s) => ({
      ...record(s),
      items: s.items.filter((i) => i.id !== id),
      takeoffs: s.takeoffs.filter((t) => t.itemId !== id),
      activeItemId: s.activeItemId === id ? null : s.activeItemId,
      selectedTakeoffId: s.takeoffs.some((t) => t.id === s.selectedTakeoffId && t.itemId === id) ? null : s.selectedTakeoffId,
    })),

  activateItem: (id) =>
    set((s) => {
      const item = s.items.find((i) => i.id === id)
      return item ? { activeItemId: id, tool: item.kind, selectedTakeoffId: null } : {}
    }),

  addTakeoff: (sheetId, kind, points) => {
    const id = newId('t')
    set((s) => {
      let items = s.items
      let itemId = s.activeItemId
      if (!items.find((i) => i.id === itemId && i.kind === kind)) {
        // No suitable item yet: make one.
        itemId = newId('i')
        const sameKind = items.filter((i) => i.kind === kind).length
        items = [...items, { id: itemId, kind, name: `${KIND_LABEL[kind]} ${sameKind + 1}`, colour: ITEM_COLOURS[items.length % ITEM_COLOURS.length], trade: '' }]
      }
      const takeoff: Takeoff = { id, itemId: itemId!, sheetId, points, holes: [] }
      return { ...record(s), items, activeItemId: itemId, takeoffs: [...s.takeoffs, takeoff] }
    })
    return id
  },

  updateTakeoff: (id, patch, recordUndo = true) =>
    set((s) => ({
      ...(recordUndo ? record(s) : {}),
      takeoffs: s.takeoffs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  deleteTakeoff: (id) =>
    set((s) => ({
      ...record(s),
      takeoffs: s.takeoffs.filter((t) => t.id !== id),
      selectedTakeoffId: s.selectedTakeoffId === id ? null : s.selectedTakeoffId,
    })),

  selectTakeoff: (id) => set((s) => ({ selectedTakeoffId: id, cutoutFor: id === s.cutoutFor ? s.cutoutFor : null })),

  startCutout: (takeoffId) => set({ cutoutFor: takeoffId, selectedTakeoffId: takeoffId, tool: 'select' }),
  cancelCutout: () => set({ cutoutFor: null }),
  addCutout: (takeoffId, points) =>
    set((s) => ({
      ...record(s),
      cutoutFor: null,
      takeoffs: s.takeoffs.map((t) => (t.id === takeoffId ? { ...t, holes: [...t.holes, points] } : t)),
    })),
  removeCutout: (takeoffId, index) =>
    set((s) => ({
      ...record(s),
      takeoffs: s.takeoffs.map((t) => (t.id === takeoffId ? { ...t, holes: t.holes.filter((_, i) => i !== index) } : t)),
    })),

  checkpoint: () => set((s) => record(s)),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1]
      if (!prev) return {}
      return { ...prev, ...keepValidRefs(s, prev), past: s.past.slice(0, -1), future: [...s.future, snap(s)] }
    }),

  redo: () =>
    set((s) => {
      const next = s.future[s.future.length - 1]
      if (!next) return {}
      return { ...next, ...keepValidRefs(s, next), future: s.future.slice(0, -1), past: [...s.past, snap(s)] }
    }),

  setLabel: (sheetId, number, title) =>
    set((s) => ({
      labels: { ...s.labels, [sheetId]: { number: number.trim(), title: title.trim(), edited: true } },
    })),
}))

/**
 * Background work for newly opened sheets: read text (scale and label) for
 * `needText`, make thumbnails for all of `sheets`, then OCR sheets with no text.
 * Stops if another project is opened meanwhile.
 */
async function processSheets(sheets: SheetMeta[], needText: SheetMeta[]): Promise<void> {
  const gen = generation
  const set = useApp.setState
  const pagesInFile = (sheet: SheetMeta) => useApp.getState().sheets.filter((a) => a.fileId === sheet.fileId).length

  // 1. Read each sheet's text layer (fast): scale and sheet label.
  const forOcr: SheetMeta[] = []
  for (const sheet of needText) {
    let text: PageText = { text: '', items: [] }
    try {
      text = await getPageText(sheet)
    } catch (err) {
      console.error('Text extraction failed', sheet.id, err)
    }
    if (gen !== generation) return
    const ocr = needsOcr(text) ? 'pending' : 'none'
    if (ocr === 'pending') forOcr.push(sheet)
    set((s) => applyTextResults(s, sheet, text, pagesInFile(sheet), ocr))
  }

  // 2. Thumbnails.
  for (const sheet of sheets) {
    try {
      const url = await renderThumbnail(sheet)
      if (gen !== generation) return
      set((s) => ({ thumbnails: { ...s.thumbnails, [sheet.id]: url } }))
    } catch (err) {
      console.error('Thumbnail failed', sheet.id, err)
    }
  }

  // 3. OCR the title blocks of sheets with no text layer (slow — a few seconds each).
  for (const sheet of forOcr) {
    if (gen !== generation) return
    set((s) => withOcrStatus(s, sheet.id, 'running'))
    try {
      const text = await ocrSheetText(sheet)
      if (gen !== generation) return
      set((s) => applyTextResults(s, sheet, text, pagesInFile(sheet), 'done'))
    } catch (err) {
      console.error('OCR failed', sheet.id, err)
      if (gen === generation) set((s) => withOcrStatus(s, sheet.id, 'failed'))
    }
  }
}
