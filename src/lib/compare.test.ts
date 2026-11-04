import { describe, expect, it } from 'vitest'
import { bestAlignment, compareSheets, dilate, pairSheets, refineSubpixel, type Grey } from './compare'

function blank(w = 300, h = 200): Grey {
  return { width: w, height: h, data: new Uint8Array(w * h).fill(255) }
}
function rect(g: Grey, x0: number, y0: number, x1: number, y1: number, t = 2) {
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < g.width && y < g.height && (g.data[y * g.width + x] = 0)
  for (let x = x0; x <= x1; x++) for (let k = 0; k < t; k++) { ink(x, y0 + k); ink(x, y1 - k) }
  for (let y = y0; y <= y1; y++) for (let k = 0; k < t; k++) { ink(x0 + k, y); ink(x1 - k, y) }
}

describe('comparing revisions', () => {
  it('identical sheets have no changes', () => {
    const a = blank(); rect(a, 20, 20, 120, 100)
    const b = blank(); rect(b, 20, 20, 120, 100)
    expect(compareSheets(a, b).boxes).toEqual([])
  })

  it('a new room shows as one added change, in the right place', () => {
    const a = blank(); rect(a, 20, 20, 120, 100)
    const b = blank(); rect(b, 20, 20, 120, 100); rect(b, 180, 40, 260, 140)
    const c = compareSheets(a, b)
    expect(c.boxes).toHaveLength(1)
    const box = c.boxes[0]
    expect(box.added).toBeGreaterThan(0)
    expect(box.removed).toBe(0)
    expect(box.x).toBeLessThanOrEqual(180)
    expect(box.x + box.w).toBeGreaterThanOrEqual(260)
    expect(box.y).toBeLessThanOrEqual(40)
  })

  it('a deleted wall shows as removed', () => {
    const a = blank(); rect(a, 20, 20, 120, 100); rect(a, 180, 40, 260, 140)
    const b = blank(); rect(b, 20, 20, 120, 100)
    const c = compareSheets(a, b)
    expect(c.boxes).toHaveLength(1)
    expect(c.boxes[0].removed).toBeGreaterThan(0)
    expect(c.boxes[0].added).toBe(0)
  })

  it('a sheet nudged on the page is lined up, not reported as all changed', () => {
    const a = blank(); rect(a, 20, 20, 120, 100); rect(a, 150, 30, 250, 150)
    const b = blank(); rect(b, 27, 25, 127, 105); rect(b, 157, 35, 257, 155) // moved 7 right, 5 down
    expect(bestAlignment(a, b)).toEqual({ dx: 7, dy: 5 })
    expect(compareSheets(a, b).boxes).toEqual([])
  })

  it('ignores one-pixel wobble (anti-aliasing)', () => {
    const a = blank(); rect(a, 20, 20, 120, 100)
    const b = blank(); rect(b, 21, 20, 121, 101)
    expect(compareSheets(a, b, { align: false }).boxes).toEqual([])
  })

  it('dilate grows a dot into a square', () => {
    const m = new Uint8Array(25); m[12] = 1
    expect(Array.from(dilate(m, 5, 5, 1)).reduce((s, v) => s + v, 0)).toBe(9)
  })
})

describe('pairing sheets between revisions', () => {
  it('matches by sheet number, then fills the rest in order', () => {
    expect(pairSheets(['A-101', 'A-102', 'A-201'], ['A-201', 'A-101', 'A-102'])).toEqual([1, 2, 0])
    expect(pairSheets(['a-101', undefined], ['A-101', 'X'])).toEqual([0, 1])
    expect(pairSheets(['A-101', 'A-999'], ['A-101'])).toEqual([0, -1])
  })
})

describe('refineSubpixel', () => {
  // soft vertical and horizontal lines (2 px wide blur) centred at fractional positions
  const draw = (w: number, h: number, ox: number, oy: number): Grey => {
    const data = new Uint8Array(w * h).fill(255)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let ink = 0
        for (const cx of [20 + ox, 47 + ox, 71 + ox]) ink = Math.max(ink, Math.max(0, 1 - Math.abs(x - cx) / 2))
        for (const cy of [15 + oy, 52 + oy]) ink = Math.max(ink, Math.max(0, 1 - Math.abs(y - cy) / 2))
        data[y * w + x] = Math.round(255 * (1 - ink))
      }
    return { width: w, height: h, data }
  }
  it('finds a shift of a fraction of a pixel', () => {
    const oldG = draw(100, 80, 0, 0)
    const newG = draw(100, 80, 2.4, -1.3)
    const whole = bestAlignment(oldG, newG)
    const fine = refineSubpixel(oldG, newG, whole)
    expect(fine.dx).toBeCloseTo(2.4, 0)
    expect(Math.abs(fine.dx - 2.4)).toBeLessThan(0.2)
    expect(Math.abs(fine.dy + 1.3)).toBeLessThan(0.2)
  })
})
