import { describe, expect, it } from 'vitest'
import { MM_PER_PT, describePaperSize, mmToPt, paperSizeFromPt, ptToMm } from './units'

describe('point / millimetre conversion', () => {
  it('uses 1 pt = 0.352778 mm', () => {
    expect(MM_PER_PT).toBeCloseTo(0.352778, 6)
  })

  it('72 pt is exactly one inch (25.4 mm)', () => {
    expect(ptToMm(72)).toBeCloseTo(25.4, 10)
  })

  it('round-trips mm → pt → mm', () => {
    expect(ptToMm(mmToPt(841))).toBeCloseTo(841, 10)
  })
})

describe('paper size detection', () => {
  it('detects A1 landscape (2384 × 1684 pt)', () => {
    const p = paperSizeFromPt(2384, 1684)
    expect(p.name).toBe('A1')
    expect(p.orientation).toBe('landscape')
  })

  it('detects A3 portrait (842 × 1191 pt)', () => {
    const p = paperSizeFromPt(842, 1191)
    expect(p.name).toBe('A3')
    expect(p.orientation).toBe('portrait')
  })

  it('detects A0 and A4', () => {
    expect(paperSizeFromPt(mmToPt(1189), mmToPt(841)).name).toBe('A0')
    expect(paperSizeFromPt(595, 842).name).toBe('A4')
  })

  it('does not label US Letter as an A-size', () => {
    expect(paperSizeFromPt(612, 792).name).toBeNull()
  })

  it('formats a readable description', () => {
    expect(describePaperSize(2384, 1684)).toBe('A1 landscape · 841 × 594 mm')
    expect(describePaperSize(612, 792)).toBe('216 × 279 mm')
  })
})
