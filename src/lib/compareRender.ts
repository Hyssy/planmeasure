/**
 * Rendering sheets for comparing, and lining two versions up (browser only).
 */
import { bestAlignment, refineSubpixel, type Grey } from './compare'
import { transformFromAlignment, type PageTransform } from './moveVersion'
import { renderPage, type SheetMeta } from './pdf'

/** Rendered size of the longer side when comparing (pixels). About 0.4 mm per pixel on an A1 sheet. */
export const COMPARE_PX = 2000

/** Render a sheet to a canvas `width` pixels wide (height follows `heightPx` so both versions match). */
export async function renderTo(sheet: SheetMeta, width: number, heightPx: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, heightPx)
  const s = width / sheet.widthPt
  const tmp = document.createElement('canvas')
  tmp.width = width
  tmp.height = Math.round(sheet.heightPt * s)
  await renderPage(sheet, tmp, s).promise
  ctx.drawImage(tmp, 0, 0)
  return canvas
}

export function toGrey(c: HTMLCanvasElement): Grey {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  const g = new Uint8Array(c.width * c.height)
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0
  return { width: c.width, height: c.height, data: g }
}


/** The rendered size both versions use: the new sheet's shape, COMPARE_PX on its long side. */
export function compareSize(newSheet: SheetMeta): { w: number; h: number } {
  const longPt = Math.max(newSheet.widthPt, newSheet.heightPt)
  return { w: Math.round((newSheet.widthPt / longPt) * COMPARE_PX), h: Math.round((newSheet.heightPt / longPt) * COMPARE_PX) }
}

/**
 * How to move shapes from the old version's page onto the new one: render both,
 * find the shift that lines the drawings up, and turn it into page points.
 */
export async function alignVersions(oldSheet: SheetMeta, newSheet: SheetMeta): Promise<PageTransform> {
  const { w, h } = compareSize(newSheet)
  const [nc, oc] = await Promise.all([renderTo(newSheet, w, h), renderTo(oldSheet, w, h)])
  const og = toGrey(oc)
  const ng = toGrey(nc)
  const { dx, dy } = refineSubpixel(og, ng, bestAlignment(og, ng))
  return transformFromAlignment(oldSheet.widthPt, newSheet.widthPt, w, dx, dy)
}
