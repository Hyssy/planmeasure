/**
 * Plane geometry in PDF page points. Pure maths — no scale, no units.
 */
import type { Point } from './scale'

/** Signed area of a polygon (shoelace formula), in pt². Sign depends on winding. */
export function signedAreaPt2(poly: Point[]): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Area of a polygon in pt², whichever way it was drawn. */
export function polygonAreaPt2(poly: Point[]): number {
  return poly.length < 3 ? 0 : Math.abs(signedAreaPt2(poly))
}

/** Perimeter of a closed polygon in pt. */
export function polygonPerimeterPt(poly: Point[]): number {
  if (poly.length < 2) return 0
  let total = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/** Is the point inside the polygon? (ray casting) */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Shortest distance from a point to a line segment, in pt. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Shortest distance from a point to a polyline (closed = include the last-to-first edge). */
export function distanceToPolyline(p: Point, pts: Point[], closed = false): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y)
  let best = Infinity
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) best = Math.min(best, distanceToSegment(p, pts[i], pts[(i + 1) % pts.length]))
  return best
}

/** Centre of area of a polygon (for placing labels). Falls back to the average point. */
export function polygonCentroid(poly: Point[]): Point {
  const a = signedAreaPt2(poly)
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** The four corners of the rectangle with opposite corners a and b (clockwise on screen). */
export function rectCorners(a: Point, b: Point): Point[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ]
}

/**
 * Simplify a freehand stroke (Ramer–Douglas–Peucker): drop points that are within
 * `tolerance` of the line through their neighbours. Keeps the shape, loses the jitter
 * and the thousands of points a mouse produces.
 */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last])
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}
