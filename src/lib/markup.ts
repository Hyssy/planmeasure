/**
 * Markups: clouds, rectangles, ellipses, arrows, lines, pen, text and highlights.
 *
 * Geometry is stored in PDF page points, like takeoffs. Line widths and text
 * sizes are in points on the paper, so markups print at a true size.
 *
 * Every markup (and takeoff) is turned into simple drawing "primitives" —
 * outlines, filled shapes, circles and text — which both the screen and the
 * PDF export draw. That keeps the exported PDF identical to what's on screen.
 */
import { polygonCentroid, rectCorners, signedAreaPt2 } from './geometry'
import type { Point } from './scale'
import type { Item, Takeoff } from './takeoff'

export type MarkupType = 'cloud' | 'rectangle' | 'ellipse' | 'arrow' | 'line' | 'pen' | 'text' | 'highlight'

export const MARKUP_TYPES: MarkupType[] = ['cloud', 'rectangle', 'ellipse', 'arrow', 'line', 'pen', 'text', 'highlight']

export const MARKUP_LABEL: Record<MarkupType, string> = {
  cloud: 'Cloud',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  arrow: 'Arrow',
  line: 'Line',
  pen: 'Pen',
  text: 'Text',
  highlight: 'Highlight',
}

/** Markup colours: strong on black-and-white plans. Yellow is for highlights. */
export const MARKUP_COLOURS = ['#e11d48', '#2563eb', '#16a34a', '#f97316', '#9333ea', '#111111', '#facc15']

/** Line weights in points on the paper. */
export const MARKUP_WIDTHS = [
  { label: 'Thin', pt: 1.5 },
  { label: 'Medium', pt: 3 },
  { label: 'Thick', pt: 6 },
]

/** Text sizes in points. */
export const TEXT_SIZES = [10, 14, 20, 28]

export interface Markup {
  id: string
  sheetId: string
  type: MarkupType
  /** two corners / two ends for shapes and lines; many for pen; one (top-left) for text */
  points: Point[]
  colour: string
  /** line weight in points */
  width: number
  text?: string
  /** text size in points */
  fontSize?: number
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Primitive =
  | {
      kind: 'path'
      /** one or more rings; closed rings can be filled (inner rings wound the other way are holes) */
      rings: Point[][]
      closed: boolean
      stroke?: string
      /** in points on the paper */
      strokeWidth?: number
      strokeOpacity?: number
      fill?: string
      fillOpacity?: number
      lineCap?: 'round' | 'butt'
    }
  | { kind: 'circle'; at: Point; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | {
      kind: 'text'
      /** top-left of the text block */
      at: Point
      lines: string[]
      fontSize: number
      colour: string
      /** box behind the text */
      box?: { fill: string; stroke: string; padding: number; width: number; height: number }
    }

/** Line height as a multiple of font size. */
export const LINE_HEIGHT = 1.2
/** Rough average character width for Helvetica/Arial, as a fraction of font size. */
const AVG_CHAR = 0.55

/** Size of a text block. `measure` gives a line's width in points (the PDF export passes the real font metric). */
export function textBlockSize(
  lines: string[],
  fontSize: number,
  measure: (line: string, size: number) => number = (l, sz) => l.length * sz * AVG_CHAR,
): { width: number; height: number } {
  const width = Math.max(fontSize, ...lines.map((l) => measure(l, fontSize)))
  return { width, height: lines.length * fontSize * LINE_HEIGHT }
}

/** Points round an ellipse inside the box a–b. */
export function ellipsePoints(a: Point, b: Point, segments = 72): Point[] {
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.abs(b.x - a.x) / 2
  const ry = Math.abs(b.y - a.y) / 2
  return Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * 2 * Math.PI
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }
  })
}

/**
 * A revision cloud round the box a–b: a ring of outward-bulging arcs about
 * `arc` points long, returned as one closed outline.
 */
export function cloudPoints(a: Point, b: Point, arc: number): Point[] {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  // clockwise on screen (y down), so "outward" is to the left of travel
  const corners = rectCorners({ x: minX, y: minY }, { x: maxX, y: maxY })
  const out: Point[] = []
  const STEPS = 8
  for (let e = 0; e < 4; e++) {
    const p = corners[e]
    const q = corners[(e + 1) % 4]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    const n = Math.max(1, Math.round(len / arc))
    const ux = (q.x - p.x) / len || 0
    const uy = (q.y - p.y) / len || 0
    // outward normal for clockwise travel with y down
    const nx = uy
    const ny = -ux
    for (let k = 0; k < n; k++) {
      const s0 = (k / n) * len
      const s1 = ((k + 1) / n) * len
      const r = (s1 - s0) / 2
      const cx = p.x + ux * (s0 + r)
      const cy = p.y + uy * (s0 + r)
      for (let j = 0; j < STEPS; j++) {
        const t = Math.PI * (j / STEPS) // 0..π along the semicircle
        out.push({ x: cx - ux * r * Math.cos(t) + nx * r * Math.sin(t), y: cy - uy * r * Math.cos(t) + ny * r * Math.sin(t) })
      }
    }
  }
  return out
}

