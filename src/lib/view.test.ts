import { describe, expect, it } from 'vitest'
import { fitView, screenToPage, zoomAt } from './view'

describe('viewer camera', () => {
  it('fits a page centred in the box', () => {
    const v = fitView(1000, 500, 1048, 1048, 24)
    expect(v.scale).toBeCloseTo(1)
    expect(v.x).toBeCloseTo(24)
    expect(v.y).toBeCloseTo(274)
  })

  it('keeps the point under the cursor fixed when zooming', () => {
    const v = { scale: 2, x: 10, y: 20 }
    const before = screenToPage(v, 300, 400)
    const after = screenToPage(zoomAt(v, 3.7, 300, 400), 300, 400)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })

  it('page coordinates do not change with zoom', () => {
    const v = { scale: 1, x: 0, y: 0 }
    const z = zoomAt(v, 5, 0, 0)
    // the page point (100, 50) lands on screen at 5× the distance
    expect(z.x + 100 * z.scale).toBeCloseTo(500)
    expect(z.y + 50 * z.scale).toBeCloseTo(250)
  })
})
