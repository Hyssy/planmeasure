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
