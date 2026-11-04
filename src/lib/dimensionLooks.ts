/** Dimension sizes for the screen (constant in pixels) and for exported PDFs (paper sizes). */
import type { DimensionLook } from './dimensions'
import type { DimensionPrefs } from '../panels'
import { mmToPt } from './units'

/** On screen: sizes in pixels, converted to page points at the current zoom (`s` = pixels per point). */
export function screenLook(prefs: DimensionPrefs, s: number): DimensionLook {
  const px = prefs.size === 'large' ? 14 : 11
  return { style: prefs.style, units: prefs.units, textSize: px / s, offset: 18 / s, tick: 5 / s, lineWidth: 1 / s, colour: '#1f1f1f' }
}

/** On an exported PDF: real paper sizes, so dimensions print like a drawing's. */
export function paperLook(prefs: DimensionPrefs): DimensionLook {
  return {
    style: prefs.style,
    units: prefs.units,
    textSize: prefs.size === 'large' ? 9 : 7,
    offset: mmToPt(6),
    tick: mmToPt(1),
    lineWidth: 0.6,
    colour: '#1f1f1f',
  }
}
