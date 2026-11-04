/**
 * Moving takeoffs (and optionally markups and scale areas) from an old version
 * of a sheet onto its new version.
 *
 * The new version may sit slightly differently on its page, so each point is
 * moved by the alignment found by comparing the two drawings:
 *   newPt = oldPt × k + (tx, ty)
 * k is 1 when the two sheets are the same paper size (a pure shift, so every
 * shape keeps its exact size on paper). Quantities then come from the new
 * sheet's own scale.
 */
import type { Markup } from './markup'
import type { Point } from './scale'
import type { ScaleRegion } from './scaleRegions'
import { groupOf, type Item, type Takeoff } from './takeoff'

export interface PageTransform {
  /** paper-size ratio (new page width / old page width) */
  k: number
  /** shift in new-page points */
  tx: number
  ty: number
}

export const IDENTITY: PageTransform = { k: 1, tx: 0, ty: 0 }

export function applyTransform(t: PageTransform, p: Point): Point {
  return { x: p.x * t.k + t.tx, y: p.y * t.k + t.ty }
}

/**
 * The transform from the old page to the new one, from a comparison where both
 * were rendered `widthPx` wide and the old render had to move (dx, dy) pixels
 * to line up with the new one.
 */
export function transformFromAlignment(oldWidthPt: number, newWidthPt: number, widthPx: number, dx: number, dy: number): PageTransform {
  const sNew = widthPx / newWidthPt // pixels per new-page point
  const sOld = widthPx / oldWidthPt
  return { k: sOld / sNew, tx: dx / sNew, ty: dy / sNew }
}

export interface SheetContent {
  items: Item[]
  takeoffs: Takeoff[]
  markups: Markup[]
  scaleRegions: ScaleRegion[]
}

export interface MoveOptions {
  markups: boolean
  /** new ids for copied scale areas */
  newId: () => string
}

/** Move everything drawn on `oldId` onto `newId`. Returns the new content and what moved. */
export function moveToVersion(
  c: SheetContent,
  oldId: string,
  newId: string,
  t: PageTransform,
  opts: MoveOptions,
): SheetContent & { moved: { takeoffs: number; markups: number; scaleAreas: number } } {
  const tp = (p: Point) => applyTransform(t, p)

  // per-sheet items on the old sheet: join the new sheet's item in the same group, or become the new sheet's item
  const itemMap = new Map<string, string>() // old item id -> item id to use
  const dropItems = new Set<string>()
  const items = c.items.map((i) => {
    if (i.sheetId !== oldId) return i
    const sibling = c.items.find((j) => j.sheetId === newId && groupOf(j) === groupOf(i) && j.kind === i.kind)
    if (sibling) {
      itemMap.set(i.id, sibling.id)
      dropItems.add(i.id)
      return i
    }
    return { ...i, sheetId: newId }
  })

  let movedT = 0
  const takeoffs = c.takeoffs.map((x) => {
    if (x.sheetId !== oldId) return x
    movedT++
    return { ...x, sheetId: newId, itemId: itemMap.get(x.itemId) ?? x.itemId, points: x.points.map(tp), holes: x.holes.map((h) => h.map(tp)) }
  })

  let movedM = 0
  const markups = opts.markups
    ? c.markups.map((m) => {
        if (m.sheetId !== oldId) return m
        movedM++
        return { ...m, sheetId: newId, points: m.points.map(tp) }
      })
    : c.markups

  // scale areas: the moved shapes inside them must keep their scale, so the areas are copied across
  // (copied, not moved: the old version keeps its own, so undoing the move leaves it exactly as it was)
  const regions = c.scaleRegions.filter((r) => r.sheetId === oldId)
  const scaleRegions = [
    ...c.scaleRegions,
    ...regions.map((r) => {
      const a = tp({ x: r.x0, y: r.y0 })
      const b = tp({ x: r.x1, y: r.y1 })
      return { ...r, id: opts.newId(), sheetId: newId, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
    }),
  ]

  return {
    items: items.filter((i) => !dropItems.has(i.id)),
    takeoffs,
    markups,
    scaleRegions,
    moved: { takeoffs: movedT, markups: movedM, scaleAreas: regions.length },
  }
}

/** True when two pages are the same paper size (within 0.5%), so a scale can carry over unchanged. */
export function samePaperSize(a: { widthPt: number; heightPt: number }, b: { widthPt: number; heightPt: number }): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= 0.005 * Math.max(x, y)
  return close(a.widthPt, b.widthPt) && close(a.heightPt, b.heightPt)
}

/** Old-version sheets that have something drawn on them (so there's something to move). */
export function sheetsWithContentToMove(s: { supersedes: Record<string, string>; takeoffs: { sheetId: string }[]; markups: { sheetId: string }[] }): string[] {
  const old = new Set(Object.values(s.supersedes))
  const ids = new Set<string>()
  for (const t of s.takeoffs) if (old.has(t.sheetId)) ids.add(t.sheetId)
  for (const m of s.markups) if (old.has(m.sheetId)) ids.add(m.sheetId)
  return [...ids]
}
