/**
 * Marked-up PDF export from the open project.
 */
import * as db from './lib/db'
import { markupPrimitives, takeoffLabelPoint, takeoffPrimitives, textBlockSize, type Primitive } from './lib/markup'
import { getPageToPdf } from './lib/pdf'
import { buildMarkedUpPdf, type ExportPage } from './lib/pdfExport'
import { formatQuantity, takeoffQuantity } from './lib/takeoff'
import { scaleInfo, sheetName, useApp } from './store'

export type PageChoice = 'current' | 'marked' | 'all'

export interface PdfExportOptions {
  pages: PageChoice
  markups: boolean
  takeoffs: boolean
  /** put each takeoff's item name and quantity on the drawing */
  labels: boolean
}

type State = ReturnType<typeof useApp.getState>

/** Sheets with something on them that the export would draw. */
export function markedSheetIds(s: State, opts: Pick<PdfExportOptions, 'markups' | 'takeoffs'>): Set<string> {
  const ids = new Set<string>()
  if (opts.markups) for (const m of s.markups) ids.add(m.sheetId)
  if (opts.takeoffs) for (const t of s.takeoffs) ids.add(t.sheetId)
  return ids
}

/** The sheets an export would contain, in sheet-list order. */
export function sheetsToExport(s: State, opts: PdfExportOptions) {
  if (opts.pages === 'current') return s.sheets.filter((sh) => sh.id === s.selectedSheetId)
  if (opts.pages === 'all') return s.sheets
  const marked = markedSheetIds(s, opts)
  return s.sheets.filter((sh) => marked.has(sh.id))
}

/** Build the marked-up PDF and download it. */
export async function exportMarkedUpPdf(opts: PdfExportOptions): Promise<number> {
  const s = useApp.getState()
  if (!s.projectId) throw new Error('Open a project first.')
  const sheets = sheetsToExport(s, opts)
  if (!sheets.length) throw new Error('There are no pages to export with these settings.')

  const itemsById = new Map(s.items.map((i) => [i.id, i]))
  const pages: ExportPage[] = []
  for (const sheet of sheets) {
    const toPdf = await getPageToPdf(sheet)
    const takeoffs = opts.takeoffs ? s.takeoffs.filter((t) => t.sheetId === sheet.id) : []
    const markups = opts.markups ? s.markups.filter((m) => m.sheetId === sheet.id) : []
    const scale = scaleInfo(s.scales[sheet.id])
    pages.push({
      fileId: sheet.fileId,
      pageNumber: sheet.pageNumber,
      toPdf,
      build: (measure) => {
        const prims: Primitive[] = []
        for (const t of takeoffs) {
          const item = itemsById.get(t.itemId)
          if (item) prims.push(...takeoffPrimitives(t, item))
        }
        if (opts.labels) {
          for (const t of takeoffs) {
            const item = itemsById.get(t.itemId)
            if (!item || item.kind === 'count') continue
            const q = takeoffQuantity(t, item.kind, scale)
            const lines = [item.name, q.value === null ? 'no scale' : formatQuantity(q.value, item.kind)]
            const fontSize = 8
            const pad = 2.5
            const size = textBlockSize(lines, fontSize, measure)
            const at = takeoffLabelPoint(t, item)
            const box = { fill: '#ffffff', stroke: item.colour, padding: pad, width: size.width + pad * 2, height: size.height + pad * 2 }
            prims.push({ kind: 'text', at: { x: at.x - box.width / 2, y: at.y - box.height / 2 }, lines, fontSize, colour: '#111111', box })
          }
        }
        for (const m of markups) prims.push(...markupPrimitives(m, measure))
        return prims
      },
    })
  }

  const sources = await db.loadPdfs(s.projectId)
  const bytes = await buildMarkedUpPdf(sources, pages)

  const project = s.projectName || 'PlanMeasure'
  const suffix =
    opts.pages === 'current'
      ? sheetName(s.labels[sheets[0].id], s.sheets.indexOf(sheets[0]))
      : opts.pages === 'marked'
        ? 'marked-up sheets'
        : 'marked up'
  const name = `${project} - ${suffix}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  download(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), `${name}.pdf`)
  return sheets.length
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
