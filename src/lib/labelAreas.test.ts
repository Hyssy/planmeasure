import { describe, expect, it } from 'vitest'
import { areaFromPoints, readNumber, readScales, readTitle, textInArea } from './labelAreas'
import type { TextItem } from './sheetLabel'

const W = 2384
const H = 1684
const t = (str: string, x: number, y: number, size = 8): TextItem => ({ str, x, y, size, w: str.length * size * 0.55 })

// A title block like the DA set: headings with values below, in columns.
const block: TextItem[] = [
  t('DRAWING TITLE:', 1830, 1560, 5), t('Acoustic Barrier', 1830, 1580, 9), t('Details', 1830, 1592, 9),
  t('CLIENT DETAILS:', 2010, 1560, 5), t('Cobbitty Childcare Holdings Pty Ltd', 2010, 1578, 9),
  t('Scale:', 2075, 1670, 5), t('1:100', 2075, 1677, 5),
  t('Drawing #:', 2130, 1670, 5), t('A011', 2130, 1677, 5),
]

describe('reading text inside a taught area', () => {
  it('takes only the text inside the box, line by line', () => {
    const area = areaFromPoints({ x: 1825, y: 1550 }, { x: 1990, y: 1600 }, W, H)
    expect(textInArea(block, area, W, H)).toEqual(['DRAWING TITLE:', 'Acoustic Barrier', 'Details'])
  })

  it('reads a title over two lines and drops the heading', () => {
    expect(readTitle(['DRAWING TITLE:', 'Acoustic Barrier', 'Details'])).toBe('Acoustic Barrier Details')
    expect(readTitle(['Title: Ground floor plan'])).toBe('Ground floor plan')
    expect(readTitle(['GROUND FLOOR PLAN'])).toBe('GROUND FLOOR PLAN')
  })

  it('reads a sheet number with or without its heading', () => {
    expect(readNumber(['Drawing #:', 'A011'])).toBe('A011')
    expect(readNumber(['DWG No: S-200'])).toBe('S-200')
    expect(readNumber(['a-101'])).toBe('A-101')
    expect(readNumber(['DRAWING NO.'])).toBe('')
  })

  it('reads a scale even without the word SCALE', () => {
    expect(readScales(['1:100']).map((c) => c.ratio)).toEqual([100])
    expect(readScales(['Scale:', '1:200 @ A3']).map((c) => [c.ratio, c.paper])).toEqual([[200, 'A3']])
    expect(readScales(['NTS'])).toEqual([])
  })

  it('works from a box dragged in any direction, and clamps to the page', () => {
    const a = areaFromPoints({ x: 2300, y: 1700 }, { x: 2120, y: 1660 }, W, H)
    expect(a.x0).toBeCloseTo(2120 / W, 9)
    expect(a.y1).toBe(1)
    expect(readNumber(textInArea(block, a, W, H))).toBe('A011')
  })

  it('the same fractions find the same field on a smaller print of the layout', () => {
    const area = areaFromPoints({ x: 2120, y: 1660 }, { x: 2200, y: 1684 }, W, H)
    const half = block.map((i) => ({ ...i, x: i.x / 2, y: i.y / 2, w: i.w / 2, size: i.size / 2 }))
    expect(readNumber(textInArea(half, area, W / 2, H / 2))).toBe('A011')
  })
})
