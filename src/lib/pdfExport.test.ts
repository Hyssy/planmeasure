import { describe, expect, it } from 'vitest'
import { degrees, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib'
import { buildMarkedUpPdf, winAnsiSafe } from './pdfExport'
import type { Primitive } from './markup'

/** A source PDF: an A3 page, and a rotated page whose drawing leaves the coordinate system shifted. */
async function sourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const a = doc.addPage([1191, 842])
  a.drawText('Original drawing', { x: 50, y: 800, size: 12 })
  const b = doc.addPage([842, 1191])
  b.setRotation(degrees(90))
  return doc.save()
}

/** Plain display→PDF mapping for an unrotated page of height h. */
const flip = (h: number) => (p: { x: number; y: number }): [number, number] => [p.x, h - p.y]

const red = '#e11d48'
const prims: Primitive[] = [
  { kind: 'path', rings: [[{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }]], closed: true, stroke: red, strokeWidth: 3 },
  { kind: 'path', rings: [[{ x: 400, y: 100 }, { x: 600, y: 160 }]], closed: false, stroke: red, strokeWidth: 3 },
  { kind: 'circle', at: { x: 700, y: 150 }, r: 5, fill: red },
  { kind: 'text', at: { x: 100, y: 300 }, lines: ['Check this', 'wall — 2.4 m²'], fontSize: 14, colour: red, box: { fill: '#ffffff', stroke: red, padding: 5, width: 120, height: 44 } },
]

function pageContent(doc: PDFDocument, index: number): string {
  const page = doc.getPage(index)
  const contents = page.node.Contents()
  const refs = contents && 'asArray' in contents ? (contents as unknown as { asArray(): unknown[] }).asArray() : [contents]
  return refs
    .map((ref) => {
      const s = doc.context.lookup(ref as never)
      return s instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(s).decode()) : ''
    })
    .join('\n')
}

describe('marked-up PDF export', () => {
  it('copies the chosen pages, keeps their size and rotation, and draws the shapes', async () => {
    const src = await sourcePdf()
    const bytes = await buildMarkedUpPdf(new Map([['f1', src]]), [
      { fileId: 'f1', pageNumber: 1, toPdf: flip(842), build: () => prims },
      { fileId: 'f1', pageNumber: 2, toPdf: (p) => [p.y, p.x], build: () => prims },
    ])
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(2)
    expect(out.getPage(0).getSize()).toEqual({ width: 1191, height: 842 })
    expect(out.getPage(1).getRotation().angle).toBe(90)
    const content = pageContent(out, 0)
    // the original drawing is wrapped in q … Q before our shapes
    expect(content.trimStart().startsWith('q')).toBe(true)
    // our rectangle starts at (100, 842-100): pdf-lib flips y ("1 0 0 -1 0 0 cm") then moves to (100, -742)
    expect(content).toContain('1 0 0 -1 0 0 cm')
    expect(content).toMatch(/100(\.0+)? -742(\.0+)? m/)
    expect(content).toMatch(/Tj/)
  })

  it('combines pages from several PDFs into one', async () => {
    const a = await sourcePdf()
    const b = await sourcePdf()
    const bytes = await buildMarkedUpPdf(new Map([['a', a], ['b', b]]), [
      { fileId: 'a', pageNumber: 2, toPdf: flip(1191), build: () => [] },
      { fileId: 'b', pageNumber: 1, toPdf: flip(842), build: () => prims },
    ])
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  it('replaces characters the PDF font cannot show', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    expect(winAnsiSafe('2.4 m² — ok', font)).toBe('2.4 m² — ok')
    expect(winAnsiSafe('≥ 3 ✓', font)).toBe('? 3 ?')
  })

  it('reports a missing PDF clearly', async () => {
    await expect(buildMarkedUpPdf(new Map(), [{ fileId: 'x', pageNumber: 1, toPdf: flip(842), build: () => [] }])).rejects.toThrow(/missing/)
  })
})