/** The arrowhead triangle for a line from `from` to `to`. */
export function arrowHead(from: Point, to: Point, width: number): Point[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const ux = (to.x - from.x) / len
  const uy = (to.y - from.y) / len
  const head = Math.min(len * 0.6, 6 + width * 4)
  const half = head * 0.45
  const base = { x: to.x - ux * head, y: to.y - uy * head }
  return [to, { x: base.x - uy * half, y: base.y + ux * half }, { x: base.x + uy * half, y: base.y - ux * half }]
}

/** Measures a line of text in points at a given size. */
export type MeasureText = (line: string, size: number) => number

/**
 * How a markup is drawn. `measure` sizes text boxes with the real font
 * (the screen and the PDF export each pass their own).
 */
export function markupPrimitives(m: Markup, measure?: MeasureText): Primitive[] {
  const [a, b] = m.points
  const stroke = { stroke: m.colour, strokeWidth: m.width, lineCap: 'round' as const }
  switch (m.type) {
    case 'rectangle':
      return [{ kind: 'path', rings: [rectCorners(a, b)], closed: true, ...stroke }]
    case 'ellipse':
      return [{ kind: 'path', rings: [ellipsePoints(a, b)], closed: true, ...stroke }]
    case 'cloud':
      return [{ kind: 'path', rings: [cloudPoints(a, b, Math.max(14, m.width * 6))], closed: true, ...stroke }]
    case 'highlight':
      return [{ kind: 'path', rings: [rectCorners(a, b)], closed: true, fill: m.colour, fillOpacity: 0.35 }]
    case 'line':
      return [{ kind: 'path', rings: [[a, b]], closed: false, ...stroke }]
    case 'arrow': {
      const head = arrowHead(a, b, m.width)
      // stop the line inside the head so its round end doesn't poke through the tip
      const back = { x: (head[1].x + head[2].x) / 2, y: (head[1].y + head[2].y) / 2 }
      return [
        { kind: 'path', rings: [[a, back]], closed: false, ...stroke },
        { kind: 'path', rings: [head], closed: true, fill: m.colour, fillOpacity: 1 },
      ]
    }
    case 'pen':
      return [{ kind: 'path', rings: [m.points], closed: false, ...stroke }]
    case 'text': {
      const fontSize = m.fontSize ?? 14
      const lines = (m.text ?? '').split('\n')
      const size = textBlockSize(lines, fontSize, measure)
      const padding = fontSize * 0.35
      return [
        {
          kind: 'text',
          at: a,
          lines,
          fontSize,
          colour: m.colour,
          box: { fill: '#ffffff', stroke: m.colour, padding, width: size.width + padding * 2, height: size.height + padding * 2 },
        },
      ]
    }
  }
}

/** Corners / ends a user can drag to resize (pen and text just move). */
export function markupHandles(m: Markup): Point[] {
  return m.type === 'pen' || m.type === 'text' ? [] : m.points.slice(0, 2)
}

/** Bounding box of a text markup (for clicking on it). */
export function textBounds(m: Markup, measure?: MeasureText): { x: number; y: number; w: number; h: number } {
  const p = markupPrimitives(m, measure)[0]
  if (p.kind !== 'text' || !p.box) return { x: m.points[0].x, y: m.points[0].y, w: 0, h: 0 }
  return { x: p.at.x, y: p.at.y, w: p.box.width, h: p.box.height }
}

// ---------------------------------------------------------------------------
// Takeoffs as primitives (for the PDF export)
// ---------------------------------------------------------------------------

/** How a takeoff shape is drawn on an exported PDF (paper sizes in points). */
export function takeoffPrimitives(t: Takeoff, item: Item): Primitive[] {
  if (item.kind === 'count') {
    return [{ kind: 'circle', at: t.points[0], r: 5, fill: item.colour, stroke: '#ffffff', strokeWidth: 1 }]
  }
  if (item.kind === 'linear') {
    return [{ kind: 'path', rings: [t.points], closed: false, stroke: item.colour, strokeWidth: 2, strokeOpacity: 0.9, lineCap: 'round' }]
  }
  // area / perimeter: cut-outs wound opposite to the outline so the fill leaves them clear
  const clockwise = signedAreaPt2(t.points) > 0
  const holes = t.holes.map((h) => ((signedAreaPt2(h) > 0) === clockwise ? [...h].reverse() : h))
  return [
    {
      kind: 'path',
      rings: [t.points, ...holes],
      closed: true,
      stroke: item.colour,
      strokeWidth: 2,
      fill: item.kind === 'area' ? item.colour : undefined,
      fillOpacity: item.kind === 'area' ? 0.25 : undefined,
    },
  ]
}

/** Where to put a label for a takeoff shape. */
export function takeoffLabelPoint(t: Takeoff, item: Item): Point {
  return item.kind === 'area' || item.kind === 'perimeter' ? polygonCentroid(t.points) : t.points[0]
}
