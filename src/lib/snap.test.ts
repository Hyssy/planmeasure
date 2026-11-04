import { describe, expect, it } from 'vitest'
import { cleanSegments, findImageSnap, findSnap, SegmentIndex, segmentIntersection, type Patch, type Segment } from './snap'

// A room outline 0..100 × 0..60 with an internal wall at x = 40.
const room: Segment[] = [
  [0, 0, 100, 0], [100, 0, 100, 60], [100, 60, 0, 60], [0, 60, 0, 0],
  [40, 0, 40, 60],
]
const index = new SegmentIndex(room)

describe('vector snapping', () => {
  it('snaps to a corner (line end)', () => {
    expect(findSnap(index, { x: 98, y: 3 }, 6)).toMatchObject({ point: { x: 100, y: 0 }, kind: 'end', approximate: false })
  })

  it('snaps to where two lines cross', () => {
    const idx = new SegmentIndex([[0, 30, 100, 30], [50, 0, 50, 60]])
    expect(findSnap(idx, { x: 52, y: 28 }, 6)).toMatchObject({ point: { x: 50, y: 30 }, kind: 'intersection' })
  })

  it('snaps to a midpoint when no end or crossing is close', () => {
    expect(findSnap(index, { x: 52, y: 2 }, 6)).toMatchObject({ point: { x: 50, y: 0 }, kind: 'mid' })
  })

  it('otherwise snaps onto the nearest line', () => {
    const s = findSnap(index, { x: 84, y: 2.5 }, 6)
    expect(s?.kind).toBe('line')
    expect(s?.point.y).toBeCloseTo(0, 9)
    expect(s?.point.x).toBeCloseTo(84, 9)
  })

  it('does nothing away from linework', () => {
    expect(findSnap(index, { x: 20, y: 30 }, 6)).toBeNull()
  })

  it('finds crossings and ignores parallel or separate lines', () => {
    expect(segmentIntersection([0, 0, 10, 10], [0, 10, 10, 0])).toEqual({ x: 5, y: 5 })
    expect(segmentIntersection([0, 0, 10, 0], [0, 5, 10, 5])).toBeNull()
    expect(segmentIntersection([0, 0, 4, 0], [5, -1, 5, 1])).toBeNull()
  })

  it('drops tiny and duplicate segments', () => {
    expect(cleanSegments([[0, 0, 10, 0], [10, 0, 0, 0], [5, 5, 5.5, 5]])).toEqual([[0, 0, 10, 0]])
  })

  it('stays fast on a big drawing', () => {
    const many: Segment[] = []
    for (let i = 0; i < 20000; i++) many.push([(i * 7) % 2000, (i * 13) % 1400, ((i * 7) % 2000) + 20, (i * 13) % 1400])
    const big = new SegmentIndex(many)
    const t = performance.now()
    for (let k = 0; k < 200; k++) findSnap(big, { x: (k * 37) % 2000, y: (k * 53) % 1400 }, 6)
    expect(performance.now() - t).toBeLessThan(500)
  })
})

/** A white patch with an "L" of dark line `thick` pixels wide, centre line corner at (cx, cy) pixels. */
function lPatch(cx: number, cy: number, thick: number, scale: number): Patch {
  const w = 200
  const h = 200
  const grey = new Uint8Array(w * h).fill(255)
  const half = thick / 2
  const ink = (x: number, y: number) => (grey[y * w + x] = 0)
  for (let x = Math.round(cx - half); x < cx + 80; x++) for (let y = Math.round(cy - half); y < cy + half; y++) ink(x, y) // arm to the right
  for (let y = Math.round(cy - half); y < cy + 80; y++) for (let x = Math.round(cx - half); x < cx + half; x++) ink(x, y) // arm down
  return { x: 0, y: 0, scale, width: w, height: h, grey }
}

describe('image snapping (flattened plans)', () => {
  const scale = 4 // pixels per point
  const patch = lPatch(60, 60, 6, scale) // corner at pixel (60,60) = page (15, 15) pt, lines 1.5 pt thick

  it('finds the corner of thick linework, at the centre of the line', () => {
    const s = findImageSnap(patch, { x: 14, y: 16 }, 4)
    expect(s?.kind).toBe('corner-approx')
    expect(s?.approximate).toBe(true)
    expect(Math.abs(s!.point.x - 15)).toBeLessThan(0.5)
    expect(Math.abs(s!.point.y - 15)).toBeLessThan(0.5)
  })

  it('snaps onto the middle of a line away from corners', () => {
    const s = findImageSnap(patch, { x: 30, y: 16 }, 4)
    expect(s?.kind).toBe('line-approx')
    expect(Math.abs(s!.point.y - 15)).toBeLessThan(0.5)
  })

  it('does nothing on blank paper', () => {
    expect(findImageSnap(patch, { x: 40, y: 40 }, 4)).toBeNull()
  })

  it('finds where two lines cross (a grid junction)', () => {
    const w = 200
    const grey = new Uint8Array(w * w).fill(255)
    for (let x = 0; x < w; x++) for (let y = 97; y < 103; y++) grey[y * w + x] = 0 // horizontal line, centre y = 99.5 px
    for (let y = 0; y < w; y++) for (let x = 57; x < 63; x++) grey[y * w + x] = 0 // vertical line, centre x = 59.5 px
    const cross: Patch = { x: 0, y: 0, scale: 4, width: w, height: w, grey }
    const s = findImageSnap(cross, { x: 16, y: 23.5 }, 5)
    expect(s?.kind).toBe('corner-approx')
    expect(Math.abs(s!.point.x - 15)).toBeLessThan(0.3)
    expect(Math.abs(s!.point.y - 25)).toBeLessThan(0.3)
  })

  it('finds a T-junction', () => {
    const w = 200
    const grey = new Uint8Array(w * w).fill(255)
    for (let x = 0; x < w; x++) for (let y = 97; y < 103; y++) grey[y * w + x] = 0 // horizontal line
    for (let y = 100; y < w; y++) for (let x = 57; x < 63; x++) grey[y * w + x] = 0 // vertical line hanging below it
    const tee: Patch = { x: 0, y: 0, scale: 4, width: w, height: w, grey }
    const s = findImageSnap(tee, { x: 14, y: 26 }, 5)
    expect(s?.kind).toBe('corner-approx')
    expect(Math.abs(s!.point.x - 15)).toBeLessThan(0.3)
    expect(Math.abs(s!.point.y - 25)).toBeLessThan(0.3)
  })
})
