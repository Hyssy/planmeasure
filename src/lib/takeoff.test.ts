import { describe, expect, it } from 'vitest'
import { distanceToPolyline, pointInPolygon, polygonAreaPt2, polygonCentroid, polygonPerimeterPt } from './geometry'
import { mmPerPtFromRatio } from './scale'
import { formatQuantity, grossAreaM2, itemTotal, lengthM, netAreaM2, perimeterM, takeoffQuantity, type Item, type Takeoff } from './takeoff'
import { mmToPt } from './units'

// At 1:100, 10 mm on paper = 1 m in reality.
const k100 = mmPerPtFromRatio(100)
/** a point given in real-world metres at 1:100 */
const m = (x: number, y: number) => ({ x: mmToPt(x * 10), y: mmToPt(y * 10) })

describe('polygon geometry', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

  it('area and perimeter of a square, either winding', () => {
    expect(polygonAreaPt2(square)).toBe(100)
    expect(polygonAreaPt2([...square].reverse())).toBe(100)
    expect(polygonPerimeterPt(square)).toBe(40)
  })

  it('area of an L-shape', () => {
    const L = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 0, y: 5 }]
    expect(polygonAreaPt2(L)).toBe(6 * 2 + 2 * 3)
  })

  it('point in polygon and distance to edges', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
    expect(distanceToPolyline({ x: 5, y: -3 }, square, true)).toBe(3)
    expect(distanceToPolyline({ x: -4, y: 5 }, square, true)).toBe(4) // closed: the left edge counts
    expect(distanceToPolyline({ x: -4, y: 5 }, square, false)).toBeCloseTo(Math.hypot(4, 5), 9) // open: nearest is a corner
  })

  it('centroid of a square', () => {
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 })
  })
})

describe('real-world quantities at 1:100', () => {
  it('a 6 m × 4 m room is 24.00 m² with a 20.00 m perimeter', () => {
    const room = [m(0, 0), m(6, 0), m(6, 4), m(0, 4)]
    expect(netAreaM2(room, [], k100)).toBeCloseTo(24, 9)
    expect(perimeterM(room, k100)).toBeCloseTo(20, 9)
  })

  it('a 2 m × 1 m cut-out takes 2 m² off', () => {
    const room = [m(0, 0), m(6, 0), m(6, 4), m(0, 4)]
    const hole = [m(1, 1), m(3, 1), m(3, 2), m(1, 2)]
    expect(grossAreaM2(room, k100)).toBeCloseTo(24, 9)
    expect(netAreaM2(room, [hole], k100)).toBeCloseTo(22, 9)
  })

  it('a wall run of 3.6 m + 2.4 m is 6.00 m', () => {
    expect(lengthM([m(0, 0), m(3.6, 0), m(3.6, 2.4)], k100)).toBeCloseTo(6, 9)
  })

  it('the same drawing at 1:50 measures half the length and a quarter of the area', () => {
    const k50 = mmPerPtFromRatio(50)
    const room = [m(0, 0), m(6, 0), m(6, 4), m(0, 4)]
    expect(perimeterM(room, k50)).toBeCloseTo(10, 9)
    expect(netAreaM2(room, [], k50)).toBeCloseTo(6, 9)
  })
})

describe('item totals and scale states', () => {
  const walls: Item = { id: 'i1', name: 'Wall', colour: '#000', kind: 'linear', trade: '' }
  const lights: Item = { id: 'i2', name: 'Downlight', colour: '#000', kind: 'count', trade: '' }
  const run = (id: string, sheetId: string, len: number): Takeoff => ({ id, itemId: 'i1', sheetId, points: [m(0, 0), m(len, 0)], holes: [] })
  const light = (id: string, sheetId: string): Takeoff => ({ id, itemId: 'i2', sheetId, points: [m(1, 1)], holes: [] })
  const scales = {
    s1: { realMmPerPt: k100, state: 'confirmed' as const },
    s2: { realMmPerPt: k100, state: 'unverified' as const },
  }
  const takeoffs = [run('a', 's1', 5), run('b', 's1', 2.5), run('c', 's2', 4), run('d', 's3', 9), light('e', 's1'), light('f', 's3')]

  it('adds lengths across sheets, leaving out unscaled sheets and flagging unverified ones', () => {
    const t = itemTotal(walls, takeoffs, scales)
    expect(t.total).toBeCloseTo(11.5, 9)
    expect(t.unscaled).toBe(1)
    expect(t.unverified).toBe(1)
    expect(t.bySheet.map((r) => [r.sheetId, Number(r.total.toFixed(2)), r.unscaled])).toEqual([
      ['s1', 7.5, 0], ['s2', 4, 0], ['s3', 0, 1],
    ])
  })

  it('counts need no scale', () => {
    expect(itemTotal(lights, takeoffs, scales).total).toBe(2)
    expect(takeoffQuantity(light('x', 's9'), 'count', undefined).value).toBe(1)
  })

  it('an unscaled length has no value', () => {
    expect(takeoffQuantity(run('x', 's9', 3), 'linear', undefined)).toEqual({ value: null, state: 'none' })
  })

  it('formats quantities', () => {
    expect(formatQuantity(12.345, 'linear')).toBe('12.35 m')
    expect(formatQuantity(48.2, 'area')).toBe('48.20 m²')
    expect(formatQuantity(17, 'count')).toBe('17')
  })
})

