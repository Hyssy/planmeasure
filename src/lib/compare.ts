/**
 * Comparing two revisions of a sheet, from rendered images.
 *
 * Both sheets are rendered to the same size in greyscale. Ink (dark pixels)
 * present in the new version but not the old is "added"; in the old but not
 * the new is "removed". A pixel of tolerance stops anti-aliasing and tiny
 * shifts showing as changes. Changed pixels are grouped into boxes, so a user
 * sees "7 changes" rather than a speckle of pixels.
 */

/** A greyscale image: 0 = black, 255 = white. */
export interface Grey {
  width: number
  height: number
  data: Uint8Array
}

export interface ChangeBox {
  /** pixel box in the compared images */
  x: number
  y: number
  w: number
  h: number
  added: number
  removed: number
}

const INK = 160

/** Ink mask: 1 where the pixel is dark. */
export function inkMask(g: Grey): Uint8Array {
  const m = new Uint8Array(g.width * g.height)
  for (let i = 0; i < m.length; i++) m[i] = g.data[i] < INK ? 1 : 0
  return m
}

/** Grow a mask by `r` pixels (square), so near-misses count as the same line. */
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m.slice()
  // separable: horizontal pass, then vertical
  const tmp = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) {
    let count = 0
    for (let x = -r; x < w; x++) {
      const inX = x + r
      if (inX < w && m[y * w + inX]) count++
      const outX = x - r - 1
      if (outX >= 0 && m[y * w + outX]) count--
      if (x >= 0) tmp[y * w + x] = count > 0 ? 1 : 0
    }
  }
  const out = new Uint8Array(m.length)
  for (let x = 0; x < w; x++) {
    let count = 0
    for (let y = -r; y < h; y++) {
      const inY = y + r
      if (inY < h && tmp[inY * w + x]) count++
      const outY = y - r - 1
      if (outY >= 0 && tmp[outY * w + x]) count--
      if (y >= 0) out[y * w + x] = count > 0 ? 1 : 0
    }
  }
  return out
}

/** Shift a mask by (dx, dy) pixels (new position = old + d). */
function shifted(m: Uint8Array, w: number, h: number, dx: number, dy: number): Uint8Array {
  if (!dx && !dy) return m
  const out = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= h) continue
    for (let x = 0; x < w; x++) {
      const sx = x - dx
      if (sx >= 0 && sx < w) out[y * w + x] = m[sy * w + sx]
    }
  }
  return out
}

/**
 * The shift (in pixels) that best lines the old sheet up with the new one —
 * revisions are often nudged on the page. Searches ±max pixels on a reduced
 * copy, then refines at full size.
 */
export function bestAlignment(oldG: Grey, newG: Grey, max = 24): { dx: number; dy: number } {
  const { width: w, height: h } = newG
  const a = inkMask(oldG)
  const b = inkMask(newG)
  const f = 4
  const sw = Math.floor(w / f)
  const sh = Math.floor(h / f)
  const small = (m: Uint8Array) => {
    const out = new Uint8Array(sw * sh)
    for (let y = 0; y < sh * f; y++) for (let x = 0; x < sw * f; x++) if (m[y * w + x]) out[Math.floor(y / f) * sw + Math.floor(x / f)] = 1
    return out
  }
  const as = small(a)
  const bs = small(b)
  const score = (am: Uint8Array, bm: Uint8Array, ww: number, hh: number, dx: number, dy: number) => {
    let s = 0
    for (let y = Math.max(0, dy); y < Math.min(hh, hh + dy); y++) {
      for (let x = Math.max(0, dx); x < Math.min(ww, ww + dx); x++) if (bm[y * ww + x] && am[(y - dy) * ww + (x - dx)]) s++
    }
    return s
  }
  let best = { dx: 0, dy: 0, s: score(as, bs, sw, sh, 0, 0) }
  const m = Math.ceil(max / f)
  for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) {
    const s = score(as, bs, sw, sh, dx, dy)
    if (s > best.s) best = { dx, dy, s }
  }
  // refine around the coarse answer at full resolution
  let fine = { dx: best.dx * f, dy: best.dy * f, s: score(a, b, w, h, best.dx * f, best.dy * f) }
  for (let dy = best.dy * f - 3; dy <= best.dy * f + 3; dy++) for (let dx = best.dx * f - 3; dx <= best.dx * f + 3; dx++) {
    const s = score(a, b, w, h, dx, dy)
    if (s > fine.s) fine = { dx, dy, s }
  }
  return { dx: fine.dx, dy: fine.dy }
}

export interface Comparison {
  width: number
  height: number
  /** 1 = added in the new version */
  added: Uint8Array
  /** 1 = removed from the old version */
  removed: Uint8Array
  /** 1 = ink in both (unchanged) */
  same: Uint8Array
  boxes: ChangeBox[]
  /** how the old version was shifted to line up */
  offset: { dx: number; dy: number }
}

/**
 * Compare two same-sized renders. `tolerance` (pixels) ignores near-misses;
 * changes closer than `gap` pixels join one box; boxes with fewer than
 * `minPixels` changed pixels are dropped (specks).
 */
