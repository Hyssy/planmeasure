/**
 * Unit helpers.
 *
 * PDF geometry is in points: 1 pt = 1/72 inch = 25.4 / 72 mm.
 * All geometry in PlanMeasure is stored in PDF points, never screen pixels.
 */

/** Millimetres per PDF point (exact: 25.4 / 72 ≈ 0.352778). */
export const MM_PER_PT = 25.4 / 72

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT
}

export function mmToPt(mm: number): number {
  return mm / MM_PER_PT
}

/** ISO 216 A-series sizes in mm, portrait (short side first). */
export const ISO_A_SIZES: ReadonlyArray<{ name: string; shortMm: number; longMm: number }> = [
  { name: 'A0', shortMm: 841, longMm: 1189 },
  { name: 'A1', shortMm: 594, longMm: 841 },
  { name: 'A2', shortMm: 420, longMm: 594 },
  { name: 'A3', shortMm: 297, longMm: 420 },
  { name: 'A4', shortMm: 210, longMm: 297 },
]

export interface PaperSize {
  /** e.g. "A1", or null if not a standard A-size */
  name: string | null
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
}

/**
 * Identify the paper size of a page from its size in points.
 * Allows 1% tolerance (PDF exporters often round sizes slightly).
 */
export function paperSizeFromPt(widthPt: number, heightPt: number): PaperSize {
  const widthMm = ptToMm(widthPt)
  const heightMm = ptToMm(heightPt)
  const shortMm = Math.min(widthMm, heightMm)
  const longMm = Math.max(widthMm, heightMm)
  const orientation = widthMm > heightMm ? 'landscape' : 'portrait'
  const tol = 0.01
  const match = ISO_A_SIZES.find(
    (s) =>
      Math.abs(shortMm - s.shortMm) / s.shortMm <= tol &&
      Math.abs(longMm - s.longMm) / s.longMm <= tol,
  )
  return { name: match?.name ?? null, orientation, widthMm, heightMm }
}

/** Human-readable page size, e.g. "A1 landscape · 841 × 594 mm". */
export function describePaperSize(widthPt: number, heightPt: number): string {
  const p = paperSizeFromPt(widthPt, heightPt)
  const dims = `${Math.round(p.widthMm)} × ${Math.round(p.heightMm)} mm`
  return p.name ? `${p.name} ${p.orientation} · ${dims}` : dims
}
