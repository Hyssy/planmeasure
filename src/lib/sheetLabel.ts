/**
 * Sheet labelling: find a sheet's number (e.g. "A-101") and title
 * (e.g. "GROUND FLOOR PLAN") from its text.
 *
 * Order of preference:
 *  1. Labelled fields in the title block ("DRAWING NO." → value beside or below it).
 *  2. The most prominent sheet-number-looking text, favouring the bottom-right title block.
 *  3. The file name, for sets split into one PDF per sheet ("A-101 Ground Floor Plan.pdf").
 * Everything detected is a suggestion; the user can edit it.
 */

export interface TextItem {
  str: string
  /** start of the baseline, page points from the displayed page's top-left */
  x: number
  y: number
  w: number
  /** font height in points */
  size: number
}

/** Neighbouring text pieces on the same line, merged. */
export interface Phrase {
  text: string
  x: number
  y: number
  /** right-hand end */
  x2: number
  size: number
}

export interface SheetLabelGuess {
  number: string | null
  title: string | null
}

// ---------------------------------------------------------------------------
// Grouping text into phrases
// ---------------------------------------------------------------------------

/**
 * Join text pieces that sit on the same baseline with only a small gap
 * (PDFs often split one line into many pieces).
 */
export function groupIntoPhrases(items: TextItem[]): Phrase[] {
  // Left to right, so pieces of one line join up even if their baselines wobble slightly.
  const sorted = items.filter((i) => i.str.trim() !== '').sort((a, b) => a.x - b.x || a.y - b.y)
  const phrases: Phrase[] = []
  // Index phrases by baseline height (4 pt bands) so big pages stay fast.
  const BAND = 4
  const bands = new Map<number, Phrase[]>()
  for (const item of sorted) {
    const size = item.size || 1
    const band = Math.round(item.y / BAND)
    const reach = Math.ceil((size * 0.4) / BAND) + 1
    let host: Phrase | undefined
    for (let b = band - reach; b <= band + reach && !host; b++) {
      host = bands.get(b)?.find(
        (p) =>
          Math.abs(p.y - item.y) < Math.min(p.size, size) * 0.4 &&
          Math.abs(p.size - size) < Math.max(p.size, size) * 0.35 &&
          item.x >= p.x2 - size * 0.5 &&
          item.x - p.x2 < size * 1.2,
      )
    }
    if (host) {
      const gap = item.x - host.x2
      host.text += (gap > size * 0.15 && !host.text.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str
      host.x2 = Math.max(host.x2, item.x + item.w)
    } else {
      const p = { text: item.str, x: item.x, y: item.y, x2: item.x + item.w, size }
      phrases.push(p)
      const list = bands.get(band)
      if (list) list.push(p)
      else bands.set(band, [p])
    }
  }
  for (const p of phrases) p.text = p.text.replace(/\s+/g, ' ').trim()
  return phrases.filter((p) => p.text)
}

// ---------------------------------------------------------------------------
// What a sheet number looks like
// ---------------------------------------------------------------------------

// Letters, optional separator, digits: A-101, A101, DA02, S-200, SK-01, A1.01, AR-DA-1001, M-001.
const SHEET_NUMBER_RE = /^[A-Z]{1,4}(?:[-_.][A-Z]{1,3})?[-_.]?\d{1,4}(?:[.-]\d{1,3})?[A-Z]?$/i

// Things that look like sheet numbers but aren't.
const NOT_SHEET_NUMBER = [
  /^A[0-4]$/i, // paper sizes
  /^(NSW|VIC|QLD|ACT|TAS|NT|SA|WA|ABN|ACN|LOT|DP|SP|RL|FFL|SSL|NGL|PH|TEL|FAX|MOB|REV|NO|PO|BOX|LEVEL|UNIT|SUITE|SHOP|ISO|AS|NCC|BCA|CL)[-_.]?\d/i,
]

/** Could this token be a sheet number on its own (no label next to it)? */
export function looksLikeSheetNumber(token: string): boolean {
  const t = token.trim().replace(/[,;:)]$/, '')
  if (!SHEET_NUMBER_RE.test(t)) return false
  if (NOT_SHEET_NUMBER.some((re) => re.test(t))) return false
  const digits = (t.match(/\d/g) ?? []).length
  const hasSeparator = /[-_.]/.test(t)
  // "C1", "L2", "W3" are grid lines, levels and window tags far more often than sheet numbers.
  return digits >= 2 || hasSeparator
}

