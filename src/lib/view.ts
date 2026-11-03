/**
 * The viewer's camera. A point on the page at (xPt, yPt) — in PDF points,
 * measured from the page's top-left — appears on screen at
 *   (x + xPt * scale, y + yPt * scale)   in CSS pixels.
 * `scale` is CSS pixels per PDF point.
 */
export interface View {
  scale: number
  x: number
  y: number
}

export const MIN_SCALE = 0.02
export const MAX_SCALE = 40

/** Screen pixels per point at "100%" (true print size on a 96 dpi screen). */
export const ACTUAL_SIZE_SCALE = 96 / 72

export function fitView(
  pageW: number,
  pageH: number,
  boxW: number,
  boxH: number,
  margin = 24,
): View {
  const scale = Math.max(
    MIN_SCALE,
    Math.min((boxW - margin * 2) / pageW, (boxH - margin * 2) / pageH),
  )
  return {
    scale,
    x: (boxW - pageW * scale) / 2,
    y: (boxH - pageH * scale) / 2,
  }
}

/** Zoom by `factor`, keeping the screen point (cx, cy) fixed under the cursor. */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor))
  const k = scale / view.scale
  return { scale, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }
}

export function screenToPage(view: View, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }
}
