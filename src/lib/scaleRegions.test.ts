import { describe, expect, it } from 'vitest'
import { regionFor, type ScaleRegion } from './scaleRegions'

const detail: ScaleRegion = { id: 'r1', sheetId: 's', x0: 100, y0: 100, x1: 300, y1: 200, realMmPerPt: 7.06, label: '1:20' }
const inner: ScaleRegion = { id: 'r2', sheetId: 's', x0: 150, y0: 120, x1: 200, y1: 160, realMmPerPt: 1.76, label: '1:5' }

describe('which scale area a shape uses', () => {
  it('inside an area: that area', () => {
    expect(regionFor([{ x: 120, y: 120 }, { x: 280, y: 190 }], [detail])).toBe(detail)
  })

  it('outside every area: the sheet scale (null)', () => {
    expect(regionFor([{ x: 10, y: 10 }, { x: 50, y: 80 }], [detail])).toBeNull()
    expect(regionFor([{ x: 10, y: 10 }], [])).toBeNull()
  })

  it('crossing an area edge: mixed (refused)', () => {
    expect(regionFor([{ x: 90, y: 150 }, { x: 150, y: 150 }], [detail])).toBe('mixed')
  })

  it('on the edge counts as inside', () => {
    expect(regionFor([{ x: 100, y: 100 }, { x: 300, y: 200 }], [detail])).toBe(detail)
  })

  it('an area inside another: the smaller one wins, and crossing between them is mixed', () => {
    expect(regionFor([{ x: 160, y: 130 }, { x: 190, y: 150 }], [detail, inner])).toBe(inner)
    expect(regionFor([{ x: 160, y: 130 }, { x: 250, y: 150 }], [detail, inner])).toBe('mixed')
  })
})
