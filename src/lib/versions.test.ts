import { describe, expect, it } from 'vitest'
import { cleanSupersedes, findVersionMatches, isSuperseded, latestVersion, sheetGroups, versionNumber } from './versions'

describe('findVersionMatches', () => {
  it('matches sheets with the same number, ignoring case and spaces', () => {
    const existing = [{ id: 'a1', number: 'A-101' }, { id: 'a2', number: 'A-102' }, { id: 'a3', number: '' }]
    const added = [{ id: 'b1', number: 'a-101' }, { id: 'b2', number: 'A-103' }, { id: 'b3', number: 'A - 102' }]
    expect(findVersionMatches(existing, added)).toEqual([
      { newId: 'b1', oldId: 'a1' },
      { newId: 'b3', oldId: 'a2' },
    ])
  })
  it('skips numbers that appear more than once on either side', () => {
    const existing = [{ id: 'a1', number: 'A-101' }, { id: 'a2', number: 'A-101' }, { id: 'a3', number: 'S-01' }]
    const added = [{ id: 'b1', number: 'A-101' }, { id: 'b2', number: 'S-01' }, { id: 'b3', number: 'S-01' }]
    expect(findVersionMatches(existing, added)).toEqual([])
  })
  it('skips unnumbered sheets', () => {
    expect(findVersionMatches([{ id: 'a', number: undefined }], [{ id: 'b', number: undefined }])).toEqual([])
  })
})

describe('version chains', () => {
  const sup = { b: 'a', c: 'b' } // a ← b ← c
  it('numbers versions', () => {
    expect(versionNumber('a', sup)).toBe(1)
    expect(versionNumber('b', sup)).toBe(2)
    expect(versionNumber('c', sup)).toBe(3)
  })
  it('finds the latest and superseded sheets', () => {
    expect(latestVersion('a', sup)).toBe('c')
    expect(isSuperseded('a', sup)).toBe(true)
    expect(isSuperseded('c', sup)).toBe(false)
  })
  it('groups the sheet list at the first version’s place, newest first', () => {
    expect(sheetGroups(['a', 'x', 'b', 'y', 'c'], sup)).toEqual([
      { current: 'c', older: ['b', 'a'] },
      { current: 'x', older: [] },
      { current: 'y', older: [] },
    ])
  })
  it('drops links to missing sheets', () => {
    expect(cleanSupersedes({ b: 'a', c: 'gone' }, new Set(['a', 'b', 'c']))).toEqual({ b: 'a' })
  })
})
