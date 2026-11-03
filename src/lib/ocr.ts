/**
 * OCR for "flattened" sheets — PDFs whose text has been turned into images or
 * outlines, so there's no text layer to read (common on council DA portals).
 *
 * Only the title block areas are read (bottom-right corner and right-hand
 * strip), which keeps it to a few seconds per sheet. Runs entirely in the
 * browser; the OCR engine and English model are served with the app.
 */
import type { Worker } from 'tesseract.js'
import { renderPage, type PageText, type PageTextItem, type SheetMeta } from './pdf'

const BASE = `${import.meta.env.BASE_URL}tesseract/`

/** Areas of the page to read, as fractions of the displayed page. */
export const OCR_REGIONS = [
  { name: 'bottom-right', x0: 0.5, y0: 0.62, x1: 1, y1: 1 },
  { name: 'right strip', x0: 0.78, y0: 0, x1: 1, y1: 0.62 },
]

/** Render resolution: 250 dpi, but no more than 12 megapixels per area. */
const TARGET_PX_PER_PT = 250 / 72
const MAX_PIXELS = 12_000_000
/** Words tesseract is less sure of than this are dropped. */
const MIN_CONFIDENCE = 35

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  workerPromise ??= import('tesseract.js').then(async ({ createWorker }) => {
    const worker = await createWorker('eng', 1 /* LSTM only */, {
      workerPath: `${BASE}worker.min.js`,
      corePath: `${BASE}core`,
      langPath: `${BASE}lang`,
      gzip: true,
      workerBlobURL: false,
    })
    // "Sparse text": find every scrap of text in no particular order. Title blocks are
    // boxes of short fields, not paragraphs — the default page layout mode skips some.
    await worker.setParameters({ tessedit_pageseg_mode: '11' as never, user_defined_dpi: '250' })
    return worker
  })
  return workerPromise
}

/** Does this page have (almost) no real text, so needs OCR? */
export function needsOcr(text: PageText): boolean {
  return text.items.length < 3
}

/** Read the title block areas of a sheet with OCR. */
export async function ocrSheetText(sheet: SheetMeta): Promise<PageText> {
  const worker = await getWorker()
  const items: PageTextItem[] = []
  const lines: string[] = []

  for (const r of OCR_REGIONS) {
    const rx = r.x0 * sheet.widthPt
    const ry = r.y0 * sheet.heightPt
    const rw = (r.x1 - r.x0) * sheet.widthPt
    const rh = (r.y1 - r.y0) * sheet.heightPt
    const s = Math.min(TARGET_PX_PER_PT, Math.sqrt(MAX_PIXELS / (rw * rh)))

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(rw * s)
    canvas.height = Math.round(rh * s)
    await renderPage(sheet, canvas, s, -rx * s, -ry * s).promise

    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          // Tesseract's row height (ascenders to descenders) matches the font size closely;
          // the box height is smaller for capitals, so it's only a fallback.
          const fontSize = (line.rowAttributes?.rowHeight || (line.bbox.y1 - line.bbox.y0) * 1.3) / s
          const baseline = ry + (line.baseline.y0 + line.baseline.y1) / 2 / s
          const words = line.words.filter((w) => w.confidence >= MIN_CONFIDENCE && w.text.trim())
          if (!words.length) continue
          lines.push(normaliseOcrText(words.map((w) => w.text).join(' ')))
          for (const w of words) {
            items.push({
              str: normaliseOcrWord(w.text),
              x: rx + w.bbox.x0 / s,
              y: baseline,
              w: (w.bbox.x1 - w.bbox.x0) / s,
              size: fontSize,
            })
          }
        }
      }
    }
  }
  return { text: lines.join('\n'), items }
}

// ---------------------------------------------------------------------------
// Fixing common OCR misreads
// ---------------------------------------------------------------------------

/**
 * Fix misreads that matter for scales: "l:100", "I:100" or "|:100" for "1:100",
 * "1;100" for "1:100", and sheet sizes after "@"/"AT" such as "@ Al" for "@ A1"
 * or "@ AO" for "@ A0" (missing these would hide a resized sheet).
 */
export function normaliseOcrText(text: string): string {
  return text
    .replace(/(^|[^A-Za-z0-9])[lI|](?=\s*[:;]\s*\d)/g, '$11')
    .replace(/(\d)\s*;\s*(\d)/g, '$1:$2')
    .replace(/(@|\bAT)\s*A([lI|]|O)(?![A-Za-z0-9])/gi, (_m, at: string, d: string) => `${at} A${/o/i.test(d) ? '0' : '1'}`)
}

/**
 * Fix misreads inside one word: scales as above, and letter O / I / l read in
 * the digits of a sheet number ("A-1O1" → "A-101", "DAO2" → "DA02").
 */
export function normaliseOcrWord(word: string): string {
  const w = normaliseOcrText(word)
  const m = w.match(/^([A-Z]{1,4}(?:[-_.][A-Z]{1,3})?[-_.]?)([0-9OIl]{2,4})([A-Z]?)$/)
  if (m && /\d/.test(m[2])) {
    return m[1] + m[2].replace(/O/g, '0').replace(/[Il]/g, '1') + m[3]
  }
  // "DAO2": letters swallowed a zero — only when what follows is all digits
  const m2 = w.match(/^([A-Z]{1,3})O(\d{1,3})$/)
  if (m2) return `${m2[1]}0${m2[2]}`
  return w
}
