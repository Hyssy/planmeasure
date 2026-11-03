import { describe, expect, it } from 'vitest'
import {
  detectSheetLabel,
  groupIntoPhrases,
  labelFromFileName,
  looksLikeSheetNumber,
  type TextItem,
} from './sheetLabel'

// A1 landscape in points
const W = 2384
const H = 1684

/** A text piece; width estimated from character count. */
function t(str: string, x: number, y: number, size = 8): TextItem {
  return { str, x, y, size, w: str.length * size * 0.55 }
}

/** Door/window tags and grid labels scattered over the plan area. */
const planClutter: TextItem[] = [
  ...['D01', 'D01', 'D01', 'D02', 'D02', 'D02', 'W01', 'W01', 'W01'].map((s, i) => t(s, 300 + i * 120, 500 + (i % 3) * 200, 10)),
  t('A', 200, 150, 14), t('B', 600, 150, 14), t('1', 120, 300, 14), t('2', 120, 700, 14),
  t('C1', 900, 900, 10), t('L2', 1100, 950, 10),
  t('GROUND FLOOR PLAN', 800, 1300, 20), t('SCALE 1:100', 800, 1325, 10),
]

describe('recognising sheet numbers', () => {
  it('accepts common sheet number styles', () => {
    for (const n of ['A-101', 'A101', 'DA02', 'DA-02', 'S-200', 'SK-01', 'A1.01', 'AR-DA-1001', 'M-001', 'E01', 'CD-100', 'A-101A']) {
      expect(looksLikeSheetNumber(n), n).toBe(true)
    }
  })

  it('rejects paper sizes, grid lines, postcodes and similar', () => {
    for (const n of ['A1', 'A3', 'C1', 'L2', 'NSW2000', 'RL32.5', 'LOT12', 'DP1234', 'REV-C', '1:100', '2024', 'PLAN', 'FFL-01']) {
      expect(looksLikeSheetNumber(n), n).toBe(false)
    }
  })
})

describe('grouping text into phrases', () => {
  it('joins pieces of one line, even when split mid-word', () => {
    const p = groupIntoPhrases([t('S-', 100, 50, 10), t('200', 100 + 2 * 5.5, 50.3, 10), t('GROUND', 300, 50, 10)])
    expect(p.map((x) => x.text)).toEqual(['S-200', 'GROUND'])
  })

  it('adds spaces between words', () => {
    const p = groupIntoPhrases([t('GROUND', 100, 50, 10), t('FLOOR', 100 + 6 * 5.5 + 3, 50, 10)])
    expect(p.map((x) => x.text)).toEqual(['GROUND FLOOR'])
  })
})