/** A labelled value can be looser: "101", "A1", "01". */
function looksLikeLabelledNumber(token: string): boolean {
  const t = token.trim().replace(/[,;:)]$/, '')
  return /^[A-Z0-9][A-Z0-9._-]{0,15}$/i.test(t) && /\d/.test(t)
}

// ---------------------------------------------------------------------------
// Labels in title blocks
// ---------------------------------------------------------------------------

const NUMBER_LABEL_RE =
  /^(?:DRAWING|DWG|DRG|SHEET|PLAN)\.?\s*(?:NO\.?|NUMBER|NUM\.?|#|Nº|N°)?\s*[:.]?\s*/i
const NUMBER_LABEL_STRICT_RE =
  /^(?:(?:DRAWING|DWG|DRG|SHEET)\.?\s*(?:NO\.?|NUMBER|NUM\.?|#|Nº|N°)|DWG|DRG|SHEET)\s*[:.]?/i
const TITLE_LABEL_RE = /^(?:(?:DRAWING|DWG|DRG|SHEET)\s+)?(?:TITLE|NAME)\s*[:.]?\s*/i

/** Words that start another title-block field (used to stop reading a multi-line title). */
// The whole phrase must be the label ("SITE", "PROJECT NO", "DRAWN BY") or a label
// with its value after a colon ("SCALE: 1:100") — so "SITE ANALYSIS" is not a label.
const FIELD_LABEL_RE =
  /^(PROJECT|CLIENT|ADDRESS|SITE|LOCATION|SCALE|DATE|DRAWN|CHECKED|APPROVED|DESIGNED|AUTHORISED|AUTHORIZED|REV|REVISION|ISSUE|STATUS|JOB|SHEET|NORTH|NOTES|AMENDMENT|DESCRIPTION|PURPOSE|STAGE|PAPER SIZE|SIZE|COPYRIGHT)(?:\s+(?:NO\.?|NUMBER|NAME|DATE|BY|SIZE))?\s*(?::.*)?$/i

function isFieldLabel(text: string): boolean {
  return FIELD_LABEL_RE.test(text) || NUMBER_LABEL_STRICT_RE.test(text) || TITLE_LABEL_RE.test(text)
}

/** Is `p` on the same line as, and to the right of, `label`? */
function rightOf(label: Phrase, p: Phrase, maxGap: number): boolean {
  return Math.abs(p.y - label.y) < label.size * 0.7 && p.x >= label.x2 - 1 && p.x - label.x2 < maxGap
}

/** Is `p` below `label`, roughly in the same column? */
function below(label: Phrase, p: Phrase, maxDrop: number): boolean {
  const dy = p.y - label.y
  const overlaps = p.x < label.x2 + label.size * 4 && p.x2 > label.x - label.size * 4
  return dy > label.size * 0.5 && dy < maxDrop && overlaps
}

function dist(a: Phrase, b: Phrase): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Labels nearest the bottom-right corner (where title blocks live) come first. */
function byTitleBlockFirst(phrases: Phrase[], pageW: number, pageH: number): Phrase[] {
  return [...phrases].sort((a, b) => b.x / pageW + b.y / pageH - (a.x / pageW + a.y / pageH))
}

function findLabelledNumber(phrases: Phrase[], pageW: number, pageH: number): string | null {
  for (const label of byTitleBlockFirst(phrases, pageW, pageH)) {
    if (!NUMBER_LABEL_STRICT_RE.test(label.text)) continue
    // Value in the same phrase: "DWG No: S-200"
    const rest = label.text.replace(NUMBER_LABEL_RE, '').trim()
    if (rest) {
      if (/^\d+\s*(?:OF|\/)\s*\d+/i.test(rest)) continue // "SHEET 3 OF 12" is a page count
      const token = rest.split(' ')[0]
      if (looksLikeLabelledNumber(token) && !/^(NO|NUMBER)$/i.test(token)) return clean(token)
      continue // e.g. "SHEET 3 OF 12" or "DRAWING LIST" — not a number field
    }
    // Value beside or below: nearest phrase that is a single number-like token.
    const near = phrases
      .filter((p) => p !== label && (rightOf(label, p, pageW * 0.15) || below(label, p, label.size * 6)))
      .filter((p) => looksLikeLabelledNumber(p.text.split(' ')[0]) && !isFieldLabel(p.text))
      .sort((a, b) => dist(label, a) - dist(label, b))
    if (near[0]) return clean(near[0].text.split(' ')[0])
  }
  return null
}

function findLabelledTitle(phrases: Phrase[], pageW: number, pageH: number): string | null {
  for (const label of byTitleBlockFirst(phrases, pageW, pageH)) {
    if (!TITLE_LABEL_RE.test(label.text)) continue
    const rest = label.text.replace(TITLE_LABEL_RE, '').trim()
    if (rest) return tidyTitle(rest)

    const beside = phrases
      .filter((p) => p !== label && rightOf(label, p, pageW * 0.15) && !isFieldLabel(p.text))
      .sort((a, b) => a.x - b.x)[0]
    if (beside) return tidyTitle(beside.text)

    // Below: may run over several lines. Read down the column until a gap or another field.
    const column = phrases
      .filter((p) => p !== label && below(label, p, label.size * 12))
      .sort((a, b) => a.y - b.y)
    const lines: Phrase[] = []
    for (const p of column) {
      if (isFieldLabel(p.text)) break
      const prev = lines[lines.length - 1] ?? label
      const gap = p.y - prev.y
      if (lines.length > 0 && gap > Math.max(prev.size, p.size) * 2.2) break
      if (lines.length === 0 && gap > label.size * 6) break
      lines.push(p)
      if (lines.length === 4) break
    }
    if (lines.length) return tidyTitle(lines.map((l) => l.text).join(' '))
  }
  return null
}

// ---------------------------------------------------------------------------
// Unlabelled fallback
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (!values.length) return 1
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Score sheet-number-looking tokens by position and size; return the best phrase. */
function findProminentNumber(
  phrases: Phrase[],
  pageW: number,
  pageH: number,
): { number: string; phrase: Phrase } | null {
  const typical = median(phrases.map((p) => p.size))
  const counts = new Map<string, number>()
  const tokens: { token: string; phrase: Phrase; alone: boolean }[] = []
  for (const p of phrases) {
    const words = p.text.split(' ')
    for (const w of words) {
      const token = clean(w)
      if (!looksLikeSheetNumber(token)) continue
      counts.set(token.toUpperCase(), (counts.get(token.toUpperCase()) ?? 0) + 1)
      tokens.push({ token, phrase: p, alone: words.length === 1 })
    }
  }
  let best: { number: string; phrase: Phrase; score: number } | null = null
  for (const { token, phrase, alone } of tokens) {
    const fx = phrase.x / pageW
    const fy = phrase.y / pageH
    let score = 0
    if (fx > 0.6 && fy > 0.6) score += 3 // bottom-right title block
    else if (fx > 0.75) score += 1.5 // vertical title block down the right edge
    else if (fy > 0.85) score += 1 // title strip along the bottom
    score += Math.min(3, phrase.size / typical)
    if (alone) score += 1
    if (/[-_.]/.test(token)) score += 0.5
    if ((counts.get(token.toUpperCase()) ?? 0) > 2) score -= 3 // repeated tags (doors, windows)
    if (!best || score > best.score) best = { number: token, phrase, score }
  }
  return best && best.score >= 4.5 ? { number: best.number, phrase: best.phrase } : null
}

const NOT_A_TITLE = [
  /\b1\s*:\s*\d+/, // scales
  /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/, // dates
  /^[\d\s.,:/-]+$/, // only numbers
  /@|www\.|\.com|\.au\b|https?:/i, // contact details
  /^(NOT FOR CONSTRUCTION|FOR CONSTRUCTION|PRELIMINARY|FOR APPROVAL|FOR TENDER|DRAFT|COPYRIGHT)/i,
  /^(N\.?T\.?S\.?|NOT TO SCALE)$/i,
]

function usableTitle(text: string): boolean {
  return (
    text.length >= 4 &&
    text.length <= 60 &&
    /[A-Z]{3,}/i.test(text) &&
    !isFieldLabel(text) &&
    !NOT_A_TITLE.some((re) => re.test(text))
  )
}

/** Near an unlabelled sheet number, the biggest piece of wording is usually the title. */
function findProminentTitle(phrases: Phrase[], near: Phrase, number: string, pageW: number): string | null {
  // Number and title on one line: "A-101 GROUND FLOOR PLAN"
  const rest = tidyTitle(near.text.replace(new RegExp(`^.*?\\b${escapeRe(number)}\\b`, 'i'), ''))
  if (rest && usableTitle(rest)) return rest

  const reach = pageW * 0.25
  const options = phrases.filter(
    (p) =>
      p !== near &&
      Math.abs(p.x - near.x) < reach &&
      Math.abs(p.y - near.y) < reach &&
      usableTitle(p.text) &&
      !p.text.toUpperCase().includes(number.toUpperCase()),
  )
  options.sort((a, b) => b.size - a.size || dist(a, near) - dist(b, near))
  return options[0] ? tidyTitle(options[0].text) : null
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

/** "A-101 Ground Floor Plan.pdf" → { number: "A-101", title: "Ground Floor Plan" } */
export function labelFromFileName(fileName: string): SheetLabelGuess {
  const base = fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim()
  const m = base.match(/^([A-Z0-9][A-Z0-9._-]*[A-Z0-9])(?:\s*[-–—]\s*|\s+)(.+)$/i)
  const first = m ? m[1] : base
  if (!looksLikeSheetNumber(first)) return { number: null, title: null }
  const title = m ? tidyTitle(m[2].replace(/\s*(?:rev|revision)\s*[A-Z0-9]{1,3}$/i, '')) : null
  return { number: clean(first), title: title || null }
}

// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
}

function clean(token: string): string {
  return token.trim().replace(/[,;:)]$/, '').toUpperCase()
}

function tidyTitle(t: string): string {
  return t.replace(/\s+/g, ' ').replace(/^[:\-–\s]+|[:\-–\s]+$/g, '').trim()
}

/** Work out a sheet's number and title from its text (and file name, if one sheet per file). */
export function detectSheetLabel(
  items: TextItem[],
  pageW: number,
  pageH: number,
  fileName?: string,
  pagesInFile = 1,
): SheetLabelGuess {
  const phrases = groupIntoPhrases(items)
  let number = findLabelledNumber(phrases, pageW, pageH)
  let title = findLabelledTitle(phrases, pageW, pageH)

  if (!number || !title) {
    const prominent = findProminentNumber(phrases, pageW, pageH)
    if (prominent) {
      number ??= prominent.number
      title ??= findProminentTitle(phrases, prominent.phrase, prominent.number, pageW)
    }
  }

  if (fileName && pagesInFile === 1 && (!number || !title)) {
    const fromName = labelFromFileName(fileName)
    if (!number) number = fromName.number
    if (!title && fromName.number && fromName.number === number) title = fromName.title
  }

  return { number, title }
}
