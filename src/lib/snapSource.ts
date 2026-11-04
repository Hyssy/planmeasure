/**
 * Where snapping gets its linework from: the PDF's own lines (vector plans),
 * or small rendered image tiles (flattened plans).
 */
import * as pdfjs from 'pdfjs-dist'
import { getPage, renderPage, type SheetMeta } from './pdf'
import { cleanSegments, SegmentIndex, type Patch, type Segment } from './snap'

type Matrix = [number, number, number, number, number, number]

const multiply = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
]
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** A page with a picture on it and fewer real lines than this is flattened (image snapping). */
const MIN_VECTOR_SEGMENTS = 30
/** Stop collecting past this many (very dense drawings) to keep memory and speed sensible. */
const MAX_SEGMENTS = 400_000

const OPS = pdfjs.OPS as unknown as Record<string, number>
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 }

/**
 * Read every drawn line segment on a page, in page points (displayed page,
 * origin top-left). Curves are split into short straight pieces.
 */
export async function extractSegments(sheet: SheetMeta): Promise<{ segments: Segment[]; hasImage: boolean }> {
  const page = await getPage(sheet)
  const viewport = page.getViewport({ scale: 1 })
  const list = await page.getOperatorList()
  const toPage = viewport.transform as Matrix
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  const out: Segment[] = []
  let hasImage = false
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat])

  for (let i = 0; i < list.fnArray.length && out.length < MAX_SEGMENTS; i++) {
    const fn = list.fnArray[i]
    const args = list.argsArray[i] as unknown[]
    if (imageOps.has(fn)) hasImage = true
    else if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix)
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm)
      const m = args[0] as Matrix | null
      if (m) ctm = multiply(ctm, m)
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (fn === OPS.constructPath) {
      const [paintOp, data] = args as [number, ArrayLike<number>[] | undefined]
      if (paintOp === OPS.endPath) continue // clipping outline only, not drawn
      const path = data?.[0]
      if (path) decodePath(path, multiply(toPage, ctm), out)
    }
  }
  return { segments: out, hasImage }
}

function decodePath(d: ArrayLike<number>, m: Matrix, out: Segment[]): void {
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  const line = (x: number, y: number) => {
    const [ax, ay] = apply(m, cx, cy)
    const [bx, by] = apply(m, x, y)
    out.push([ax, ay, bx, by])
    cx = x
    cy = y
  }
  for (let i = 0; i < d.length; ) {
    switch (d[i++]) {
      case DRAW.moveTo:
        cx = sx = d[i++]
        cy = sy = d[i++]
        break
      case DRAW.lineTo:
        line(d[i++], d[i++])
        break
      case DRAW.curveTo: {
        const [x1, y1, x2, y2, x3, y3] = [d[i++], d[i++], d[i++], d[i++], d[i++], d[i++]]
        const [x0, y0] = [cx, cy]
        for (let k = 1; k <= 6; k++) {
          const t = k / 6
          const u = 1 - t
          line(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3)
        }
        break
      }
      case DRAW.quadraticCurveTo: {
        const [x1, y1, x2, y2] = [d[i++], d[i++], d[i++], d[i++]]
        const [x0, y0] = [cx, cy]
        for (let k = 1; k <= 4; k++) {
          const t = k / 4
          const u = 1 - t
          line(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2)
        }
        break
      }
      case DRAW.closePath:
        if (cx !== sx || cy !== sy) line(sx, sy)
        break
      default:
        return // unknown operator: stop reading this path
    }
  }
}

export type SnapSource = { kind: 'vector'; index: SegmentIndex } | { kind: 'image' }

const sources = new Map<string, Promise<SnapSource>>()

/** The snapping source for a sheet: its linework, or "image" for flattened sheets. Cached. */
export function getSnapSource(sheet: SheetMeta): Promise<SnapSource> {
  let s = sources.get(sheet.id)
  if (!s) {
    s = extractSegments(sheet)
      .then(({ segments: raw, hasImage }) => {
        const segments = cleanSegments(raw)
        // Flattened: the drawing is a picture, with little or no real linework.
        const flattened = hasImage && segments.length < MIN_VECTOR_SEGMENTS
        return flattened ? ({ kind: 'image' } as const) : ({ kind: 'vector', index: new SegmentIndex(segments) } as const)
      })
      .catch((err) => {
        console.error('Reading linework for snapping failed', sheet.id, err)
        return { kind: 'image' } as const
      })
    sources.set(sheet.id, s)
  }
  return s
}

// ---------------------------------------------------------------------------
// Image tiles for flattened plans
// ---------------------------------------------------------------------------

/** Tiles are 96 pt square, every 48 pt, so the cursor is always ≥ 24 pt from a tile's edge. */
const TILE = 96
const STEP = 48
const PX_PER_PT = 4
const tiles = new Map<string, Patch | 'loading'>()
let queue: Promise<void> = Promise.resolve()

function tileKey(sheetId: string, tx: number, ty: number) {
  return `${sheetId}|${tx}|${ty}`
}

/** The tile best centred on p: ready now, or null (and it starts rendering; call again shortly). */
export function imageTileAt(sheet: SheetMeta, p: { x: number; y: number }, onReady: () => void): Patch | null {
  const tx = Math.round((p.x - TILE / 2) / STEP)
  const ty = Math.round((p.y - TILE / 2) / STEP)
  const k = tileKey(sheet.id, tx, ty)
  const t = tiles.get(k)
  if (t && t !== 'loading') {
    // warm up the tiles around it, so moving on is instant
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = tileKey(sheet.id, tx + dx, ty + dy)
      if (!tiles.has(n)) imageTileAt(sheet, { x: (tx + dx) * STEP + TILE / 2, y: (ty + dy) * STEP + TILE / 2 }, () => {})
    }
    return t
  }
  if (!t) {
    tiles.set(k, 'loading')
    // one render at a time, so a fast-moving cursor doesn't queue up dozens
    queue = queue.then(async () => {
      try {
        const x = tx * STEP
        const y = ty * STEP
        const canvas = document.createElement('canvas')
        canvas.width = TILE * PX_PER_PT
        canvas.height = TILE * PX_PER_PT
        await renderPage(sheet, canvas, PX_PER_PT, -x * PX_PER_PT, -y * PX_PER_PT).promise
        const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        const grey = new Uint8Array(canvas.width * canvas.height)
        for (let i = 0; i < grey.length; i++) grey[i] = (img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11) | 0
        tiles.set(k, { x, y, scale: PX_PER_PT, width: canvas.width, height: canvas.height, grey })
        // keep memory in check: forget the oldest tiles
        while (tiles.size > 300) tiles.delete(tiles.keys().next().value!)
        onReady()
      } catch (err) {
        console.error('Snap tile failed', err)
        tiles.delete(k)
      }
    })
  }
  return null
}
