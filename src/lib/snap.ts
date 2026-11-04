/**
 * Snapping: lock the cursor onto the drawing's own linework.
 *
 * Vector PDFs: the real line segments are read from the PDF, and the cursor
 * snaps to line ends, intersections, midpoints, or the nearest point on a line.
 *
 * Flattened (image-only) PDFs: there's no linework to read, so the rendered
 * image is examined near the cursor for line corners and line centres. That's
 * approximate, and the app shows it differently.
 *
 * All coordinates are page points (displayed page, origin top-left).
 */
import { distanceToSegment } from './geometry'
import type { Point } from './scale'

export type SnapKind = 'end' | 'intersection' | 'mid' | 'line' | 'corner-approx' | 'line-approx'

export interface Snap {
  point: Point
  kind: SnapKind
  /** true for image-based snaps on flattened plans */
  approximate: boolean
}

/** A line segment: x1, y1, x2, y2 */
export type Segment = [number, number, number, number]

/** Segments shorter than this (points) are ignored: hatching dots, text outlines and tiny curve pieces. */
export const MIN_SEGMENT = 1.5

// ---------------------------------------------------------------------------
// Spatial index
// ---------------------------------------------------------------------------

/** A grid of buckets so only segments near the cursor are checked, even on huge drawings. */
export class SegmentIndex {
  readonly segments: Segment[]
  private readonly cell: number
  private readonly buckets = new Map<number, number[]>()

  constructor(segments: Segment[], cell = 24) {
    this.segments = segments
    this.cell = cell
    segments.forEach((s, i) => {
      const [x0, x1] = s[0] < s[2] ? [s[0], s[2]] : [s[2], s[0]]
      const [y0, y1] = s[1] < s[3] ? [s[1], s[3]] : [s[3], s[1]]
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
        for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
          const k = key(cx, cy)
          const b = this.buckets.get(k)
          if (b) b.push(i)
          else this.buckets.set(k, [i])
        }
      }
    })
  }

  /** Segments passing within `r` of point p. */
  near(p: Point, r: number): Segment[] {
    const seen = new Set<number>()
    const out: Segment[] = []
    for (let cx = Math.floor((p.x - r) / this.cell); cx <= Math.floor((p.x + r) / this.cell); cx++) {
      for (let cy = Math.floor((p.y - r) / this.cell); cy <= Math.floor((p.y + r) / this.cell); cy++) {
        for (const i of this.buckets.get(key(cx, cy)) ?? []) {
          if (seen.has(i)) continue
          seen.add(i)
          const s = this.segments[i]
          if (distanceToSegment(p, { x: s[0], y: s[1] }, { x: s[2], y: s[3] }) <= r) out.push(s)
        }
      }
    }
    return out
  }
}

function key(cx: number, cy: number): number {
  return (cx + 50_000) * 100_000 + (cy + 50_000)
}

// ---------------------------------------------------------------------------
// Vector snapping
// ---------------------------------------------------------------------------

/** Where two segments cross (within both), if they do. */
export function segmentIntersection(a: Segment, b: Segment): Point | null {
  const [x1, y1, x2, y2] = a
  const [x3, y3, x4, y4] = b
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(d) < 1e-9) return null // parallel
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d
  const eps = 1e-6
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) }
}

function nearestOnSegment(p: Point, s: Segment): Point {
  const dx = s[2] - s[0]
  const dy = s[3] - s[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s[0]) * dx + (p.y - s[1]) * dy) / len2))
  return { x: s[0] + t * dx, y: s[1] + t * dy }
}

/**
 * The best snap within `radius` of p. Line ends and intersections win over
 * midpoints, which win over "somewhere on a line" — the way CAD snapping works.
 */
export function findSnap(index: SegmentIndex, p: Point, radius: number): Snap | null {
  const near = index.near(p, radius)
  if (!near.length) return null
  const d = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y)
  const best = (pts: Point[]) => {
    let out: Point | null = null
    for (const q of pts) if (d(q) <= radius && (!out || d(q) < d(out))) out = q
    return out
  }

  const ends: Point[] = []
  const mids: Point[] = []
  for (const s of near) {
    ends.push({ x: s[0], y: s[1] }, { x: s[2], y: s[3] })
    mids.push({ x: (s[0] + s[2]) / 2, y: (s[1] + s[3]) / 2 })
  }
  // Intersections among the closest segments only (keeps it fast in busy areas).
  const close = near.length > 40 ? [...near].sort((a, b) => segDist(p, a) - segDist(p, b)).slice(0, 40) : near
  const crossings: Point[] = []
  for (let i = 0; i < close.length; i++) {
    for (let j = i + 1; j < close.length; j++) {
      const x = segmentIntersection(close[i], close[j])
      if (x) crossings.push(x)
    }
  }

  const end = best(ends)
  const cross = best(crossings)
  // An end and a crossing at the same spot are the same corner; otherwise take the nearer.
  if (end || cross) {
    const pick = !cross || (end && d(end) <= d(cross) + 0.01) ? { point: end!, kind: 'end' as const } : { point: cross, kind: 'intersection' as const }
    return { ...pick, approximate: false }
  }
  const mid = best(mids)
  if (mid && d(mid) <= radius * 0.6) return { point: mid, kind: 'mid', approximate: false }
  const onLine = close.map((s) => nearestOnSegment(p, s)).sort((a, b) => d(a) - d(b))[0]
  return onLine ? { point: onLine, kind: 'line', approximate: false } : null
}