export function compareSheets(
  oldG: Grey,
  newG: Grey,
  opts: { tolerance?: number; gap?: number; minPixels?: number; align?: boolean } = {},
): Comparison {
  const { width: w, height: h } = newG
  const tolerance = opts.tolerance ?? 1
  const gap = opts.gap ?? 24
  const minPixels = opts.minPixels ?? 12
  const offset = opts.align === false ? { dx: 0, dy: 0 } : bestAlignment(oldG, newG)
  const a = shifted(inkMask(oldG), w, h, offset.dx, offset.dy)
  const b = inkMask(newG)
  const aWide = dilate(a, w, h, tolerance)
  const bWide = dilate(b, w, h, tolerance)
  const added = new Uint8Array(w * h)
  const removed = new Uint8Array(w * h)
  const same = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (b[i] && !aWide[i]) added[i] = 1
    else if (a[i] && !bWide[i]) removed[i] = 1
    else if (a[i] || b[i]) same[i] = 1
  }
  return { width: w, height: h, added, removed, same, boxes: changeBoxes(added, removed, w, h, gap, minPixels), offset }
}

/** Group changed pixels into boxes: cells of the grid, joined when within `gap`. */
export function changeBoxes(added: Uint8Array, removed: Uint8Array, w: number, h: number, gap: number, minPixels: number): ChangeBox[] {
  const cell = Math.max(4, Math.round(gap / 2))
  const cw = Math.ceil(w / cell)
  const ch = Math.ceil(h / cell)
  const addC = new Int32Array(cw * ch)
  const remC = new Int32Array(cw * ch)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const c = Math.floor(y / cell) * cw + Math.floor(x / cell)
      if (added[i]) addC[c]++
      else if (removed[i]) remC[c]++
    }
  }
  // flood-fill neighbouring busy cells (8-connected, plus one empty cell of slack) into groups
  const seen = new Uint8Array(cw * ch)
  const boxes: ChangeBox[] = []
  const busy = (c: number) => addC[c] + remC[c] > 0
  for (let start = 0; start < cw * ch; start++) {
    if (seen[start] || !busy(start)) continue
    const stack = [start]
    seen[start] = 1
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, ad = 0, re = 0
    while (stack.length) {
      const c = stack.pop()!
      const cx = c % cw
      const cy = (c - cx) / cw
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy)
      ad += addC[c]; re += remC[c]
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
        const n = ny * cw + nx
        if (!seen[n] && busy(n)) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    if (ad + re < minPixels) continue
    boxes.push({ x: x0 * cell, y: y0 * cell, w: Math.min(w, (x1 + 1) * cell) - x0 * cell, h: Math.min(h, (y1 + 1) * cell) - y0 * cell, added: ad, removed: re })
  }
  // biggest changes first
  return boxes.sort((p, q) => q.added + q.removed - (p.added + p.removed))
}

/**
 * Pair sheets between two sets by sheet number, then by position for the rest.
 * Returns, for each sheet in `base`, the index of its match in `other` (or -1).
 */
export function pairSheets(base: (string | undefined)[], other: (string | undefined)[]): number[] {
  const norm = (s?: string) => (s ?? '').trim().toUpperCase().replace(/\s+/g, '')
  const used = new Set<number>()
  const out = base.map((num) => {
    if (!norm(num)) return -1
    const j = other.findIndex((o, k) => !used.has(k) && norm(o) === norm(num))
    if (j >= 0) used.add(j)
    return j
  })
  // unnumbered or unmatched sheets: pair in order with what's left
  const left = other.map((_, k) => k).filter((k) => !used.has(k))
  return out.map((j) => (j >= 0 ? j : (left.shift() ?? -1)))
}

/**
 * Refine a whole-pixel alignment to a fraction of a pixel: how well the inks
 * overlap is measured one pixel either side, and a parabola through the three
 * scores gives the peak. Used when moving takeoffs, where position matters.
 */
export function refineSubpixel(oldG: Grey, newG: Grey, at: { dx: number; dy: number }): { dx: number; dy: number } {
  const { width: w, height: h } = newG
  // soft ink (darkness 0..1) gives a smoother peak than on/off ink
  const dark = (g: Grey) => {
    const out = new Float32Array(g.width * g.height)
    for (let i = 0; i < out.length; i++) out[i] = (255 - g.data[i]) / 255
    return out
  }
  const a = dark(oldG)
  const b = dark(newG)
  const score = (dx: number, dy: number) => {
    let s = 0
    for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y++) {
      const row = y * w
      const orow = (y - dy) * w - dx
      for (let x = Math.max(0, dx); x < Math.min(w, w + dx); x++) s += b[row + x] * a[orow + x]
    }
    return s
  }
  const peak = (m: number, c: number, p: number) => {
    const d = m - 2 * c + p
    return d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / d)) : 0
  }
  const c = score(at.dx, at.dy)
  return {
    dx: at.dx + peak(score(at.dx - 1, at.dy), c, score(at.dx + 1, at.dy)),
    dy: at.dy + peak(score(at.dx, at.dy - 1), c, score(at.dx, at.dy + 1)),
  }
}
