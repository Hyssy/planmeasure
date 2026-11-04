/**
 * Scale areas: parts of a sheet drawn at a different scale (e.g. a 1:20 detail
 * on a 1:100 plan). A shape takes the scale of the area it's inside; shapes
 * outside every area use the sheet's scale. A shape that's partly inside an
 * area would mix two scales, so it gets no scale at all (decided by Jordan:
 * refuse rather than guess).
 */
import type { Point } from './scale'

export interface ScaleRegion {
  id: string
  sheetId: string
  /** the area's box, page points */
  x0: number
  y0: number
  x1: number
  y1: number
  /** real mm per page point inside this area */
  realMmPerPt: number
  /** e.g. "1:20" or "Calibrated (≈ 1:20)" */
  label: string
}

export function insideRegion(p: Point, r: ScaleRegion): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1
}

/**
 * Which scale area a set of points belongs to: the area containing all of
 * them, null if none of them is in any area (use the sheet's scale), or
 * 'mixed' if they straddle an area's edge (or two areas).
 */
export function regionFor(points: Point[], regions: ScaleRegion[]): ScaleRegion | null | 'mixed' {
  if (!points.length || !regions.length) return null
  // the smallest area wins where areas overlap (a detail drawn inside a bigger one)
  const bySize = [...regions].sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))
  const homeOf = (p: Point) => bySize.find((r) => insideRegion(p, r)) ?? null
  const first = homeOf(points[0])
  for (const p of points) if (homeOf(p) !== first) return 'mixed'
  return first
}
