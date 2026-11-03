/**
 * PDF loading and rendering with pdf.js.
 * Everything happens locally in the browser — files are never uploaded.
 */
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`

/** One page of a loaded PDF. Sizes are in PDF points, with page rotation applied. */
export interface SheetMeta {
  id: string
  fileId: string
  fileName: string
  /** 1-based page number within its file */
  pageNumber: number
  widthPt: number
  heightPt: number
}

// PDF objects can't live in React/Zustand state, so they're kept here by id.
const documents = new Map<string, PDFDocumentProxy>()
// Their loading tasks, which are what pdf.js closes.
const loadingTasks = new Map<string, { destroy: () => Promise<void> }>()

/** A new, unique id for a PDF file (stable once saved in a project). */
export function newFileId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Open a PDF from its bytes and list its pages. `fileId` keeps sheet ids stable
 * (`<fileId>-p<n>`) so a saved project's takeoffs match up when it's reopened.
 */
export async function loadPdfBytes(bytes: Uint8Array, fileName: string, fileId: string): Promise<SheetMeta[]> {
  // pdf.js takes ownership of the buffer it's given, so hand it a copy.
  const data = bytes.slice()
  const task = pdfjs.getDocument({
    data,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
  })
  const doc = await task.promise
  void loadingTasks.get(fileId)?.destroy()
  documents.set(fileId, doc)
  loadingTasks.set(fileId, task)

  const sheets: SheetMeta[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const vp = page.getViewport({ scale: 1 })
    sheets.push({
      id: `${fileId}-p${n}`,
      fileId,
      fileName,
      pageNumber: n,
      widthPt: vp.width,
      heightPt: vp.height,
    })
  }
  return sheets
}

/** Close every open PDF (when switching projects) to free memory. */
export function closeAllDocuments(): void {
  for (const task of loadingTasks.values()) void task.destroy()
  loadingTasks.clear()
  documents.clear()
}

export function getPage(sheet: SheetMeta): Promise<PDFPageProxy> {
  const doc = documents.get(sheet.fileId)
  if (!doc) return Promise.reject(new Error(`PDF for ${sheet.id} is not loaded`))
  return doc.getPage(sheet.pageNumber)
}

export interface RenderHandle {
  promise: Promise<void>
  cancel: () => void
}

/**
 * Render a page (or part of it) into a canvas.
 * `scale` is device pixels per PDF point; `offsetX/Y` shift the page within the
 * canvas (in device pixels), which lets us render just the visible area.
 */
export function renderPage(
  sheet: SheetMeta,
  canvas: HTMLCanvasElement,
  scale: number,
  offsetX = 0,
  offsetY = 0,
): RenderHandle {
  let task: RenderTask | null = null
  let cancelled = false
  const promise = getPage(sheet).then(async (page) => {
    if (cancelled) return
    const viewport = page.getViewport({ scale, offsetX, offsetY })
    task = page.render({ canvas, viewport })
    try {
      await task.promise
    } catch (err) {
      if (err instanceof pdfjs.RenderingCancelledException) return
      throw err
    }
  })
  return {
    promise,
    cancel: () => {
      cancelled = true
      task?.cancel()
    },
  }
}

/** Render a small thumbnail image (as a data URL) about `cssWidth` px wide. */
export async function renderThumbnail(sheet: SheetMeta, cssWidth = 160): Promise<string> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const scale = (cssWidth * dpr) / sheet.widthPt
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(sheet.widthPt * scale)
  canvas.height = Math.ceil(sheet.heightPt * scale)
  await renderPage(sheet, canvas, scale).promise
  return canvas.toDataURL('image/png')
}

/**
 * A piece of text on the page, positioned as the page is displayed
 * (rotation applied, origin top-left, units PDF points).
 * (x, y) is the start of the text's baseline; `size` is its font height.
 */
export interface PageTextItem {
  str: string
  x: number
  y: number
  w: number
  size: number
}

export interface PageText {
  /** all text in reading order, joined with spaces (newlines at line ends) */
  text: string
  /** horizontal, upright text pieces with positions */
  items: PageTextItem[]
}

/** Read a page's text layer, with positions. */
export async function getPageText(sheet: SheetMeta): Promise<PageText> {
  const page = await getPage(sheet)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const parts: string[] = []
  const items: PageTextItem[] = []
  for (const item of content.items) {
    if (!('str' in item)) continue
    parts.push(item.str)
    if (item.hasEOL) parts.push('\n')
    if (!item.str.trim()) continue

    const t = item.transform
    const [x, y] = viewport.convertToViewportPoint(t[4], t[5])
    // Which way does the text run once the page is displayed?
    const [x2, y2] = viewport.convertToViewportPoint(t[4] + t[0], t[5] + t[1])
    const dx = x2 - x
    const dy = y2 - y
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx) * 0.2) continue // skip vertical / upside-down text
    items.push({ str: item.str, x, y, w: item.width, size: Math.hypot(t[2], t[3]) })
  }
  return { text: parts.join(' '), items }
}
