/**
 * Title-block areas taught by the user: "the sheet number is in this box,
 * the title in that one, the scale here". The same spot is then read on
 * every sheet in the set.
 *
 * Areas are stored as fractions of the displayed page (0–1), so they also
 * work if the same layout is printed at a different paper size.
 */
import { distinctScales, findScaleCandidates, type ScaleCandidate } from './scale'
import { groupIntoPhrases, isFieldLabel, type TextItem } from './sheetLabel'

export type LabelField = 'number' | 'title' | 'scale'
export const LABEL_FIELDS: LabelField[] = ['number', 'title', 'scale']
export const FIELD_LABEL: Record<LabelField, string> = { number: 'Sheet number', title: 'Title', scale: 'Scale' }
export const AREA_COLOURS: Record<LabelField, string> = { number: '#2563eb', title: '#16a34a', scale: '#ea580c' }

/** A box on the page, as fractions of its width and height. */
export interface AreaRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type LabelAreas = Partial<Record<LabelField, AreaRect>>

/** A rectangle dragged between two page points, as fractions of the page. */
export function areaFromPoints(a: { x: number; y: number }, b: { x: number; y: number }, pageW: number, pageH: number): AreaRect {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return {
    x0: clamp(Math.min(a.x, b.x) / pageW),
    y0: clamp(Math.min(a.y, b.y) / pageH),
    x1: clamp(Math.max(a.x, b.x) / pageW),
    y1: clamp(Math.max(a.y, b.y) / pageH),
  }
}

/** The area in page points for a particular sheet. */
export function areaInPoints(r: AreaRect, pageW: number, pageH: number) {
  return { x: r.x0 * pageW, y: r.y0 * pageH, w: (r.x1 - r.x0) * pageW, h: (r.y1 - r.y0) * pageH }
}

/**
 * The text inside an area, as lines from top to bottom. A piece of text counts
 * if its middle is inside the box (so a box drawn a little tight still works).
 */
export function textInArea(items: TextItem[], r: AreaRect, pageW: number, pageH: number): string[] {
  const box = areaInPoints(r, pageW, pageH)
  const inside = items.filter((i) => {
    const cx = i.x + i.w / 2
    const cy = i.y - i.size * 0.35 // middle of the letters, just above the baseline
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h
  })
  const phrases = groupIntoPhrases(inside).sort((a, b) => a.y - b.y || a.x - b.x)
  // phrases on the same line (side by side) join with a space
  const lines: { y: number; size: number; parts: string[] }[] = []
  for (const p of phrases) {
    const line = lines.find((l) => Math.abs(l.y - p.y) < Math.min(l.size, p.size) * 0.5)
    if (line) line.parts.push(p.text)
    else lines.push({ y: p.y, size: p.size, parts: [p.text] })
  }
  return lines.map((l) => l.parts.join(' ').trim()).filter(Boolean)
}

// Headings that might be caught inside a box along with the value.
const HEADING_PREFIX = /^(?:drawing|dwg|drg|sheet|plan)?\s*(?:no\.?|number|num\.?|#|title|name)\s*[:.]?\s*/i

/** The sheet number in an area's text: the first word with a digit in it, ignoring any heading. */
export function readNumber(lines: string[]): string {
  for (const raw of lines) {
    const line = raw.replace(HEADING_PREFIX, '').trim()
    if (!line || (isFieldLabel(line) && !/\d/.test(line))) continue
    const token = line.split(/\s+/).find((w) => /\d/.test(w) && /^[A-Z0-9][A-Z0-9._/-]*$/i.test(w.replace(/[,;:)]$/, '')))
    if (token) return token.replace(/[,;:)]$/, '').toUpperCase()
  }
  return ''
}

/** The title in an area's text: every line except headings, joined. */
export function readTitle(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !(isFieldLabel(l) && /:$/.test(l)) && !/^(drawing|dwg|sheet)?\s*(title|name)\s*:?$/i.test(l))
    .map((l) => l.replace(/^(?:drawing|dwg|sheet)?\s*(?:title|name)\s*:\s*/i, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Scales in an area's text. A bare "1:100" counts even without the word SCALE. */
export function readScales(lines: string[]): ScaleCandidate[] {
  const text = lines.join('\n')
  const found = findScaleCandidates(text)
  // inside a box the user pointed at, an unlabelled ratio is a scale, not a note
  return distinctScales(found.map((c) => ({ ...c, labelled: true })))
}