describe('labelled title blocks', () => {
  it('reads values printed below their labels', () => {
    const items = [
      ...planClutter,
      t('PROJECT', 1950, 1380, 7), t('NEW VETERINARY CLINIC', 1950, 1398, 14),
      t('DRAWING TITLE', 1950, 1450, 7), t('GROUND FLOOR PLAN', 1950, 1470, 14),
      t('DRAWING NO.', 1950, 1560, 7), t('A-101', 1950, 1590, 24),
      t('REV', 2200, 1560, 7), t('C', 2200, 1590, 24),
      t('SCALE', 2050, 1560, 7), t('1:100 @ A1', 2050, 1590, 12),
    ]
    expect(detectSheetLabel(items, W, H)).toEqual({ number: 'A-101', title: 'GROUND FLOOR PLAN' })
  })

  it('reads values on the same line as the label', () => {
    const items = [...planClutter, t('TITLE: FOOTING DETAILS', 1950, 1500, 10), t('DWG No: S-200', 1950, 1560, 10)]
    expect(detectSheetLabel(items, W, H)).toEqual({ number: 'S-200', title: 'FOOTING DETAILS' })
  })

  it('reads values to the right of the label', () => {
    const items = [...planClutter, t('SHEET TITLE', 1900, 1500, 8), t('ELEVATIONS', 2000, 1500, 12), t('SHEET NUMBER', 1900, 1560, 8), t('A-301', 2000, 1560, 16)]
    expect(detectSheetLabel(items, W, H)).toEqual({ number: 'A-301', title: 'ELEVATIONS' })
  })

  it('joins a title written over two lines and stops at the next field', () => {
    const items = [
      t('DRAWING TITLE', 1950, 1450, 7),
      t('GROUND FLOOR', 1950, 1470, 14), t('DEMOLITION PLAN', 1950, 1490, 14),
      t('SCALE', 1950, 1520, 7), t('1:100', 1950, 1535, 10),
      t('DWG NO', 1950, 1560, 7), t('DA-05', 1950, 1590, 20),
    ]
    expect(detectSheetLabel(items, W, H)).toEqual({ number: 'DA-05', title: 'GROUND FLOOR DEMOLITION PLAN' })
  })

  it('does not read "SHEET 3 OF 12" as the sheet number', () => {
    const items = [t('SHEET 3 OF 12', 2150, 1640, 8), t('DRAWING NO.', 1950, 1560, 7), t('A-103', 1950, 1590, 24)]
    expect(detectSheetLabel(items, W, H).number).toBe('A-103')
  })

  it('prefers the title block over a drawing list table on a cover sheet', () => {
    const list = ['A-001 COVER SHEET', 'A-101 GROUND FLOOR PLAN', 'A-102 FIRST FLOOR PLAN', 'A-201 ELEVATIONS']
    const items = [
      t('DRAWING LIST', 150, 200, 14), t('SHEET', 150, 230, 8), t('TITLE', 260, 230, 8),
      ...list.flatMap((row, i) => [t(row.split(' ')[0], 150, 250 + i * 18, 9), t(row.slice(6), 260, 250 + i * 18, 9)]),
      t('DRAWING TITLE', 1950, 1450, 7), t('COVER SHEET', 1950, 1470, 14),
      t('SHEET', 1950, 1560, 7), t('A-000', 1950, 1590, 24),
    ]
    expect(detectSheetLabel(items, W, H)).toEqual({ number: 'A-000', title: 'COVER SHEET' })
  })
})

describe('title blocks without labels', () => {
  it('uses the most prominent sheet number in the bottom-right and the largest wording near it', () => {
    const items = [
      ...planClutter,
      t('12 SMITH STREET, NEWCASTLE NSW 2300', 1950, 1520, 8),
      t('SITE ANALYSIS', 1950, 1560, 18),
      t('DA02', 2200, 1600, 30),
      t('NOT FOR CONSTRUCTION', 1950, 1640, 20),
      t('12/03/2026', 2100, 1640, 8),
    ]
    expect(detectSheetLabel(items, W, H)).toEqual({ number: 'DA02', title: 'SITE ANALYSIS' })
  })

  it('does not mistake repeated door tags for a sheet number', () => {
    expect(detectSheetLabel(planClutter, W, H).number).toBeNull()
  })

  it('finds nothing on a sheet with no title block text', () => {
    expect(detectSheetLabel([], W, H)).toEqual({ number: null, title: null })
  })
})

describe('file names', () => {
  it('reads number and title from one-sheet-per-file names', () => {
    expect(labelFromFileName('A-101 Ground Floor Plan.pdf')).toEqual({ number: 'A-101', title: 'Ground Floor Plan' })
    expect(labelFromFileName('S-200_FOOTING DETAILS_Rev C.pdf')).toEqual({ number: 'S-200', title: 'FOOTING DETAILS' })
    expect(labelFromFileName('DA02 - Site Analysis.pdf')).toEqual({ number: 'DA02', title: 'Site Analysis' })
    expect(labelFromFileName('A-101.pdf')).toEqual({ number: 'A-101', title: null })
  })

  it('ignores ordinary file names', () => {
    expect(labelFromFileName('Combined plans.pdf')).toEqual({ number: null, title: null })
    expect(labelFromFileName('2024 issue.pdf')).toEqual({ number: null, title: null })
  })

  it('is used only when the text gives nothing, and only for single-sheet files', () => {
    expect(detectSheetLabel([], W, H, 'A-101 Ground Floor Plan.pdf', 1)).toEqual({ number: 'A-101', title: 'Ground Floor Plan' })
    expect(detectSheetLabel([], W, H, 'A-101 Ground Floor Plan.pdf', 12)).toEqual({ number: null, title: null })
  })
})