function segDist(p: Point, s: Segment): number {
  return distanceToSegment(p, { x: s[0], y: s[1] }, { x: s[2], y: s[3] })
}

/** Tidy raw segments: drop tiny ones and exact duplicates. */
export function cleanSegments(raw: Segment[]): Segment[] {
  const seen = new Set<string>()
  const out: Segment[] = []
  for (const s of raw) {
    if (Math.hypot(s[2] - s[0], s[3] - s[1]) < MIN_SEGMENT) continue
    const a = `${s[0].toFixed(1)},${s[1].toFixed(1)}`
    const b = `${s[2].toFixed(1)},${s[3].toFixed(1)}`
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

// ---------------------------------------------------------------------------
// Image snapping (flattened plans)
// ---------------------------------------------------------------------------

/** A greyscale patch of the rendered page: 0 = black, 255 = white. */
export interface Patch {
  /** page point of the patch's top-left pixel */
  x: number
  y: number
  /** pixels per page point */
  scale: number
  width: number
  height: number
  grey: Uint8Array
}

/** Pixels darker than this count as linework. */
const DARK = 140

/**
 * Snap on an image. Finds the nearest horizontal and vertical lines near p (from
 * their centres, across the line's thickness). Where they meet on ink — an L
 * corner, a T or a cross — that's the snap; otherwise the nearest line's centre.
 * Works for the horizontal and vertical linework most plans are made of.
 */
export function findImageSnap(patch: Patch, p: Point, radius: number): Snap | null {
  const { width: w, height: h, grey, scale: s } = patch
  const px = Math.round((p.x - patch.x) * s)
  const py = Math.round((p.y - patch.y) * s)
  const r = Math.max(2, Math.round(radius * s))
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && grey[y * w + x] < DARK
  const reach = Math.max(6, Math.round(3 * s)) // a line must run at least ≈3 pt to count
  const run = (x: number, y: number, dx: number, dy: number, max: number) => {
    let n = 0
    while (n < max && dark(x + dx * (n + 1), y + dy * (n + 1))) n++
    return n
  }
  const thin = Math.max(3, Math.round(1.5 * s)) // lines are thinner than ≈1.5 pt... thicker counts as a filled area

  /** Bands of rows (or columns) near the cursor that are long thin lines; their centres, nearest first. */
  const lineCentres = (horizontal: boolean): number[] => {
    const hits = new Set<number>()
    // sample a few positions across the search window
    for (let k = -r; k <= r; k += Math.max(1, Math.round(r / 6))) {
      for (let t = -r; t <= r; t++) {
        const x = horizontal ? px + k : px + t
        const y = horizontal ? py + t : py + k
        if (!dark(x, y)) continue
        const along = horizontal ? run(x, y, 1, 0, reach) + run(x, y, -1, 0, reach) : run(x, y, 0, 1, reach) + run(x, y, 0, -1, reach)
        const across = horizontal ? run(x, y, 0, 1, thin) + run(x, y, 0, -1, thin) : run(x, y, 1, 0, thin) + run(x, y, -1, 0, thin)
        if (along >= reach && across < thin) hits.add(horizontal ? y : x)
      }
    }
    // group neighbouring rows/columns into lines, and take each band's middle
    const sorted = [...hits].sort((a, b) => a - b)
    const centres: number[] = []
    let start = sorted[0]
    for (let i = 1; i <= sorted.length; i++) {
      if (i === sorted.length || sorted[i] !== sorted[i - 1] + 1) {
        centres.push((start + sorted[i - 1]) / 2)
        start = sorted[i]
      }
    }
    const c = horizontal ? py : px
    return centres.filter((v) => Math.abs(v - c) <= r).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))
  }

  const rows = lineCentres(true) // horizontal lines: their y
  const cols = lineCentres(false) // vertical lines: their x
  const toPage = (x: number, y: number): Point => ({ x: patch.x + (x + 0.5) / s, y: patch.y + (y + 0.5) / s })

  // Corner / junction: nearest horizontal and vertical lines that actually meet on ink.
  for (const y of rows.slice(0, 3)) {
    for (const x of cols.slice(0, 3)) {
      if (Math.hypot(x - px, y - py) > r) continue
      if (dark(Math.round(x), Math.round(y))) return { point: toPage(x, y), kind: 'corner-approx', approximate: true }
    }
  }
  // Otherwise onto the nearer line's centre.
  const hy = rows[0]
  const vx = cols[0]
  if (hy === undefined && vx === undefined) return null
  if (vx === undefined || (hy !== undefined && Math.abs(hy - py) <= Math.abs(vx - px))) {
    return { point: toPage(px, hy!), kind: 'line-approx', approximate: true }
  }
  return { point: toPage(vx, py), kind: 'line-approx', approximate: true }
}

/** Plain-English names for the snap kinds (shown beside the cursor hint). */
export const SNAP_LABEL: Record<SnapKind, string> = {
  end: 'Line end',
  intersection: 'Intersection',
  mid: 'Midpoint',
  line: 'On line',
  'corner-approx': 'Corner (approximate)',
  'line-approx': 'On line (approximate)',
}
