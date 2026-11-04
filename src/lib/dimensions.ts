/**
 * Dimension display: the length of each segment shown either on the line, or
 * Revit-style beside it — a parallel dimension line with extension lines,
 * angled ticks and the figure above it.
 *
 * Output is drawing primitives in page points, so the screen and the PDF
 * export draw the same thing. Sizes are passed in page points: the screen
 * converts "pixels" to points at the current zoom; the export uses paper sizes.
 */
import { polygonCentroid } from './geometry'
import { LINE_HEIGHT, textBlockSize, type MeasureText, type Primitive } from './markup'
import { formatLength, type Point } from './scale'

export type DimensionStyle = 'on' | 'offset'
export type DimensionUnits = 'm' | 'mm'

export interface DimensionLook {
  style: DimensionStyle
  units: DimensionUnits
  /** text height, page points */
  textSize: number
  /** distance from the measured line to the dimension line, page points */
  offset: number
  /** extension line overshoot and tick size, page points */
  tick: number
  /** line width, page points */
  lineWidth: number
  colour: string
}

/** "3.60 m" or "3600" (mm, no unit, as on drawings). */
export function formatDimension(mm: number, units: DimensionUnits): string {
  return units === 'mm' ? `${Math.round(mm)}` : formatLength(mm)
}

/**
 * Angle of a→b in degrees, turned so text along it is never upside down.
 * Vertical text reads bottom to top (from the right-hand side of the sheet),
 * as on drawings: the result is from -90 up to (not including) 90.
 */
export function readableAngle(a: Point, b: Point): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (deg >= 90 - 1e-9) deg -= 180
  if (deg < -90 - 1e-9) deg += 180
  return deg
}

/**
 * Which side to put a dimension on: +1 or -1 times the left-hand normal of a→b.
 * For a closed shape, the side facing away from its centre; for an open line,
 * "above" (screen up), or "left" for vertical lines. `flip` swaps it.
 */
export function dimensionSide(a: Point, b: Point, centre: Point | null, flip = false): 1 | -1 {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const nx = dy // left-hand normal in screen coordinates (y down)
  const ny = -dx
  let side: 1 | -1
  if (centre) {
    const mx = (a.x + b.x) / 2 - centre.x
    const my = (a.y + b.y) / 2 - centre.y
    side = nx * mx + ny * my >= 0 ? 1 : -1
  } else {
    // prefer up (negative y); for (near) vertical lines prefer left (negative x)
    side = Math.abs(ny) > 1e-9 ? (ny < 0 ? 1 : -1) : nx < 0 ? 1 : -1
  }
  return (flip ? -side : side) as 1 | -1
}

/** Dimension primitives for one segment a→b. */
export function segmentDimension(
  a: Point,
  b: Point,
  realMmPerPt: number | null,
  look: DimensionLook,
  side: 1 | -1,
  measure?: MeasureText,
): Primitive[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 1e-6) return []
  const text = realMmPerPt === null ? 'no scale' : formatDimension(len * realMmPerPt, look.units)
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const nx = uy * side // unit normal to the chosen side
  const ny = -ux * side
  const angle = readableAngle(a, b)
  const size = textBlockSize([text], look.textSize, measure)
  const out: Primitive[] = []

  if (look.style === 'on') {
    // figure in a solid box centred on the line
    const pad = look.textSize * 0.35
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    out.push(textCentred(mid, text, look, angle, size, pad, '#1f1f1f', '#ffffff'))
    return out
  }

  // offset: extension lines, dimension line, ticks, figure above the line
  const o = look.offset
  const a2 = { x: a.x + nx * o, y: a.y + ny * o }
  const b2 = { x: b.x + nx * o, y: b.y + ny * o }
  const gap = look.tick * 0.6 // small gap between the measured line and the extension line
  const over = look.tick // extension lines run a little past the dimension line
  const ext = (p: Point) => [
    { x: p.x + nx * gap, y: p.y + ny * gap },
    { x: p.x + nx * (o + over), y: p.y + ny * (o + over) },
  ]
  const stroke = { stroke: look.colour, strokeWidth: look.lineWidth, lineCap: 'butt' as const }
  out.push({ kind: 'path', rings: [ext(a), ext(b)], closed: false, ...stroke })
  out.push({ kind: 'path', rings: [[a2, b2]], closed: false, ...stroke })
  // architectural ticks: short 45° strokes through each end of the dimension line
  const t = look.tick
  const tx = (ux + nx) * (t / Math.SQRT2)
  const ty = (uy + ny) * (t / Math.SQRT2)
  const tick = (p: Point) => [{ x: p.x - tx, y: p.y - ty }, { x: p.x + tx, y: p.y + ty }]
  out.push({ kind: 'path', rings: [tick(a2), tick(b2)], closed: false, stroke: look.colour, strokeWidth: look.lineWidth * 2, lineCap: 'butt' })
  // figure: centred along the dimension line, on its far side from the shape
  const lift = look.textSize * 0.25 + size.height / 2
  const mid = { x: (a2.x + b2.x) / 2 + nx * lift, y: (a2.y + b2.y) / 2 + ny * lift }
  out.push(textCentred(mid, text, look, angle, size, look.textSize * 0.15, look.colour, '#ffffff'))
  return out
}

/** A text block centred on `c`, turned to `angle`. */
function textCentred(
  c: Point,
  text: string,
  look: DimensionLook,
  angle: number,
  size: { width: number; height: number },
  pad: number,
  textColour: string,
  boxColour: string,
): Primitive {
  const w = size.width + pad * 2
  const h = size.height + pad * 2
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // top-left corner such that the turned box is centred on c
  const at = { x: c.x - (w / 2) * cos + (h / 2) * sin, y: c.y - (w / 2) * sin - (h / 2) * cos }
  const onLine = look.style === 'on'
  return {
    kind: 'text',
    at,
    lines: [text],
    fontSize: look.textSize,
    colour: onLine ? boxColour : textColour,
    angle,
    bold: true,
    box: {
      fill: onLine ? textColour : boxColour,
      stroke: onLine ? textColour : boxColour,
      padding: pad,
      width: w,
      height: h,
    },
  }
}

/** Dimensions for every segment of a shape (closed shapes include the closing edge). */
export function shapeDimensions(
  points: Point[],
  closed: boolean,
  realMmPerPt: number | null,
  look: DimensionLook,
  flip: boolean,
  measure?: MeasureText,
  /** segments shorter than this (page points) aren't labelled — too small to read (freehand pieces) */
  minLength = 0,
): Primitive[] {
  if (points.length < 2) return []
  const centre = closed && points.length >= 3 ? polygonCentroid(points) : null
  const out: Primitive[] = []
  const n = closed ? points.length : points.length - 1
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (Math.hypot(b.x - a.x, b.y - a.y) < minLength) continue
    out.push(...segmentDimension(a, b, realMmPerPt, look, dimensionSide(a, b, centre, flip), measure))
  }
  return out
}

/** Line height used by the text block (re-exported for drawing code). */
export const DIM_LINE_HEIGHT = LINE_HEIGHT
