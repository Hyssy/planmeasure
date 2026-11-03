import { describe, expect, it } from 'vitest'
import { polygonAreaPt2 } from './geometry'
import { arrowHead, cloudPoints, ellipsePoints, markupPrimitives, textBlockSize, type Markup } from './markup'

const mk = (type: Markup['type'], points: Markup['points'], extra: Partial<Markup> = {}): Markup => ({
  id: 'm', sheetId: 's', type, points, colour: '#e11d48', width: 3, ...extra,
})

describe('markup shapes', () => {
  it('ellipse area is close to π·a·b', () => {
    const pts = ellipsePoints({ x: 0, y: 0 }, { x: 200, y: 100 })
    expect(polygonAreaPt2(pts) / (Math.PI * 100 * 50)).toBeGreaterThan(0.998)
  })

  it('a cloud bulges outward on every side of its box', () => {
    const pts = cloudPoints({ x: 0, y: 0 }, { x: 300, y: 150 }, 30)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(300)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(150)
    // and never by more than one arc radius
    expect(Math.min(...ys)).toBeGreaterThan(-16)
    // it encloses more than the box itself
    expect(polygonAreaPt2(pts)).toBeGreaterThan(300 * 150)
  })

  it('a cloud works whichever way it was dragged', () => {
    const a = cloudPoints({ x: 0, y: 0 }, { x: 300, y: 150 }, 30)
    const b = cloudPoints({ x: 300, y: 150 }, { x: 0, y: 0 }, 30)
    expect(polygonAreaPt2(b)).toBeCloseTo(polygonAreaPt2(a), 6)
  })

  it('an arrowhead points at the end of the line', () => {
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 3)
    expect(head[0]).toEqual({ x: 100, y: 0 })
    expect(head[1].x).toBeLessThan(100)
    expect(head[1].y).toBeCloseTo(-head[2].y, 9)
  })

  it('arrows are a line plus a filled head; highlights are see-through fills', () => {
    expect(markupPrimitives(mk('arrow', [{ x: 0, y: 0 }, { x: 100, y: 0 }])).map((p) => p.kind)).toEqual(['path', 'path'])
    const h = markupPrimitives(mk('highlight', [{ x: 0, y: 0 }, { x: 50, y: 20 }], { colour: '#facc15' }))[0]
    expect(h.kind === 'path' && h.fill === '#facc15' && h.fillOpacity! < 1 && !h.stroke).toBe(true)
  })

  it('text blocks size to their lines', () => {
    const s = textBlockSize(['Check this', 'dimension'], 10)
    expect(s.height).toBeCloseTo(24, 9)
    expect(s.width).toBeCloseTo(10 * 10 * 0.55, 9)
    const t = markupPrimitives(mk('text', [{ x: 5, y: 5 }], { text: 'A\nB', fontSize: 20 }))[0]
    expect(t.kind === 'text' && t.lines).toEqual(['A', 'B'])
  })
})
