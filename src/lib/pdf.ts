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

let nextFileId = 1

export async function loadPdfFile(file: File): Promise<SheetMeta[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
  }).promise

  const fileId = `f${nextFileId++}`
  documents.set(fileId, doc)

  const sheets: SheetMeta[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const vp = page.getViewport({ scale: 1 })
    sheets.push({
      id: `${fileId}-p${n}`,
      fileId,
      fileName: file.name,
      pageNumber: n,
      widthPt: vp.width,
      heightPt: vp.height,
    })
  }
  return sheets
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

/** All the text on a page, in reading order, joined with spaces. */
export async function getPageText(sheet: SheetMeta): Promise<string> {
  const page = await getPage(sheet)
  const content = await page.getTextContent()
  const parts: string[] = []
  for (const item of content.items) {
    if ('str' in item) {
      parts.push(item.str)
      if (item.hasEOL) parts.push('\n')
    }
  }
  return parts.join(' ')
}