describe('drawing styles', () => {
  it('a rectangle from two corners has the right area, however it was dragged', async () => {
    const { rectCorners } = await import('./geometry')
    for (const [a, b] of [[m(0, 0), m(6, 4)], [m(6, 4), m(0, 0)], [m(6, 0), m(0, 4)]]) {
      const r = rectCorners(a, b)
      expect(r).toHaveLength(4)
      expect(netAreaM2(r, [], k100)).toBeCloseTo(24, 9)
      expect(perimeterM(r, k100)).toBeCloseTo(20, 9)
    }
  })

  it('simplifying a freehand stroke keeps its length and area to well under 0.5%', async () => {
    const { simplifyPath } = await import('./geometry')
    // a wobbly circle of radius 5 m, sampled every degree with ±0.2 mm paper jitter
    const r = mmToPt(50)
    const raw = Array.from({ length: 360 }, (_, i) => {
      const t = (i / 360) * 2 * Math.PI
      const jitter = mmToPt(0.2) * Math.sin(i * 7.3)
      return { x: (r + jitter) * Math.cos(t), y: (r + jitter) * Math.sin(t) }
    })
    const simple = simplifyPath(raw, mmToPt(0.1))
    expect(simple.length).toBeLessThan(raw.length)
    const before = netAreaM2(raw, [], k100)
    const after = netAreaM2(simple, [], k100)
    expect(Math.abs(after - before) / before).toBeLessThan(0.005)
    expect(Math.abs(before - Math.PI * 25) / (Math.PI * 25)).toBeLessThan(0.01)
  })

  it('a straight freehand line simplifies to its two ends', async () => {
    const { simplifyPath } = await import('./geometry')
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0.01 * Math.sin(i) }))
    expect(simplifyPath(line, 0.1)).toEqual([line[0], line[49]])
  })
})

describe('one item per sheet, added together', () => {
  const tiles = { id: 'i1', name: 'Floor tiles', colour: '#e6194b', kind: 'area' as const, trade: 'Tiling', groupId: 'i1', sheetId: 's1' }

  it('keeps using the item on its own sheet', async () => {
    const { itemForSheet } = await import('./takeoff')
    expect(itemForSheet([tiles], tiles, 's1', true)).toEqual({ item: tiles, isNew: false })
  })

  it('on another sheet, makes a matching item in the same group', async () => {
    const { itemForSheet } = await import('./takeoff')
    const r = itemForSheet([tiles], tiles, 's2', true)
    expect(r.isNew).toBe(true)
    expect(r.item).toMatchObject({ name: 'Floor tiles', colour: '#e6194b', kind: 'area', trade: 'Tiling', groupId: 'i1', sheetId: 's2' })
  })

  it('reuses the group’s item for that sheet if there is one', async () => {
    const { itemForSheet } = await import('./takeoff')
    const s2 = { ...tiles, id: 'i2', sheetId: 's2' }
    expect(itemForSheet([tiles, s2], tiles, 's2', true)).toEqual({ item: s2, isNew: false })
    // and from the A-102 item back to A-101
    expect(itemForSheet([tiles, s2], s2, 's1', true)).toEqual({ item: tiles, isNew: false })
  })

  it('with per-sheet off, one item covers every sheet', async () => {
    const { itemForSheet } = await import('./takeoff')
    expect(itemForSheet([tiles], tiles, 's2', false)).toEqual({ item: tiles, isNew: false })
  })

  it('older items (no sheet) start a group when used per sheet', async () => {
    const { itemForSheet } = await import('./takeoff')
    const old = { id: 'o1', name: 'Walls', colour: '#000', kind: 'linear' as const, trade: '' }
    expect(itemForSheet([old], old, 's3', true).item).toMatchObject({ groupId: 'o1', sheetId: 's3' })
  })

  it('group totals add the sheets together', async () => {
    const { groupItems, groupTotal } = await import('./takeoff')
    const s2 = { ...tiles, id: 'i2', sheetId: 's2' }
    const other = { id: 'x', name: 'Walls', colour: '#000', kind: 'linear' as const, trade: '' }
    const groups = groupItems([tiles, other, s2])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['i1', 'i2'], ['x']])
    const sq = (id: string, itemId: string, sheetId: string, w: number) => ({ id, itemId, sheetId, points: [m(0, 0), m(w, 0), m(w, 10), m(0, 10)], holes: [] })
    const takeoffs = [sq('a', 'i1', 's1', 10), sq('b', 'i2', 's2', 5), sq('c', 'i2', 's2', 2)]
    const scales = { s1: { realMmPerPt: k100, state: 'confirmed' as const }, s2: { realMmPerPt: k100, state: 'unverified' as const } }
    const t = groupTotal(groups[0], takeoffs, scales)
    expect(t.total).toBeCloseTo(100 + 50 + 20, 9)
    expect(t.parts.map((p) => Number(p.total.total.toFixed(2)))).toEqual([100, 70])
    expect(t.unverified).toBe(2)
  })
})
