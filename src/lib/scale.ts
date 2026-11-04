/**
 * Drawing scale maths.
 *
 * A sheet's scale is stored as `realMmPerPt`: how many real-world millimetres
 * one PDF point on the page represents.
 *
 *   1 pt on paper = 0.352778 mm, so a 1:100 drawing printed at its intended
 *   size has realMmPerPt = 0.352778 × 100 = 35.2778.
 */
import { MM_PER_PT, paperSizeFromPt } from './units'

export type PaperName = 'A0' | 'A1' | 'A2' | 'A3' | 'A4'

export interface Point {
  x: number
  y: number
}

/** Straight-line distance between two page points, in PDF points. */
export function distancePt(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Total length of a polyline, in PDF points. */
export function polylineLengthPt(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distancePt(points[i - 1], points[i])
  return total
}

/** Real mm per PDF point for a 1:ratio drawing printed at its intended size. */
export function mmPerPtFromRatio(ratio: number): number {
  return MM_PER_PT * ratio
}

/**
 * Does a printed scale apply to this page as it is?
 *
 * "1:100 @ A1" only holds if the PDF page really is A1. If the sheet has been
 * resized (e.g. an A1 drawing printed on A3) we don't guess the resize factor —
 * the user must calibrate from a dimension line instead.
 */
export function scaleSuitsPage(
  c: Pick<ScaleCandidate, 'paper'>,
  pageWidthPt: number,
  pageHeightPt: number,
): boolean {
  return c.paper === null || paperSizeFromPt(pageWidthPt, pageHeightPt).name === c.paper
}

/** Calibration: the user drew a line `distPt` long and says it is `realMm` in reality. */
export function mmPerPtFromCalibration(distPt: number, realMm: number): number {
  if (!(distPt > 0) || !(realMm > 0)) throw new Error('Calibration needs a non-zero line and length')
  return realMm / distPt
}

/** The equivalent 1:N ratio for a scale, as printed on this page (e.g. 100 for 1:100). */
export function equivalentRatio(mmPerPt: number): number {
  return mmPerPt / MM_PER_PT
}

/** Real-world length in mm of a distance on the page. */
export function realMm(distPt: number, mmPerPt: number): number {
  return distPt * mmPerPt
}

/** Lengths are shown in metres to 2 decimal places, e.g. "3.60 m". */
export function formatLength(mm: number): string {
  return `${(mm / 1000).toFixed(2)} m`
}

/** Areas are shown in square metres to 2 decimal places, e.g. "12.50 m²". */
export function formatArea(mm2: number): string {
  return `${(mm2 / 1_000_000).toFixed(2)} m²`
}

/** Format a ratio for display: 100 → "1:100", 98.734 → "1:98.7". */
export function formatRatio(ratio: number): string {
  const rounded = Math.abs(ratio - Math.round(ratio)) < 0.05 ? Math.round(ratio) : ratio.toFixed(1)
  return `1:${rounded}`
}

/**
 * Read a scale the user typed: "150", "1:150", "1 : 150" or "1/150" → 150.
 * Whole numbers or one decimal place; null if it isn't a sensible scale.
 */
export function parseRatioInput(text: string): number | null {
  const m = text.trim().replace(/,/g, '').match(/^(?:1\s*[:/]\s*)?(\d+(?:\.\d)?)$/)
  if (!m) return null
  const r = Number(m[1])
  return r >= 1 && r <= 100000 ? r : null
}

// ---------------------------------------------------------------------------
// Scale detection from the page's text
// ---------------------------------------------------------------------------

export interface ScaleCandidate {
  ratio: number
  paper: PaperName | null
  /** true if the word SCALE appeared right before it */
  labelled: boolean
  /** the text that matched, e.g. "SCALE 1:100 @ A1" */
  text: string
}

/** Scales architects and engineers actually use. Unlabelled ratios must be one of these. */
export const COMMON_RATIOS = [
  1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 750, 1000, 1250, 2000, 2500, 5000,
]

// "1:100", "1 : 100", optionally preceded by "SCALE" and followed by "@ A1" / "AT A1".
const SCALE_RE =
  /(SCALE\s*[:=-]?\s*)?(?<![\d.,:])1\s*:\s*(\d{1,5})(?![\d.,:])(?:\s*(?:@|AT)\s*(A[0-4])\b)?/gi

// Ratios that describe a slope, not a drawing scale: "FALL 1:100", "1:14 RAMP".
const SLOPE_WORDS = /\b(FALLS?|GRADE|GRADIENT|SLOPE|RAMP|PITCH|BATTER|MIN\.?|MAX\.?)\b/i

/** Find every drawing-scale mention in a sheet's text. */
export function findScaleCandidates(text: string): ScaleCandidate[] {
  const found: ScaleCandidate[] = []
  for (const m of text.matchAll(SCALE_RE)) {
    const ratio = Number(m[2])
    const labelled = Boolean(m[1])
    const paper = (m[3]?.toUpperCase() as PaperName | undefined) ?? null
    if (ratio < 1 || ratio > 10000) continue

    // Only the two words either side, on the same line, decide whether it's a slope.
    const start = m.index ?? 0
    const lineBefore = text.slice(0, start).split('\n').pop() ?? ''
    const lineAfter = text.slice(start + m[0].length).split('\n')[0]
    const before = lineBefore.trim().split(/\s+/).slice(-2).join(' ')
    const after = lineAfter.trim().split(/\s+/).slice(0, 2).join(' ')
    if (!labelled && (SLOPE_WORDS.test(before) || SLOPE_WORDS.test(after))) continue
    if (!labelled && !paper && !COMMON_RATIOS.includes(ratio)) continue

    found.push({ ratio, paper, labelled, text: m[0].trim().replace(/\s+/g, ' ') })
  }
  return found
}

/**
 * Reduce candidates to the distinct scales worth suggesting.
 * If any are labelled "SCALE", only those count (unlabelled ratios are more
 * likely to be notes). Duplicates (the same scale printed twice) are merged.
 */
export function distinctScales(candidates: ScaleCandidate[]): ScaleCandidate[] {
  const labelled = candidates.filter((c) => c.labelled)
  const pool = labelled.length > 0 ? labelled : candidates
  const byKey = new Map<string, ScaleCandidate>()
  for (const c of pool) {
    const key = `${c.ratio}@${c.paper ?? ''}`
    if (!byKey.has(key)) byKey.set(key, c)
  }
  // "1:100" and "1:100 @ A1" are the same scale; keep the one that says the sheet size.
  const result = [...byKey.values()]
  return result.filter(
    (c) => c.paper !== null || !result.some((o) => o.ratio === c.ratio && o.paper !== null),
  )
}

/** Human-readable label for a candidate: "1:100 @ A1". */
export function describeCandidate(c: Pick<ScaleCandidate, 'ratio' | 'paper'>): string {
  return c.paper ? `1:${c.ratio} @ ${c.paper}` : `1:${c.ratio}`
}
