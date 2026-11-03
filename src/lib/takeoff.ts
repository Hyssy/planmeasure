/**
 * Takeoff items and quantities.
 *
 * Geometry is stored in PDF page points; quantities are always worked out from
 * the sheet's current scale, so re-calibrating a sheet updates its quantities.
 */
import { polygonAreaPt2, polygonPerimeterPt } from './geometry'
import { polylineLengthPt, type Point } from './scale'

export type TakeoffKind = 'linear' | 'area' | 'perimeter' | 'count'

export const KIND_UNIT: Record<TakeoffKind, 'm' | 'm²' | 'each'> = {
  linear: 'm',
  area: 'm²',
  perimeter: 'm',
  count: 'each',
}

export const KIND_LABEL: Record<TakeoffKind, string> = {
  linear: 'Linear',
  area: 'Area',
  perimeter: 'Perimeter',
  count: 'Count',
}

export interface Item {
  id: string
  name: string
  colour: string
  kind: TakeoffKind
  trade: string
}

export interface Takeoff {
  id: string
  itemId: string
  sheetId: string
  /** linear: polyline; area/perimeter: polygon outline; count: one marker */
  points: Point[]
  /** area only: cut-outs (deductions) inside the outline */
  holes: Point[][]
}

/** What the quantities can be trusted for. */
export type ScaleState = 'confirmed' | 'unverified' | 'none'

export interface SheetScaleInfo {
  realMmPerPt: number
  state: ScaleState
}

export interface Quantity {
  /** in the item's unit (m, m², each); null when the sheet has no scale */
  value: number | null
  state: ScaleState
}

/** Net area in m² of an outline less its cut-outs. */
export function netAreaM2(outline: Point[], holes: Point[][], realMmPerPt: number): number {
  const pt2 = polygonAreaPt2(outline) - holes.reduce((s, h) => s + polygonAreaPt2(h), 0)
  return (Math.max(0, pt2) * realMmPerPt * realMmPerPt) / 1_000_000
}

/** Gross area (before cut-outs) in m². */
export function grossAreaM2(outline: Point[], realMmPerPt: number): number {
  return (polygonAreaPt2(outline) * realMmPerPt * realMmPerPt) / 1_000_000
}

export function lengthM(points: Point[], realMmPerPt: number): number {
  return (polylineLengthPt(points) * realMmPerPt) / 1000
}

export function perimeterM(outline: Point[], realMmPerPt: number): number {
  return (polygonPerimeterPt(outline) * realMmPerPt) / 1000
}

/** The quantity one takeoff contributes to its item. */
export function takeoffQuantity(t: Takeoff, kind: TakeoffKind, scale: SheetScaleInfo | undefined): Quantity {
  if (kind === 'count') return { value: t.points.length, state: scale?.state ?? 'none' }
  if (!scale || scale.state === 'none') return { value: null, state: 'none' }
  const k = scale.realMmPerPt
  const value =
    kind === 'linear' ? lengthM(t.points, k) : kind === 'area' ? netAreaM2(t.points, t.holes, k) : perimeterM(t.points, k)
  return { value, state: scale.state }
}

export interface ItemTotal {
  /** sum of quantities on scaled sheets */
  total: number
  /** takeoffs left out because their sheet has no scale */
  unscaled: number
  /** takeoffs counted using an unverified scale */
  unverified: number
  /** per-sheet subtotals, in sheet order of first appearance */
  bySheet: { sheetId: string; total: number; unscaled: number; unverified: number }[]
}

/**
 * Totals for an item across sheets. Counts are counted on every sheet (no scale
 * needed); lengths and areas on unscaled sheets are left out and reported.
 */
export function itemTotal(
  item: Item,
  takeoffs: Takeoff[],
  scales: Record<string, SheetScaleInfo | undefined>,
): ItemTotal {
  const result: ItemTotal = { total: 0, unscaled: 0, unverified: 0, bySheet: [] }
  const sheets = new Map<string, ItemTotal['bySheet'][number]>()
  for (const t of takeoffs) {
    if (t.itemId !== item.id) continue
    let row = sheets.get(t.sheetId)
    if (!row) {
      row = { sheetId: t.sheetId, total: 0, unscaled: 0, unverified: 0 }
      sheets.set(t.sheetId, row)
      result.bySheet.push(row)
    }
    const q = takeoffQuantity(t, item.kind, scales[t.sheetId])
    if (q.value === null) {
      row.unscaled++
      result.unscaled++
      continue
    }
    row.total += q.value
    result.total += q.value
    if (q.state === 'unverified' && item.kind !== 'count') {
      row.unverified++
      result.unverified++
    }
  }
  return result
}

/** "12.35 m", "48.20 m²", "17 each" */
export function formatQuantity(value: number, kind: TakeoffKind): string {
  if (kind === 'count') return `${Math.round(value)}`
  return `${value.toFixed(2)} ${KIND_UNIT[kind]}`
}

/** Distinct colours for items, chosen to show up on black-and-white plans. */
export const ITEM_COLOURS = [
  '#e6194b', '#3a86ff', '#2a9d3f', '#f58231', '#911eb4',
  '#0fa3b1', '#d81b9c', '#9a6324', '#5c6bc0', '#808000',
]
