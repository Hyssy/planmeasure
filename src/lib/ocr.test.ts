import { describe, expect, it } from 'vitest'
import { normaliseOcrText, normaliseOcrWord } from './ocr'
import { distinctScales, findScaleCandidates } from './scale'

describe('fixing OCR misreads', () => {
  it('fixes scales misread with l, I, | or ;', () => {
    expect(normaliseOcrText('SCALE l:100 @ A1')).toBe('SCALE 1:100 @ A1')
    expect(normaliseOcrText('SCALE I:200')).toBe('SCALE 1:200')
    expect(normaliseOcrText('|:50')).toBe('1:50')
    expect(normaliseOcrText('SCALE 1;100')).toBe('SCALE 1:100')
  })

  it('fixes sheet sizes misread after @ or AT', () => {
    expect(normaliseOcrText('1:100 @ Al C')).toBe('1:100 @ A1 C')
    expect(normaliseOcrText('1:100@AI')).toBe('1:100@ A1')
    expect(normaliseOcrText('1:200 AT AO')).toBe('1:200 AT A0')
    const found = distinctScales(findScaleCandidates(normaliseOcrText('A-101 1:100 @ Al C')))
    expect(found.map((c) => [c.ratio, c.paper])).toEqual([[100, 'A1']])
  })

  it('leaves ordinary words alone', () => {
    expect(normaliseOcrText('AT ALL TIMES')).toBe('AT ALL TIMES')
    expect(normaliseOcrText('CONTACT AO SMITH')).toBe('CONTACT AO SMITH')
    expect(normaliseOcrText('ISSUE FOR DA')).toBe('ISSUE FOR DA')
    expect(normaliseOcrText('Level 1: Lobby')).toBe('Level 1: Lobby')
    expect(normaliseOcrWord('PLAN')).toBe('PLAN')
    expect(normaliseOcrWord('LOBBY')).toBe('LOBBY')
  })

  it('fixes letters read in the digits of sheet numbers', () => {
    expect(normaliseOcrWord('A-1O1')).toBe('A-101')
    expect(normaliseOcrWord('S-2OO')).toBe('S-200')
    expect(normaliseOcrWord('DAO2')).toBe('DA02')
    expect(normaliseOcrWord('A-l02')).toBe('A-102')
    expect(normaliseOcrWord('A-101')).toBe('A-101')
  })

  it('makes misread scales detectable', () => {
    const found = distinctScales(findScaleCandidates(normaliseOcrText('SCALE l:100 @ A1')))
    expect(found.map((c) => [c.ratio, c.paper])).toEqual([[100, 'A1']])
  })
})
