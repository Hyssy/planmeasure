import { describe, expect, it } from 'vitest'
import { dimensionSide, formatDimension, readableAngle, segmentDimension, shapeDimensions, type DimensionLook } from './dimensions'
import { mmPerPtFromRatio } from './scale'
import { mmToPt } from './units'

const k100 = mmPerPtFromRatio(100)
const look: DimensionLook = { style: 'offset', units: 'm', textSize: 10, offset: 20, tick: 4, lineWidth: 1, colour: '#111' }
const m = (x: number, y: number) => ({ x: mmToPt(x * 10), y: mmToPt(y * 10) }) // metres at 1:100

describe('dimension text', () => {
  it('formats metres and millimetres', () => {
    expect(formatDimension(3600, 'm')).toBe('3.60 m')
    expect(formatDimension(3600, 'mm')).toBe('3600')
    expect(formatDimension(2412.6, 'mm')).toBe('2413')
  })

  it('keeps text the right way up at any angle', () => {
    expect(readableAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
    expect(readableAngle({ x: 10, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(0, 9) // drawn right-to-left
    // vertical text reads bottom to top, whichever way the line was drawn
    expect(readableAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(-90)
    expect(readableAngle({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(-90)
    expect(readableAngle({ x: 0, y: 0 }, { x: -10, y: 10 })).toBeCloseTo(-45, 9)
  })
})

describe('which side the dimension goes', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  const centre = { x: 5, y: 5 }

  it('outside a closed shape, whichever way it was drawn', () => {
    // top edge: outside is up (negative y)
    const s1 = dimensionSide(square[0], square[1], centre)
    const ny1 = -(square[1].x - square[0].x) * s1
    expect(ny1).toBeLessThan(0)
    // same edge drawn the other way
    const s2 = dimensionSide(square[1], square[0], centre)
    const ny2 = -(square[0].x - square[1].x) * s2
    expect(ny2).toBeLessThan(0)
  })

  it('above an open horizontal line, left of a vertical one, and flip swaps', () => {
    expect(dimensionSide({ x: 0, y: 0 }, { x: 10, y: 0 }, null)).toBe(1)
    expect(dimensionSide({ x: 10, y: 0 }, { x: 0, y: 0 }, null)).toBe(-1)
    expect(dimensionSide({ x: 0, y: 0 }, { x: 0, y: 10 }, null)).toBe(-1)
    expect(dimensionSide({ x: 0, y: 0 }, { x: 10, y: 0 }, null, true)).toBe(-1)
  })
})

describe('offset dimension geometry', () => {
  const a = m(0, 5)
  const b = m(3.6, 5)
  const prims = segmentDimension(a, b, k100, look, 1)
  const texts = prims.filter((p) => p.kind === 'text')
  const paths = prims.filter((p) => p.kind === 'path')

  it('shows the real length', () => {
    expect(texts).toHaveLength(1)
    expect(texts[0].kind === 'text' && texts[0].lines).toEqual(['3.60 m'])
  })

  it('draws the dimension line parallel to and offset from the measured line', () => {
    const dimLine = paths[1].kind === 'path' ? paths[1].rings[0] : []
    expect(dimLine[0].y).toBeCloseTo(a.y - 20, 9) // 20 pt above (side +1 = up for a left-to-right line)
    expect(dimLine[1].y).toBeCloseTo(b.y - 20, 9)
    expect(dimLine[0].x).toBeCloseTo(a.x, 9)
    expect(dimLine[1].x).toBeCloseTo(b.x, 9)
  })

  it('puts the figure beyond the dimension line, away from the shape', () => {
    const t = texts[0]
    if (t.kind !== 'text') throw new Error()
    expect(t.at.y).toBeLessThan(a.y - 20)
  })

  it('on-the-line style is just a figure centred on the line', () => {
    const on = segmentDimension(a, b, k100, { ...look, style: 'on' }, 1)
    expect(on.map((p) => p.kind)).toEqual(['text'])
  })

  it('skips segments too short to label', () => {
    const wobble = [m(0, 0), m(0.05, 0.01), m(3, 0)]
    const labels = shapeDimensions(wobble, false, k100, look, false, undefined, 20).flatMap((p) => (p.kind === 'text' ? p.lines : []))
    expect(labels).toEqual(['2.95 m'])
  })

  it('unscaled sheets say "no scale"', () => {
    const t = segmentDimension(a, b, null, look, 1).find((p) => p.kind === 'text')
    expect(t?.kind === 'text' && t.lines).toEqual(['no scale'])
  })

  it('a rectangle gets four edge dimensions with the right lengths', () => {
    const room = [m(0, 0), m(6, 0), m(6, 4), m(0, 4)]
    const labels = shapeDimensions(room, true, k100, look, false).flatMap((p) => (p.kind === 'text' ? p.lines : []))
    expect(labels).toEqual(['6.00 m', '4.00 m', '6.00 m', '4.00 m'])
    const run = shapeDimensions([m(0, 0), m(3.6, 0), m(3.6, 2.4)], false, k100, { ...look, units: 'mm' }, false)
    expect(run.flatMap((p) => (p.kind === 'text' ? p.lines : []))).toEqual(['3600', '2400'])
  })
})
