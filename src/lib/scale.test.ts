import { describe, expect, it } from 'vitest'
import {
  distancePt,
  distinctScales,
  equivalentRatio,
  findScaleCandidates,
  formatArea,
  formatLength,
  formatRatio,
  mmPerPtFromCalibration,
  mmPerPtFromRatio,
  paperResizeFactor,
  polylineLengthPt,
  realMm,
} from './scale'
import { mmToPt } from './units'

const A1 = { w: mmToPt(841), h: mmToPt(594) }
const A3 = { w: mmToPt(420), h: mmToPt(297) }

describe('ratio scales', () => {
  it('1:100 at intended size is 0.352778 × 100 mm per point', () => {
    expect(mmPerPtFromRatio(100)).toBeCloseTo(35.2778, 4)
  })

  it('1:100 @ A1 on an A1 page is unchanged', () => {
    expect(mmPerPtFromRatio(100, 'A1', A1.w, A1.h)).toBeCloseTo(35.2778, 4)
  })

  it('1:100 @ A1 printed on A3 measures like 1:200', () => {
    expect(paperResizeFactor('A1', A3.w, A3.h)).toBeCloseTo(841 / 420, 10)
    expect(mmPerPtFromRatio(100, 'A1', A3.w, A3.h)).toBeCloseTo(35.2778 * (841 / 420), 3)
    expect(equivalentRatio(mmPerPtFromRatio(100, 'A1', A3.w, A3.h))).toBeCloseTo(200, 0)
  })

  it('1:200 @ A3 printed on A1 measures like 1:100', () => {
    expect(equivalentRatio(mmPerPtFromRatio(200, 'A3', A1.w, A1.h))).toBeCloseTo(100, 0)
  })

  it('works for portrait pages too', () => {
    expect(paperResizeFactor('A1', A3.h, A3.w)).toBeCloseTo(841 / 420, 10)
  })
})

describe('measuring at a scale', () => {
  it('100 mm on paper at 1:100 is 10 m', () => {
    const mmPerPt = mmPerPtFromRatio(100)
    expect(realMm(mmToPt(100), mmPerPt)).toBeCloseTo(10_000, 6)
  })

  it('measures a 3-4-5 triangle and a polyline', () => {
    expect(distancePt({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(polylineLengthPt([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11)
  })
})

describe('calibration', () => {
  it('a 3600 mm wall drawn 102.05 pt long gives the matching scale', () => {
    const mmPerPt = mmPerPtFromCalibration(102.05, 3600)
    expect(realMm(102.05, mmPerPt)).toBeCloseTo(3600, 9)
    // 102.05 pt is 36 mm on paper → 1:100
    expect(equivalentRatio(mmPerPtFromCalibration(mmToPt(36), 3600))).toBeCloseTo(100, 9)
  })

  it('rejects zero-length lines and lengths', () => {
    expect(() => mmPerPtFromCalibration(0, 1000)).toThrow()
    expect(() => mmPerPtFromCalibration(10, 0)).toThrow()
  })
})

describe('formatting', () => {
  it('shows lengths in m to 2 dp and areas in m² to 2 dp', () => {
    expect(formatLength(3600)).toBe('3.60 m')
    expect(formatLength(12345.6)).toBe('12.35 m')
    expect(formatArea(12_500_000)).toBe('12.50 m²')
  })

  it('formats ratios', () => {
    expect(formatRatio(100)).toBe('1:100')
    expect(formatRatio(100.02)).toBe('1:100')
    expect(formatRatio(98.734)).toBe('1:98.7')
  })
})

describe('scale detection from text', () => {
  const scales = (text: string) =>
    distinctScales(findScaleCandidates(text)).map((c) => `${c.ratio}${c.paper ? '@' + c.paper : ''}`)

  it('finds common ways of writing a scale', () => {
    expect(scales('GROUND FLOOR PLAN 1:100')).toEqual(['100'])
    expect(scales('SCALE 1:50')).toEqual(['50'])
    expect(scales('SCALE: 1 : 200')).toEqual(['200'])
    expect(scales('SCALE 1:100 @ A1')).toEqual(['100@A1'])
    expect(scales('1:200@A3')).toEqual(['200@A3'])
    expect(scales('scale 1:100 at a1')).toEqual(['100@A1'])
  })

  it('merges repeats and prefers the version that names the sheet size', () => {
    expect(scales('PLAN 1:100   SCALE 1:100 @ A1   SCALE 1:100 @ A1')).toEqual(['100@A1'])
  })

  it('reports several different scales on one sheet', () => {
    expect(scales('PLAN SCALE 1:100 ... DETAIL 3 SCALE 1:20')).toEqual(['100', '20'])
  })

  it('prefers labelled scales over loose ratios', () => {
    expect(scales('MIX 1:5 CEMENT ... SCALE 1:100')).toEqual(['100'])
  })

  it('ignores slopes and falls', () => {
    expect(scales('FALL 1:100 TO GRATE')).toEqual([])
    expect(scales('RAMP GRADIENT 1:14')).toEqual([])
    expect(scales('1:20 FALL')).toEqual([])
    expect(scales('MAX 1:8 SLOPE')).toEqual([])
    expect(scales('1:100 MIN FALL')).toEqual([])
  })

  it('a fall note nearby does not hide the real scale', () => {
    expect(scales('C-100 SITE PLAN 1:200 \n FALL 1:100 TO GRATE')).toEqual(['200'])
    expect(scales('SITE PLAN 1:200   STORMWATER NOTES FALL 1:100')).toEqual(['200'])
  })

  it('ignores times, dates and odd ratios', () => {
    expect(scales('PRINTED 11:30')).toEqual([])
    expect(scales('REV 21:100')).toEqual([])
    expect(scales('1:37')).toEqual([])
    expect(scales('10.1:100')).toEqual([])
  })

  it('finds nothing on a sheet with no scale', () => {
    expect(scales('NOT TO SCALE')).toEqual([])
  })
})
