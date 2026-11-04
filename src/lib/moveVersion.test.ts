import { describe, expect, it } from 'vitest'
import { polygonAreaPt2 } from './geometry'
import { moveToVersion, samePaperSize, transformFromAlignment } from './moveVersion'
import type { Item, Takeoff } from './takeoff'

const MM = 72 / 25.4 // points per mm

describe('transformFromAlignment', () => {
  it('same paper size: a pure shift, converted from pixels to points', () => {
    // A3 (1190.55 pt wide) rendered 2000 px wide; old moved 9.45 px right, 7 px down
    const w = 420 * MM
    const t = transformFromAlignment(w, w, 2000, 9.45, 7)
    expect(t.k).toBe(1)
    expect(t.tx / MM).toBeCloseTo((9.45 / 2000) * 420, 6)
    expect(t.ty / MM).toBeCloseTo((7 / 2000) * 420, 6)
  })
  it('different paper size: scales with the page', () => {
    const t = transformFromAlignment(420 * MM, 841 * MM, 2000, 0, 0)
    expect(t.k).toBeCloseTo(841 / 420, 9)
  })
})

describe('moveToVersion', () => {
  const items: Item[] = [
    { id: 'i1', name: 'Tiles', colour: '#f00', kind: 'area', trade: '', groupId: 'g', sheetId: 'old' },
    { id: 'i2', name: 'Walls', colour: '#0f0', kind: 'linear', trade: '', groupId: 'w', sheetId: 'old' },
    { id: 'i3', name: 'Walls', colour: '#0f0', kind: 'linear', trade: '', groupId: 'w', sheetId: 'new' },
    { id: 'i4', name: 'Doors', colour: '#00f', kind: 'count', trade: '' },
  ]
  const square = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }]
  const takeoffs: Takeoff[] = [
    { id: 't1', itemId: 'i1', sheetId: 'old', points: square, holes: [[{ x: 120, y: 120 }, { x: 130, y: 120 }, { x: 130, y: 130 }]] },
    { id: 't2', itemId: 'i2', sheetId: 'old', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], holes: [] },
    { id: 't3', itemId: 'i4', sheetId: 'old', points: [{ x: 5, y: 5 }], holes: [] },
    { id: 't4', itemId: 'i4', sheetId: 'other', points: [{ x: 5, y: 5 }], holes: [] },
  ]
  const markups = [{ id: 'm1', sheetId: 'old', type: 'cloud' as const, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], colour: '#e11d48', width: 3 }]
  const scaleRegions = [{ id: 'r1', sheetId: 'old', x0: 90, y0: 90, x1: 210, y1: 210, realMmPerPt: 7, label: '1:20' }]
  let n = 0
  const run = (markupsToo: boolean) =>
    moveToVersion({ items, takeoffs, markups, scaleRegions }, 'old', 'new', { k: 1, tx: 5.67, ty: 4.25 }, { markups: markupsToo, newId: () => `n${++n}` })

  it('shifts every point and keeps sizes exact', () => {
    const r = run(true)
    const t1 = r.takeoffs.find((t) => t.id === 't1')!
    expect(t1.sheetId).toBe('new')
    expect(t1.points[0]).toEqual({ x: 105.67, y: 104.25 })
    expect(t1.holes[0][0]).toEqual({ x: 125.67, y: 124.25 })
    expect(polygonAreaPt2(t1.points)).toBeCloseTo(polygonAreaPt2(square), 9)
    expect(r.takeoffs.find((t) => t.id === 't4')!.sheetId).toBe('other')
    expect(r.moved).toEqual({ takeoffs: 3, markups: 1, scaleAreas: 1 })
  })
  it('per-sheet items: joins the new sheet’s item in the same group, or becomes the new sheet’s item', () => {
    const r = run(true)
    expect(r.takeoffs.find((t) => t.id === 't2')!.itemId).toBe('i3')
    expect(r.items.some((i) => i.id === 'i2')).toBe(false)
    expect(r.items.find((i) => i.id === 'i1')!.sheetId).toBe('new')
    expect(r.items.find((i) => i.id === 'i4')!.sheetId).toBeUndefined()
  })
  it('copies scale areas with the shapes; markups only when asked', () => {
    const r = run(false)
    expect(r.scaleRegions).toHaveLength(2)
    expect(r.scaleRegions[0]).toEqual(scaleRegions[0])
    expect(r.scaleRegions[1]).toMatchObject({ sheetId: 'new', x0: 95.67, y0: 94.25, realMmPerPt: 7 })
    expect(r.markups[0].sheetId).toBe('old')
    expect(r.moved.markups).toBe(0)
  })
  it('paper size check', () => {
    expect(samePaperSize({ widthPt: 1190.55, heightPt: 841.89 }, { widthPt: 1191, heightPt: 842 })).toBe(true)
    expect(samePaperSize({ widthPt: 1190.55, heightPt: 841.89 }, { widthPt: 2383.94, heightPt: 1683.78 })).toBe(false)
  })
})
