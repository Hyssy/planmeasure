/**
 * Export a marked-up PDF: the original pages, with markups and takeoffs drawn
 * into them ("flattened" — part of the page, not editable annotations).
 *
 * The original drawings are copied as they are (still vector, still sharp);
 * only our shapes are added on top. Pages from several PDFs combine into one.
 */
import { degrees, PDFDocument, popGraphicsState, pushGraphicsState, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { LINE_HEIGHT, type MeasureText, type Primitive } from './markup'
import type { Point } from './scale'

/** One page to export. */
export interface ExportPage {
  fileId: string
  /** 1-based page number in its PDF */
  pageNumber: number
  /** turns a point on the displayed page (our page points) into the PDF's own coordinates */
  toPdf: (p: Point) => [number, number]
  /** what to draw, in displayed-page points */
  build: (measure: MeasureText) => Primitive[]
}

export class PdfExportError extends Error {}

/** Build the marked-up PDF. `sources` gives each original PDF's bytes by fileId. */
export async function buildMarkedUpPdf(sources: Map<string, Uint8Array>, pages: ExportPage[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)
  const bold = await out.embedFont(StandardFonts.HelveticaBold)
  const measure: MeasureText = (line, size) => font.widthOfTextAtSize(winAnsiSafe(line, font), size)
  const loaded = new Map<string, PDFDocument>()

  for (const pg of pages) {
    let src = loaded.get(pg.fileId)
    if (!src) {
      const bytes = sources.get(pg.fileId)
      if (!bytes) throw new PdfExportError('One of the PDFs is missing from this project.')
      try {
        src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
      } catch {
        throw new PdfExportError('One of the PDFs couldn’t be read for export (it may be damaged or password-protected).')
      }
      loaded.set(pg.fileId, src)
    }
    const [page] = await out.copyPages(src, [pg.pageNumber - 1])
    out.addPage(page)
    isolateOriginalContent(out, page)
    for (const prim of pg.build(measure)) drawPrimitive(page, prim, pg.toPdf, prim.kind === 'text' && prim.bold ? bold : font, measure)
  }
  out.setProducer('CycloMeasure')
  out.setCreator('CycloMeasure')
  return out.save()
}

/**
 * Wrap the page's existing drawing in save/restore, so any coordinate changes
 * it leaves behind can't shift the shapes we add.
 */
function isolateOriginalContent(doc: PDFDocument, page: PDFPage): void {
  const start = doc.context.register(doc.context.contentStream([pushGraphicsState()]))
  const end = doc.context.register(doc.context.contentStream([popGraphicsState()]))
  page.node.wrapContentStreams(start, end)
}

function drawPrimitive(page: PDFPage, prim: Primitive, toPdf: ExportPage['toPdf'], font: PDFFont, measure: MeasureText): void {
  if (prim.kind === 'circle') {
    const [x, y] = toPdf(prim.at)
    page.drawCircle({
      x,
      y,
      size: prim.r,
      color: colour(prim.fill),
      borderColor: prim.stroke ? colour(prim.stroke) : undefined,
      borderWidth: prim.strokeWidth ?? 0,
    })
    return
  }

  if (prim.kind === 'path') {
    const d = svgPath(prim.rings, prim.closed, toPdf)
    if (!d) return
    page.drawSvgPath(d, {
      x: 0,
      y: 0,
      color: prim.fill && prim.closed ? colour(prim.fill) : undefined,
      opacity: prim.fillOpacity ?? 1,
      borderColor: prim.stroke ? colour(prim.stroke) : undefined,
      borderWidth: prim.stroke ? (prim.strokeWidth ?? 1) : 0,
      borderOpacity: prim.strokeOpacity ?? 1,
      borderLineCap: prim.lineCap === 'butt' ? 0 : 1,
    })
    return
  }

  // text: optional box, then each line — turned by the text's own angle, and to match the page as displayed
  const rad = ((prim.angle ?? 0) * Math.PI) / 180
  const ux = Math.cos(rad)
  const uy = Math.sin(rad)
  // a point in the text block's own frame (x along the text, y down the lines) → displayed page
  const local = (x: number, y: number): Point => ({ x: prim.at.x + x * ux - y * uy, y: prim.at.y + x * uy + y * ux })
  if (prim.box) {
    const { width: w, height: h } = prim.box
    const box = [local(0, 0), local(w, 0), local(w, h), local(0, h)]
    page.drawSvgPath(svgPath([box], true, toPdf)!, {
      x: 0,
      y: 0,
      color: colour(prim.box.fill),
      opacity: 0.9,
      borderColor: colour(prim.box.stroke),
      borderWidth: Math.max(0.75, prim.fontSize / 14),
    })
  }
  const pad = prim.box?.padding ?? 0
  prim.lines.forEach((line, i) => {
    const text = winAnsiSafe(line, font)
    if (!text) return
    // baseline: top of the line plus the font's ascent (about 0.8 of its size)
    const base = local(pad, pad + prim.fontSize * (i * LINE_HEIGHT + 0.8 + (LINE_HEIGHT - 1) / 2))
    const [x, y] = toPdf(base)
    // the text's direction on the PDF page: where "along the text" ends up
    const [x1, y1] = toPdf({ x: base.x + ux * 100, y: base.y + uy * 100 })
    const rotate = (Math.atan2(y1 - y, x1 - x) * 180) / Math.PI
    page.drawText(text, { x, y, size: prim.fontSize, font, color: colour(prim.colour), rotate: degrees(rotate) })
  })
  void measure
}

/** SVG path text in PDF coordinates (pdf-lib flips y for SVG paths, so y is negated here). */
function svgPath(rings: Point[][], closed: boolean, toPdf: ExportPage['toPdf']): string | null {
  const parts: string[] = []
  for (const ring of rings) {
    if (ring.length < 2) continue
    ring.forEach((p, i) => {
      const [x, y] = toPdf(p)
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(3)} ${(-y).toFixed(3)}`)
    })
    if (closed) parts.push('Z')
  }
  return parts.length ? parts.join(' ') : null
}

function colour(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** The built-in PDF font covers Western European text; replace anything else with '?'. */
export function winAnsiSafe(text: string, font: PDFFont): string {
  let out = ''
  for (const ch of text.replace(/\t/g, '    ')) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}
