import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isSuperseded, latestVersion, versionNumber } from '../lib/versions'
import { renderPage, type RenderHandle, type SheetMeta } from '../lib/pdf'
import { distancePt, equivalentRatio, formatLength, formatRatio, mmPerPtFromRatio, realMm, type Point } from '../lib/scale'
import { describePaperSize } from '../lib/units'
import { ACTUAL_SIZE_SCALE, fitView, screenToPage, zoomAt, type View } from '../lib/view'
import { distanceToPolyline, pointInPolygon, polygonAreaPt2, rectCorners, simplifyPath } from '../lib/geometry'
import { formatQuantity, ITEM_COLOURS, KIND_LABEL, takeoffQuantity, type Takeoff, type TakeoffKind } from '../lib/takeoff'
import { isFocused, usePanels } from '../panels'
import { regionFor } from '../lib/scaleRegions'
import RegionBoxes, { RegionScaleDialog } from './RegionBoxes'
import { findImageSnap, findSnap, SegmentIndex, SNAP_LABEL, type Segment, type Snap } from '../lib/snap'
import { getSnapSource, imageTileAt, type SnapSource } from '../lib/snapSource'
import SnapMarkerLayer from './SnapMarker'
import { isTakeoffTool, scaleForPoints, useApp, type DrawStyle } from '../store'
import TakeoffLayer, { type TakeoffDraft } from './TakeoffLayer'
import MarkupLayer, { PrimitivesShape } from './MarkupLayer'
import { shapeDimensions } from '../lib/dimensions'
import { screenLook } from '../lib/dimensionLooks'
import AreaBoxes from './AreaBoxes'
import { areaFromPoints, FIELD_LABEL } from '../lib/labelAreas'
import { measureScreenText } from '../lib/measureText'
import { markupHandles, markupPrimitives, type Markup, type MarkupType } from '../lib/markup'
import CalibrateDialog from './CalibrateDialog'
import MeasureOverlay, { type OverlayLine } from './MeasureOverlay'

/** Longest side (device px) of the low-res base image shown while zooming/panning. */
const BASE_MAX_PX = 3000
/** Wait this long after the last zoom/pan before redrawing the sharp layer. */
const DETAIL_DELAY_MS = 120

interface Props {
  sheet: SheetMeta
}

/**
 * Shows one sheet with smooth zoom and pan.
 *
 * Two layers:
 *  - base: the whole page, rendered once at moderate resolution and scaled with CSS,
 *    so zoom/pan responds instantly;
 *  - detail: only the visible part of the page, rendered sharp at the current zoom,
 *    re-rendered shortly after movement stops.
 */
export default function PlanViewer({ sheet }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const detailHostRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<View | null>(null)
  const viewRef = useRef<View | null>(null)
  useLayoutEffect(() => {
    viewRef.current = view
  }, [view])

  // Remember each sheet's zoom/pan so switching sheets and back keeps your place.
  const savedViews = useRef(new Map<string, View>())

  const [baseScale, setBaseScale] = useState(1)
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 })
  // What view the current detail canvas was rendered for (and where it sits).
  const detailInfo = useRef<{ view: View; left: number; top: number } | null>(null)

  const getBoxSize = () => {
    const el = boxRef.current
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 }
  }

  const fit = useCallback(() => {
    const { w, h } = getBoxSize()
    if (w && h) setView(fitView(sheet.widthPt, sheet.heightPt, w, h))
  }, [sheet])

  // ---- When the sheet changes: restore or fit view, render base layer ----
  useLayoutEffect(() => {
    detailInfo.current = null
    detailHostRef.current?.replaceChildren()
    const saved = savedViews.current.get(sheet.id)
    if (saved) setView(saved)
    else fit()
    const views = savedViews.current
    return () => {
      // Leaving this sheet: remember where we were.
      if (viewRef.current) views.set(sheet.id, viewRef.current)
    }
  }, [sheet, fit])

  useEffect(() => {
    const canvas = baseRef.current
    if (!canvas) return
    const scale = BASE_MAX_PX / Math.max(sheet.widthPt, sheet.heightPt)
    // Render to an offscreen canvas first so the old sheet doesn't flash.
    const off = document.createElement('canvas')
    off.width = Math.round(sheet.widthPt * scale)
    off.height = Math.round(sheet.heightPt * scale)
    const handle = renderPage(sheet, off, scale)
    handle.promise
      .then(() => {
        canvas.width = off.width
        canvas.height = off.height
        canvas.getContext('2d')?.drawImage(off, 0, 0)
        setBaseScale(scale)
      })
      .catch((err) => console.error('Base render failed', err))
    return () => handle.cancel()
  }, [sheet])

  // ---- Apply the view to both layers (cheap CSS transforms) ----
  useLayoutEffect(() => {
    if (!view) return
    const base = baseRef.current
    if (base) {
      base.style.width = `${sheet.widthPt * baseScale}px`
      base.style.height = `${sheet.heightPt * baseScale}px`
      base.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale / baseScale})`
    }
    const host = detailHostRef.current
    const info = detailInfo.current
    if (host && info) {
      // Move/scale the last sharp render to line up with the current view.
      const k = view.scale / info.view.scale
      const tx = (info.left - info.view.x) * k + view.x
      const ty = (info.top - info.view.y) * k + view.y
      host.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`
    }
  }, [view, baseScale, sheet])

  // ---- Re-render the sharp detail layer after movement settles ----
  useEffect(() => {
    if (!view) return
    let handle: RenderHandle | null = null
    const timer = window.setTimeout(() => {
      const { w, h } = getBoxSize()
      const dpr = window.devicePixelRatio || 1
      // Visible part of the page, in screen CSS px.
      const left = Math.max(0, Math.floor(view.x))
      const top = Math.max(0, Math.floor(view.y))
      const right = Math.min(w, Math.ceil(view.x + sheet.widthPt * view.scale))
      const bottom = Math.min(h, Math.ceil(view.y + sheet.heightPt * view.scale))
      if (right <= left || bottom <= top) return

      const canvas = document.createElement('canvas')
      canvas.width = Math.round((right - left) * dpr)
      canvas.height = Math.round((bottom - top) * dpr)
      canvas.style.width = `${right - left}px`
      canvas.style.height = `${bottom - top}px`
      canvas.style.display = 'block'
      handle = renderPage(
        sheet,
        canvas,
        view.scale * dpr,
        (view.x - left) * dpr,
        (view.y - top) * dpr,
      )
      handle.promise
        .then(() => {
          const host = detailHostRef.current
          if (!host || viewRef.current !== view) return
          detailInfo.current = { view, left, top }
          host.style.transform = `translate(${left}px, ${top}px)`
          host.replaceChildren(canvas)
        })
        .catch((err) => console.error('Detail render failed', err))
    }, DETAIL_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      handle?.cancel()
    }
  }, [view, sheet])

  // Re-fit/re-render when the window or panels resize.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    let last = { w: el.clientWidth, h: el.clientHeight }
    const ro = new ResizeObserver(() => {
      const size = { w: el.clientWidth, h: el.clientHeight }
      setBoxSize(size)
      const v = viewRef.current
      // Panels opening or closing: shift by half the change so the plan stays centred.
      if (v) setView({ ...v, x: v.x + (size.w - last.w) / 2, y: v.y + (size.h - last.h) / 2 })
      last = size
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- Mouse wheel / trackpad zoom ----
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (!v) return
      const rect = el.getBoundingClientRect()
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16 // lines → pixels
      if (e.deltaMode === 2) dy *= rect.height // pages → pixels
      // Trackpad pinch arrives as ctrl+wheel with small deltas; make it more sensitive.
      const sensitivity = e.ctrlKey ? 0.01 : 0.0015
      const factor = Math.exp(-dy * sensitivity)
      setView(zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- Tools ----
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const scale = useApp((s) => s.scales[sheet.id])
  const label = useApp((s) => s.labels[sheet.id])
  const setCalibratedScale = useApp((s) => s.setCalibratedScale)
  const items = useApp((s) => s.items)
  const allTakeoffs = useApp((s) => s.takeoffs)
  const activeItemId = useApp((s) => s.activeItemId)
  const selectedId = useApp((s) => s.selectedTakeoffId)
  const addTakeoff = useApp((s) => s.addTakeoff)
  const deleteTakeoff = useApp((s) => s.deleteTakeoff)
  const selectTakeoff = useApp((s) => s.selectTakeoff)
  const updateTakeoff = useApp((s) => s.updateTakeoff)
  const checkpoint = useApp((s) => s.checkpoint)
  const cutoutFor = useApp((s) => s.cutoutFor)
  const drawStyles = useApp((s) => s.drawStyles)
  const allMarkups = useApp((s) => s.markups)
  const selectedMarkupId = useApp((s) => s.selectedMarkupId)
  const markupOptions = useApp((s) => s.markupOptions)
  const addMarkup = useApp((s) => s.addMarkup)
  const updateMarkup = useApp((s) => s.updateMarkup)
  const deleteMarkup = useApp((s) => s.deleteMarkup)
  const selectMarkup = useApp((s) => s.selectMarkup)
  const showTakeoffs = useApp((s) => s.showTakeoffs)
  const scaleBarOpen = usePanels((s) => s.open.scaleBar)
  const labelAreas = useApp((s) => s.labelAreas)
  const areaField = useApp((s) => s.areaField)
  const setLabelArea = useApp((s) => s.setLabelArea)
  const showMarkups = useApp((s) => s.showMarkups)
  const markups = useMemo(() => allMarkups.filter((m) => m.sheetId === sheet.id), [allMarkups, sheet.id])
  /** Text markup being typed: a new one at `at`, or an existing one (`id`). */
  const [textEdit, setTextEdit] = useState<{ id?: string; at: Point; text: string } | null>(null)
  const addCutout = useApp((s) => s.addCutout)
  const cancelCutout = useApp((s) => s.cancelCutout)
  const [notice, setNotice] = useState<string | null>(null)

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const takeoffs = useMemo(() => allTakeoffs.filter((t) => t.sheetId === sheet.id), [allTakeoffs, sheet.id])
  const activeItem = itemsById.get(activeItemId ?? '')
  const drawItem = isTakeoffTool(tool) && activeItem?.kind === tool ? activeItem : undefined
  const scaleRegions = useApp((s) => s.scaleRegions)
  const regionsHere = useMemo(() => scaleRegions.filter((r) => r.sheetId === sheet.id), [scaleRegions, sheet.id])
  const pendingRegion = useApp((s) => s.pendingRegion)
  const setPendingRegion = useApp((s) => s.setPendingRegion)
  const addScaleRegion = useApp((s) => s.addScaleRegion)
  const updateScaleRegion = useApp((s) => s.updateScaleRegion)
  /** The scale for these points: their scale area, else the sheet's; 'mixed' if they cross an area's edge. */
  const scaleAt = (pts: Point[]) => scaleForPoints({ scales: { [sheet.id]: scale }, scaleRegions: regionsHere }, sheet.id, pts)
  /** A new scale area waiting for its scale (box drawn, dialog open). */
  const [newRegion, setNewRegion] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const MIXED_NOTICE = 'That shape crosses the edge of a scale area, so it would mix two scales. Draw it inside the area, or as separate shapes.'

  /** Points placed so far for the shape or line being drawn. */
  const [draft, setDraft] = useState<Point[]>([])
  /** Where the cursor is on the page (for the rubber-band line). */
  const [cursor, setCursor] = useState<Point | null>(null)
  /** Last finished measurement, kept on screen until the next one. */
  const [measured, setMeasured] = useState<Point[] | null>(null)
  /** A finished calibration line waiting for the user to type its length. */
  const [calibLine, setCalibLine] = useState<[Point, Point] | null>(null)

  const resetDrawing = useCallback(() => {
    setDraft([])
    setCursor(null)
    setMeasured(null)
    setCalibLine(null)
  }, [setDraft, setCursor, setMeasured, setCalibLine])

  // Clear in-progress drawing when the sheet or tool changes.
  const drawingKey = `${sheet.id}|${tool}|${cutoutFor}`
  const [lastDrawingKey, setLastDrawingKey] = useState(drawingKey)
  if (lastDrawingKey !== drawingKey) {
    setLastDrawingKey(drawingKey)
    resetDrawing()
  }

  const cutoutTarget = cutoutFor ? takeoffs.find((t) => t.id === cutoutFor) : undefined
  const drawStyle: DrawStyle =
    tool === 'linear' || tool === 'area' || tool === 'perimeter' ? drawStyles[tool] : 'polygon'
  /** Freehand stroke in progress (button held down). */
  const freehand = useRef<{ pointerId: number } | null>(null)
  /** Rectangle being dragged (button held down from its first corner). */
  const rectDrag = useRef<{ pointerId: number; sx: number; sy: number } | null>(null)
  const isClosedTool = tool === 'area' || tool === 'perimeter' || !!cutoutTarget
  const minPoints = isClosedTool ? 3 : 2

  /** Finish the shape being drawn (Enter, double-click, or clicking the first point). */
  const finishShape = (pts: Point[] = draft) => {
    if (cutoutTarget) {
      setDraft([])
      setCursor(null)
      if (pts.length < 3) return
      if (!pts.every((q) => pointInPolygon(q, cutoutTarget.points))) {
        setNotice('A cut-out must be inside the area. Try again, or press Esc to stop.')
        return
      }
      if (scaleAt([...cutoutTarget.points, ...pts]) === 'mixed') {
        setNotice(MIXED_NOTICE)
        return
      }
      setNotice(null)
      addCutout(cutoutTarget.id, pts)
      return
    }
    if (!isTakeoffTool(tool) || tool === 'count') return
    const degenerate = isClosedTool && polygonAreaPt2(pts) < 0.01 // e.g. a double-click on one spot
    setDraft([])
    setCursor(null)
    if (pts.length < minPoints || degenerate) return
    if (scaleAt(pts) === 'mixed') {
      setNotice(MIXED_NOTICE)
      return
    }
    setNotice(null)
    addTakeoff(sheet.id, tool, pts)
  }

  /** Finish a markup being drawn (two corners/ends, or a pen stroke). */
  const finishMarkup = (pts: Point[]) => {
    setDraft([])
    setCursor(null)
    const v = viewRef.current
    const type = markupOptions.type
    if (!v || pts.length < 2) return
    // too small to be deliberate (a click without a drag)
    if (pts.every((q) => distancePt(q, pts[0]) * v.scale < 4)) return
    addMarkup({ sheetId: sheet.id, type, points: pts, colour: markupOptions.colour, width: markupOptions.width })
  }

  const commitText = () => {
    const t = textEdit
    setTextEdit(null)
    if (!t) return
    const text = t.text.replace(/\s+$/, '')
    if (t.id) {
      if (!text.trim()) deleteMarkup(t.id)
      else updateMarkup(t.id, { text })
    } else if (text.trim()) {
      const id = addMarkup({
        sheetId: sheet.id,
        type: 'text',
        points: [t.at],
        colour: markupOptions.colour,
        width: markupOptions.width,
        text,
        fontSize: markupOptions.fontSize,
      })
      selectMarkup(id)
    }
  }

  // Space held = temporary pan; keyboard shortcuts for drawing.
  const spaceHeld = useRef(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setNotice(null)
      if (draft.length || measured || calibLine) resetDrawing()
      else if (cutoutFor) cancelCutout()
      else if (pendingRegion) setPendingRegion(null)
      else {
        selectTakeoff(null)
        selectMarkup(null)
      }
    } else if (e.key === 'Enter' && draft.length) {
      e.preventDefault()
      finishShape()
    } else if (e.key === 'Backspace' && draft.length) {
      e.preventDefault()
      setDraft((d) => d.slice(0, -1))
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !draft.length && selectedId) {
      e.preventDefault()
      deleteTakeoff(selectedId)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !draft.length && selectedMarkupId) {
      e.preventDefault()
      deleteMarkup(selectedMarkupId)
    }
  }
  // Keep the window listener pointing at the latest handler (it reads current drawing state).
  useLayoutEffect(() => {
    keyHandler.current = onKey
  })
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.code === 'Space') {
        e.preventDefault()
        spaceHeld.current = true
        setSpaceDown(true)
      } else {
        keyHandler.current(e)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false
        setSpaceDown(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  /** Page point under the mouse. Shift locks the line horizontal or vertical. */
  // ---- Snapping ----
  const snapOn = usePanels((s) => s.snap)
  const snapApplies =
    snapOn &&
    !!view &&
    (!!cutoutTarget ||
      tool === 'calibrate' ||
      tool === 'measure' ||
      ((tool === 'linear' || tool === 'area' || tool === 'perimeter') && drawStyle !== 'freehand') ||
      (tool === 'markup' && ['line', 'arrow', 'rectangle', 'ellipse', 'cloud', 'highlight'].includes(markupOptions.type)))
  const [snapSource, setSnapSource] = useState<{ sheetId: string; source: SnapSource } | null>(null)
  // Read the sheet's linework as soon as it's shown (if snapping is on), so it's ready by the first click.
  useEffect(() => {
    if (!snapOn) return
    let live = true
    void getSnapSource(sheet).then((source) => live && setSnapSource({ sheetId: sheet.id, source }))
    return () => {
      live = false
    }
  }, [snapOn, sheet])
  /** Edges of the shapes already drawn on this sheet: snap to those too. */
  const shapeIndex = useMemo(() => {
    const segs: Segment[] = []
    const add = (ring: Point[], closed: boolean) => {
      for (let i = 0; i + 1 < ring.length; i++) segs.push([ring[i].x, ring[i].y, ring[i + 1].x, ring[i + 1].y])
      if (closed && ring.length > 2) segs.push([ring[ring.length - 1].x, ring[ring.length - 1].y, ring[0].x, ring[0].y])
    }
    for (const t of takeoffs) {
      const kind = itemsById.get(t.itemId)?.kind
      if (kind && kind !== 'count') {
        add(t.points, kind !== 'linear')
        t.holes.forEach((h) => add(h, true))
      }
    }
    for (const m of markups) if (m.type === 'line' || m.type === 'arrow') add(m.points, false)
    return new SegmentIndex(segs)
  }, [takeoffs, markups, itemsById])
  const [, setTileTick] = useState(0)
  const [snap, setSnap] = useState<Snap | null>(null)

  /** The snap for a raw page point, or null (snapping off, Alt/Shift held, or nothing near). */
  const snapAt = (p: Point, e: { altKey: boolean; shiftKey: boolean }): Snap | null => {
    const v = viewRef.current
    if (!snapApplies || !v || e.altKey || e.shiftKey) return null
    const radius = 10 / v.scale
    const found: Snap[] = []
    const own = findSnap(shapeIndex, p, radius)
    if (own) found.push(own)
    const src = snapSource?.sheetId === sheet.id ? snapSource.source : null
    if (src?.kind === 'vector') {
      const s = findSnap(src.index, p, radius)
      if (s) found.push(s)
    } else if (src?.kind === 'image') {
      const tile = imageTileAt(sheet, p, () => setTileTick((n) => n + 1))
      const s = tile && findImageSnap(tile, p, Math.min(radius, 20))
      if (s) found.push(s)
    }
    const rank: Record<Snap['kind'], number> = { end: 0, intersection: 0, 'corner-approx': 1, mid: 2, line: 3, 'line-approx': 4 }
    found.sort((a, b) => rank[a.kind] - rank[b.kind] || distancePt(a.point, p) - distancePt(b.point, p))
    return found[0] ?? null
  }

  /** Page point under the mouse: snapped to the drawing if snapping applies; Shift locks the line horizontal or vertical. */
  const pagePointFromEvent = (e: React.PointerEvent | React.MouseEvent, from?: Point): Point => {
    const rect = boxRef.current!.getBoundingClientRect()
    const p = screenToPage(viewRef.current!, e.clientX - rect.left, e.clientY - rect.top)
    if (e.shiftKey && from) {
      return Math.abs(p.x - from.x) >= Math.abs(p.y - from.y)
        ? { x: p.x, y: from.y }
        : { x: from.x, y: p.y }
    }
    return snapAt(p, e)?.point ?? p
  }

  /** The topmost markup under a page point, if any. */
  const hitMarkup = (p: Point): string | null => {
    const v = viewRef.current
    if (!v || !showMarkups) return null
    for (let i = markups.length - 1; i >= 0; i--) {
      const m = markups[i]
      const tol = 7 / v.scale + m.width / 2
      for (const prim of markupPrimitives(m, measureScreenText)) {
        if (prim.kind === 'text' && prim.box) {
          if (p.x >= prim.at.x && p.x <= prim.at.x + prim.box.width && p.y >= prim.at.y && p.y <= prim.at.y + prim.box.height) return m.id
        } else if (prim.kind === 'path') {
          if (prim.closed && prim.fill && prim.rings.some((r) => pointInPolygon(p, r))) return m.id
          if (prim.rings.some((r) => distanceToPolyline(p, r, prim.closed) <= tol)) return m.id
        }
      }
    }
    return null
  }

  /** The topmost takeoff shape under a page point, if any. */
  const hitTest = (p: Point): string | null => {
    const v = viewRef.current
    if (!v || !showTakeoffs) return null
    const tol = 8 / v.scale
    for (let i = takeoffs.length - 1; i >= 0; i--) {
      const t = takeoffs[i]
      const kind = itemsById.get(t.itemId)?.kind
      if (kind === 'count') {
        if (distancePt(p, t.points[0]) <= 10 / v.scale) return t.id
      } else if (kind === 'linear') {
        if (distanceToPolyline(p, t.points) <= tol) return t.id
      } else if (kind === 'perimeter') {
        if (distanceToPolyline(p, t.points, true) <= tol) return t.id
      } else if (kind === 'area') {
        if (distanceToPolyline(p, t.points, true) <= tol) return t.id
        if (pointInPolygon(p, t.points) && !t.holes.some((h) => pointInPolygon(p, h))) return t.id
      }
    }
    return null
  }

  /** Which handle of the selected shape is under a page point: ring -1 = outline, 0+ = cut-outs. */
  const handleAt = (p: Point): { ring: number; index: number } | null => {
    const v = viewRef.current
    const t = takeoffs.find((x) => x.id === selectedId)
    if (!v || !t || itemsById.get(t.itemId)?.kind === 'count') return null
    const rings = [t.points, ...t.holes]
    for (let r = 0; r < rings.length; r++) {
      const index = rings[r].findIndex((q) => distancePt(p, q) * v.scale <= 7)
      if (index >= 0) return { ring: r - 1, index }
    }
    return null
  }

  /** Which resize handle of the selected markup is under a page point. */
  const markupHandleAt = (p: Point): number | null => {
    const v = viewRef.current
    const m = markups.find((x) => x.id === selectedMarkupId)
    if (!v || !m) return null
    const index = markupHandles(m).findIndex((q) => distancePt(p, q) * v.scale <= 7)
    return index >= 0 ? index : null
  }

  // ---- Editing shapes: drag a handle to reshape, or the shape to move it ----
  const edit = useRef<{
    pointerId: number
    start: Point
    moved: boolean
    target:
      | { kind: 'takeoff'; takeoff: Takeoff; handle: { ring: number; index: number } | null }
      | { kind: 'markup'; markup: Markup; handle: number | null }
  } | null>(null)

  const editMove = (e: React.PointerEvent) => {
    const d = edit.current
    if (!d || d.pointerId !== e.pointerId) return false
    const p = pagePointFromEvent(e)
    const dx = p.x - d.start.x
    const dy = p.y - d.start.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) * viewRef.current!.scale < 2) return true // ignore tiny jitter on a click
      checkpoint() // one undo step per drag
      d.moved = true
    }
    const shift = (ring: Point[]) => ring.map((q) => ({ x: q.x + dx, y: q.y + dy }))
    if (d.target.kind === 'markup') {
      const { markup: m, handle: h } = d.target
      const end = h === null ? undefined : pagePointFromEvent(e, m.points[1 - h])
      updateMarkup(m.id, { points: h === null ? shift(m.points) : m.points.map((q, i) => (i === h ? end! : q)) }, false)
      return true
    }
    const { takeoff: t, handle } = d.target
    if (handle) {
      const moveIn = (ring: Point[], r: number) => (r === handle.ring ? ring.map((q, i) => (i === handle.index ? p : q)) : ring)
      updateTakeoff(t.id, { points: moveIn(t.points, -1), holes: t.holes.map((h, i) => moveIn(h, i)) }, false)
    } else {
      updateTakeoff(t.id, { points: shift(t.points), holes: t.holes.map(shift) }, false)
    }
    return true
  }

  // ---- Panning: Pan tool left-drag, middle-drag, or Space+drag ----
  const drag = useRef<{ id: number; sx: number; sy: number; view: View } | null>(null)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view || calibLine) return
    const wantsPan = e.button === 1 || (e.button === 0 && (tool === 'pan' || spaceHeld.current))
    if (wantsPan) {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, view }
      setDragging(true)
      return
    }
    if (e.button !== 0) return
    // Stop the browser moving focus, so the calibration box keeps the cursor.
    e.preventDefault()
    const last = draft[draft.length - 1]
    const p = pagePointFromEvent(e, last)

    if (cutoutTarget) {
      if (draft.length >= 3 && distancePt(p, draft[0]) * view.scale < 10) {
        finishShape()
        return
      }
      if (last && distancePt(p, last) < 0.5) return
      setDraft([...draft, p])
      return
    }

    if (tool === 'select') {
      const capture = () => (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      // Handles of the current selection first, then markups (drawn on top), then takeoffs.
      const mHandle = markupHandleAt(p)
      const tHandle = mHandle === null ? handleAt(p) : null
      const markupId = mHandle !== null ? selectedMarkupId : tHandle ? null : hitMarkup(p)
      if (markupId) {
        selectMarkup(markupId)
        const m = markups.find((x) => x.id === markupId)!
        capture()
        edit.current = { pointerId: e.pointerId, start: p, moved: false, target: { kind: 'markup', markup: m, handle: mHandle } }
        return
      }
      const id = tHandle ? selectedId : hitTest(p)
      selectTakeoff(id)
      if (!id) selectMarkup(null)
      const t = takeoffs.find((x) => x.id === id)
      if (t) {
        capture()
        edit.current = { pointerId: e.pointerId, start: p, moved: false, target: { kind: 'takeoff', takeoff: t, handle: tHandle } }
      }
      return
    }

    if (tool === 'areas' || tool === 'region') {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      rectDrag.current = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY }
      setDraft([p])
      setCursor(p)
      return
    }

    if (tool === 'markup') {
      const type = markupOptions.type
      if (type === 'text') {
        setTextEdit({ at: p, text: '' })
        return
      }
      if (type === 'pen') {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        freehand.current = { pointerId: e.pointerId }
        setDraft([p])
        setCursor(null)
        return
      }
      if (draft.length === 1) {
        finishMarkup([draft[0], pagePointFromEvent(e, type === 'line' || type === 'arrow' ? draft[0] : undefined)])
        return
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      rectDrag.current = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY }
      setDraft([p])
      setCursor(p)
      return
    }

    if (tool === 'count') {
      addTakeoff(sheet.id, 'count', [p])
      setNotice(null)
      return
    }

    if ((tool === 'linear' || tool === 'area' || tool === 'perimeter') && drawStyle === 'freehand') {
      // Freehand: hold the button down and trace; lifting it finishes.
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      freehand.current = { pointerId: e.pointerId }
      setDraft([p])
      setCursor(null)
      return
    }

    if ((tool === 'area' || tool === 'perimeter') && drawStyle === 'rectangle') {
      if (draft.length === 1) {
        // Second click of a click-click rectangle.
        finishShape(rectCorners(draft[0], p))
        return
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      rectDrag.current = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY }
      setDraft([p])
      setCursor(p)
      return
    }

    if (tool === 'linear' || tool === 'area' || tool === 'perimeter') {
      // Clicking the first point closes an area or perimeter.
      if (isClosedTool && draft.length >= 3 && distancePt(p, draft[0]) * view.scale < 10) {
        finishShape()
        return
      }
      if (last && distancePt(p, last) < 0.5) return // second click of a double-click
      setDraft([...draft, p])
      return
    }

    // Calibrate / Measure: click the start point, then the end point.
    if (draft.length === 0) {
      setMeasured(null)
      setDraft([p])
      return
    }
    const line: [Point, Point] = [draft[0], p]
    setDraft([])
    if (distancePt(line[0], line[1]) < 0.5) return // ignore a double-click on the same spot
    if (tool === 'calibrate' && pendingRegion?.sheetId === sheet.id) {
      // calibrating a new scale area: the dimension must be inside its box
      const r = { ...pendingRegion, id: '', sheetId: sheet.id, realMmPerPt: 0, label: '' }
      if (regionFor(line, [r]) !== r) {
        setNotice('Click a dimension inside the dashed box, so the scale belongs to that area.')
        return
      }
      setNotice(null)
      setCalibLine(line)
    } else if (tool === 'calibrate') setCalibLine(line)
    else setMeasured(line)
  }
  const onDoubleClick = () => {
    if (cutoutTarget || tool === 'linear' || tool === 'area' || tool === 'perimeter') finishShape()
    const m = markups.find((x) => x.id === selectedMarkupId)
    if (tool === 'select' && m?.type === 'text') setTextEdit({ id: m.id, at: m.points[0], text: m.text ?? '' })
  }
  const [hoverHandle, setHoverHandle] = useState(false)
  const onPointerMove = (e: React.PointerEvent) => {
    if (editMove(e)) return
    // Show where the next click will snap to.
    if (snapApplies && !drag.current && !freehand.current && viewRef.current) {
      const rect = boxRef.current!.getBoundingClientRect()
      const raw = screenToPage(viewRef.current, e.clientX - rect.left, e.clientY - rect.top)
      const next = snapAt(raw, e)
      if (next?.kind !== snap?.kind || next?.point.x !== snap?.point.x || next?.point.y !== snap?.point.y) setSnap(next)
    } else if (snap) setSnap(null)
    if (tool === 'select' && viewRef.current) {
      const q = pagePointFromEvent(e)
      const over = handleAt(q) !== null || markupHandleAt(q) !== null
      if (over !== hoverHandle) setHoverHandle(over)
    }
    const d = drag.current
    if (d && d.id === e.pointerId) {
      setView({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy })
      return
    }
    if (freehand.current?.pointerId === e.pointerId && viewRef.current) {
      // Add a point for every pixel or so of movement.
      const p = pagePointFromEvent(e)
      const last = draft[draft.length - 1]
      if (!last || distancePt(p, last) * viewRef.current.scale >= 1) setDraft((d) => [...d, p])
      return
    }
    if (rectDrag.current && viewRef.current) {
      const straight = tool === 'markup' && (markupOptions.type === 'line' || markupOptions.type === 'arrow')
      setCursor(pagePointFromEvent(e, straight ? draft[0] : undefined))
      return
    }
    if (tool === 'markup' && draft.length === 1 && viewRef.current) {
      const straight = markupOptions.type === 'line' || markupOptions.type === 'arrow'
      setCursor(pagePointFromEvent(e, straight ? draft[0] : undefined))
      return
    }
    if (tool !== 'pan' && (tool !== 'select' || cutoutTarget) && draft.length > 0 && viewRef.current) {
      setCursor(pagePointFromEvent(e, draft[draft.length - 1]))
    }
  }
  const endDrag = (e: React.PointerEvent) => {
    if (freehand.current?.pointerId === e.pointerId) {
      freehand.current = null
      const v = viewRef.current
      // Drop points that add nothing (within ~¼ pixel of a straight line), then finish.
      // Simplifying always trims slightly inside curves, so keep the tolerance tight.
      const pts = v ? simplifyPath(draft, 0.25 / v.scale) : draft
      if (tool === 'markup') {
        finishMarkup(pts)
        return
      }
      const big = v && pts.length >= minPoints && pts.some((q) => distancePt(q, pts[0]) * v.scale > 4)
      if (big) finishShape(pts)
      else {
        setDraft([])
        setCursor(null)
      }
      return
    }
    if (rectDrag.current?.pointerId === e.pointerId) {
      const d = rectDrag.current
      rectDrag.current = null
      // Dragged: finish on release. Just clicked: wait for the opposite corner.
      const dragged = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4 && draft[0]
      if (tool === 'areas') {
        if (dragged) void setLabelArea(areaField, areaFromPoints(draft[0], pagePointFromEvent(e), sheet.widthPt, sheet.heightPt))
        setDraft([])
        setCursor(null)
      } else if (tool === 'region') {
        const end = pagePointFromEvent(e)
        if (dragged) setNewRegion({ x0: Math.min(draft[0].x, end.x), y0: Math.min(draft[0].y, end.y), x1: Math.max(draft[0].x, end.x), y1: Math.max(draft[0].y, end.y) })
        setDraft([])
        setCursor(null)
      } else if (dragged && tool === 'markup') {
        const straight = markupOptions.type === 'line' || markupOptions.type === 'arrow'
        finishMarkup([draft[0], pagePointFromEvent(e, straight ? draft[0] : undefined)])
      } else if (dragged) finishShape(rectCorners(draft[0], pagePointFromEvent(e)))
      return
    }
    if (edit.current?.pointerId === e.pointerId) edit.current = null
    if (drag.current?.id === e.pointerId) {
      drag.current = null
      setDragging(false)
    }
  }

  // ---- What to draw on the overlay ----
  const lengthLabel = (a: Point, b: Point) => {
    const sc = scaleAt([a, b])
    if (sc === 'mixed') return 'Crosses a scale area'
    if (!sc) return 'No scale'
    const text = formatLength(realMm(distancePt(a, b), sc.realMmPerPt))
    return sc.state === 'confirmed' ? text : `${text} (unverified)`
  }
  /** What a calibration line sets: a new scale area being made, an existing area it's inside, or the sheet. */
  const calibTarget: { kind: 'new'; box: { x0: number; y0: number; x1: number; y1: number }; label: string } | { kind: 'region'; id: string; label: string } | { kind: 'sheet'; label: string } = (() => {
    if (pendingRegion?.sheetId === sheet.id) {
      const { x0, y0, x1, y1 } = pendingRegion
      return { kind: 'new', box: { x0, y0, x1, y1 }, label: 'the new scale area' }
    }
    const r = calibLine ? regionFor(calibLine, regionsHere) : null
    if (r && r !== 'mixed') return { kind: 'region', id: r.id, label: `the scale area (${r.label})` }
    return { kind: 'sheet', label: 'this sheet' }
  })()
  const dimPrefs = usePanels((s) => s.dims)
  const dimsOn = dimPrefs.show !== 'off'
  const dimLook = view ? screenLook(dimPrefs, view.scale) : null
  const overlayLines: OverlayLine[] = []
  /** Measure tool lines drawn as dimensions (when dimensions are on). */
  const measureDims: Point[][] = []
  const measuring = tool === 'calibrate' || tool === 'measure'
  const toolColour = tool === 'calibrate' ? '#c2410c' : '#1d4ed8'
  if (measuring && draft.length === 1 && cursor) {
    overlayLines.push({
      points: [draft[0], cursor],
      colour: toolColour,
      dashed: true,
      label: tool === 'measure' && !dimsOn ? lengthLabel(draft[0], cursor) : undefined,
    })
    if (tool === 'measure' && dimsOn) measureDims.push([draft[0], cursor])
  } else if (measuring && draft.length === 1) {
    overlayLines.push({ points: draft, colour: toolColour })
  }
  if (measured) {
    overlayLines.push({ points: measured, colour: '#1d4ed8', label: dimsOn ? undefined : lengthLabel(measured[0], measured[1]) })
    if (dimsOn) measureDims.push(measured)
  }
  if (calibLine) overlayLines.push({ points: calibLine, colour: '#c2410c' })

  const qtyText = (t: Takeoff | { points: Point[]; holes: Point[][] }, kind: TakeoffKind) => {
    const sc = scaleAt([...t.points, ...t.holes.flat()])
    if (sc === 'mixed' && kind !== 'count') return 'Crosses a scale area'
    const q = takeoffQuantity({ id: '', itemId: '', sheetId: '', ...t }, kind, sc === 'mixed' ? undefined : sc)
    if (q.value === null) return 'No scale'
    const text = formatQuantity(q.value, kind) + (kind === 'count' ? ' counted' : '')
    return q.state === 'unverified' && kind !== 'count' ? `${text} (unverified)` : text
  }
  const takeoffDraft: TakeoffDraft | null = cutoutTarget && draft.length > 0
    ? {
        kind: 'cutout',
        colour: '#111',
        points: draft,
        cursor,
        label: `− ${qtyText({ points: cursor ? [...draft, cursor] : draft, holes: [] }, 'area')}`,
      }
    : isTakeoffTool(tool) && tool !== 'count' && draft.length > 0
      ? (() => {
          const colour = drawItem?.colour ?? ITEM_COLOURS[items.length % ITEM_COLOURS.length]
          if (drawStyle === 'rectangle') {
            const corners = cursor ? rectCorners(draft[0], cursor) : draft
            return { kind: tool, colour, points: corners, cursor: null, label: qtyText({ points: corners, holes: [] }, tool), handles: false }
          }
          if (drawStyle === 'freehand') {
            return { kind: tool, colour, points: draft, cursor: null, label: qtyText({ points: draft, holes: [] }, tool), handles: false }
          }
          return { kind: tool, colour, points: draft, cursor, label: qtyText({ points: cursor ? [...draft, cursor] : draft, holes: [] }, tool) }
        })()
      : null
  const markupDraft: Markup | null =
    tool === 'markup' && draft.length > 0 && markupOptions.type !== 'text'
      ? {
          id: 'draft',
          sheetId: sheet.id,
          type: markupOptions.type,
          points: markupOptions.type === 'pen' ? draft : [draft[0], cursor ?? draft[0]],
          colour: markupOptions.colour,
          width: markupOptions.width,
        }
      : null
  const selectedMarkup = markups.find((m) => m.id === selectedMarkupId)
  const selected = takeoffs.find((t) => t.id === selectedId)
  const selectedKind = selected ? itemsById.get(selected.itemId)?.kind : undefined
  const selectedLabel = selected && selectedKind ? qtyText(selected, selectedKind) : undefined

  const cursorClass = dragging
    ? 'cursor-grabbing'
    : tool === 'pan' || spaceDown
      ? 'cursor-grab'
      : cutoutTarget
        ? 'cursor-crosshair'
        : tool === 'markup' && markupOptions.type === 'text'
          ? 'cursor-text'
          : tool === 'select'
        ? hoverHandle
          ? 'cursor-move'
          : 'cursor-default'
        : 'cursor-crosshair'

  const itemName = drawItem ? `“${drawItem.name}”` : 'a new item'
  const hint = cutoutTarget
    ? draft.length === 0
      ? 'Cut-out: click the corners of the part to deduct'
      : 'Click to add corners · click the first point or press Enter to finish'
    : tool === 'pan'
      ? null
      : tool === 'areas'
        ? `Drag a box round the ${FIELD_LABEL[areaField].toLowerCase()} on this sheet`
        : tool === 'region'
        ? 'Scale area: drag a box round the part of the sheet at a different scale (e.g. a detail)'
        : tool === 'calibrate' && pendingRegion?.sheetId === sheet.id
        ? draft.length === 0
          ? 'Calibrate the new scale area: click one end of a dimension you know, inside the dashed box'
          : 'Now click the other end (inside the box)'
        : tool === 'markup'
        ? MARKUP_HINT[markupOptions.type]
        : tool === 'select'
        ? selectedMarkup
          ? selectedMarkup.type === 'text'
            ? 'Drag to move · double-click to edit the text · Delete to remove'
            : 'Drag to move' + (markupHandles(selectedMarkup).length ? ', or a handle to resize' : '') + ' · Delete to remove'
          : selected
          ? 'Drag a corner to reshape, or the shape to move it · Delete to remove · Esc to deselect'
          : 'Select: click a shape or markup'
        : tool === 'calibrate'
          ? draft.length === 0
            ? 'Calibrate: click one end of a dimension you know'
            : 'Now click the other end (hold Shift for straight)'
          : tool === 'measure'
            ? draft.length === 0
              ? 'Measure: click the start point'
              : 'Click the end point (hold Shift for straight)'
            : tool === 'count' || !isTakeoffTool(tool)
              ? `Count into ${itemName}: click each one`
              : drawStyle === 'freehand'
                ? `${KIND_LABEL[tool]} into ${itemName}: hold the mouse button down and trace${isClosedTool ? ' round the shape (it closes itself)' : ''}`
                : drawStyle === 'rectangle'
                  ? draft.length === 0
                    ? `${KIND_LABEL[tool]} into ${itemName}: drag from one corner to the opposite corner (or click both)`
                    : 'Now click the opposite corner'
                  : draft.length === 0
                ? `${KIND_LABEL[tool]} into ${itemName}: click the first point`
                : isClosedTool
                  ? 'Click to add corners · click the first point or press Enter to close · Backspace removes a point'
                  : 'Click to add points · Enter or double-click to finish · Backspace removes a point'
  const noScaleWarning = isTakeoffTool(tool) && tool !== 'count' && !scale

  // ---- Zoom buttons ----
  const zoomCentre = (factor: number) => {
    const v = viewRef.current
    if (!v) return
    const { w, h } = getBoxSize()
    setView(zoomAt(v, factor, w / 2, h / 2))
  }
  const actualSize = () => {
    const v = viewRef.current
    if (v) zoomCentre(ACTUAL_SIZE_SCALE / v.scale)
  }

  const zoomPercent = view ? Math.round((view.scale / ACTUAL_SIZE_SCALE) * 100) : 0

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full overflow-hidden bg-steel-blue-2 select-none ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onAuxClick={(e) => e.preventDefault()}
    >
      <canvas
        ref={baseRef}
        className="absolute top-0 left-0 bg-white"
        style={{ transformOrigin: '0 0' }}
      />
      <div
        ref={detailHostRef}
        className="pointer-events-none absolute top-0 left-0"
        style={{ transformOrigin: '0 0' }}
      />

      {view && boxSize.w > 0 && (
        <MeasureOverlay width={boxSize.w} height={boxSize.h} view={view} lines={overlayLines}>
          {showTakeoffs && (
            <TakeoffLayer
              scale={view.scale}
              takeoffs={takeoffs}
              items={itemsById}
              selectedId={selectedId}
              selectedLabel={selectedLabel}
              draft={takeoffDraft}
              dims={{ look: dimLook, show: dimPrefs.show, mmPerPtFor: (pts) => { const sc = scaleAt(pts); return sc && sc !== 'mixed' ? sc.realMmPerPt : null } }}
            />
          )}
          {tool === 'areas' && (
            <AreaBoxes
              areas={labelAreas}
              draft={draft[0] && cursor ? { field: areaField, rect: areaFromPoints(draft[0], cursor, sheet.widthPt, sheet.heightPt) } : null}
              pageW={sheet.widthPt}
              pageH={sheet.heightPt}
              scale={view.scale}
            />
          )}
          {dimLook &&
            measureDims.map((line, i) => (
              <PrimitivesShape key={`mdim-${i}`} prims={shapeDimensions(line, false, ((sc) => (sc && sc !== 'mixed' ? sc.realMmPerPt : null))(scaleAt(line)), dimLook, false, measureScreenText)} />
            ))}
          <RegionBoxes
            regions={regionsHere}
            draft={tool === 'region' && draft[0] && cursor ? { x0: Math.min(draft[0].x, cursor.x), y0: Math.min(draft[0].y, cursor.y), x1: Math.max(draft[0].x, cursor.x), y1: Math.max(draft[0].y, cursor.y) } : (newRegion ?? (pendingRegion?.sheetId === sheet.id ? pendingRegion : null))}
            scale={view.scale}
          />
          <SnapMarkerLayer snap={snapApplies ? snap : null} scale={view.scale} />
          {showMarkups && (
            <MarkupLayer
              scale={view.scale}
              markups={markups}
              selectedId={selectedMarkupId}
              draft={markupDraft}
              hiddenId={textEdit?.id}
            />
          )}
        </MeasureOverlay>
      )}

      {textEdit && view && (
        <TextEditor
          key={textEdit.id ?? 'new'}
          value={textEdit.text}
          onChange={(text) => setTextEdit({ ...textEdit, text })}
          onCommit={commitText}
          onCancel={() => setTextEdit(null)}
          left={view.x + textEdit.at.x * view.scale}
          top={view.y + textEdit.at.y * view.scale}
          fontSize={(textEdit.id ? (markups.find((m) => m.id === textEdit.id)?.fontSize ?? 14) : markupOptions.fontSize) * view.scale}
          colour={textEdit.id ? (markups.find((m) => m.id === textEdit.id)?.colour ?? '#111') : markupOptions.colour}
        />
      )}

      <OldVersionBanner sheetId={sheet.id} />

      {hint && !calibLine && !textEdit && (
        <div
          data-testid="tool-hint"
          className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded bg-graphite/90 px-3 py-1.5 text-center text-sm text-chalk"
        >
          {hint}
          <span className="text-foundation-grey">
            {' · Space+drag to pan'}
            {tool !== 'select' || cutoutTarget ? ' · Esc to cancel' : ''}
          </span>
          {notice && <div className="mt-1 text-signal-orange-3">{notice}</div>}
          {snapApplies && (
            <div className="mt-0.5 text-xs text-foundation-grey" data-testid="snap-hint">
              Snap on{snapSource?.sheetId === sheet.id && snapSource.source.kind === 'image' ? ' (approximate: this sheet is flattened)' : ''} · hold Alt to draw freely · S to turn off
              {snap && <span className="text-chalk"> · {SNAP_LABEL[snap.kind]}</span>}
            </div>
          )}
          {noScaleWarning && (
            <div className="mt-1 text-signal-orange-3">
              No scale on this sheet — these shapes won’t count in totals until you calibrate.
            </div>
          )}
        </div>
      )}

      {calibLine && (
        <CalibrateDialog
          distPt={distancePt(calibLine[0], calibLine[1])}
          target={calibTarget.label}
          onCancel={() => setCalibLine(null)}
          onApply={(mmPerPt) => {
            const label = `Calibrated (≈ ${formatRatio(equivalentRatio(mmPerPt))})`
            if (calibTarget.kind === 'new') addScaleRegion({ sheetId: sheet.id, ...calibTarget.box, realMmPerPt: mmPerPt, label })
            else if (calibTarget.kind === 'region') updateScaleRegion(calibTarget.id, { realMmPerPt: mmPerPt, label })
            else setCalibratedScale(sheet.id, mmPerPt)
            setCalibLine(null)
            setTool('measure')
          }}
        />
      )}

      {newRegion && (
        <RegionScaleDialog
          onCancel={() => {
            setNewRegion(null)
            setTool('select')
          }}
          onRatio={(ratio) => {
            addScaleRegion({ sheetId: sheet.id, ...newRegion, realMmPerPt: mmPerPtFromRatio(ratio), label: `1:${ratio}` })
            setNewRegion(null)
            setTool('select')
          }}
          onCalibrate={() => {
            setPendingRegion({ sheetId: sheet.id, ...newRegion })
            setNewRegion(null)
            setTool('calibrate')
          }}
        />
      )}

      <ViewControls />

      <div
        className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg bg-white/95 p-1 text-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ZoomButton label="Zoom out" onClick={() => zoomCentre(1 / 1.25)}>−</ZoomButton>
        <button
          className="w-14 rounded px-1 py-1 text-center tabular-nums hover:bg-neutral-100"
          title="Actual size (100% = true print size)"
          onClick={actualSize}
        >
          {zoomPercent}%
        </button>
        <ZoomButton label="Zoom in" onClick={() => zoomCentre(1.25)}>+</ZoomButton>
        <button className="rounded px-2 py-1 hover:bg-neutral-100" onClick={fit} title="Fit page">
          Fit
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-graphite/85 px-2 py-1 text-xs text-chalk">
        {label?.number && <strong className="font-semibold">{label.number}</strong>}
        {label?.title && <> {label.title}</>}
        {(label?.number || label?.title) && ' · '}
        {sheet.fileName} p{sheet.pageNumber} · {describePaperSize(sheet.widthPt, sheet.heightPt)}
        {!scaleBarOpen && (
          <span data-testid="info-scale" className={scale?.status === 'confirmed' ? '' : 'text-signal-orange-3'}>
            {' · Scale '}
            {scale ? `${scale.source === 'calibrated' ? 'calibrated' : scale.label.split(' (')[0]}${scale.status === 'confirmed' ? ' ✓' : ' (verify)'}` : 'not set'}
          </span>
        )}
      </div>

      {measured && (
        <div
          data-testid="measurement"
          className="pointer-events-none absolute bottom-12 left-3 rounded bg-graphite px-2.5 py-1 text-sm font-medium text-chalk"
        >
          Measured: {lengthLabel(measured[0], measured[1])}
        </div>
      )}
    </div>
  )
}

function ZoomButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="h-7 w-7 rounded text-lg leading-none hover:bg-neutral-100"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

const MARKUP_HINT: Record<MarkupType, string> = {
  cloud: 'Cloud: drag a box round the area to cloud',
  rectangle: 'Rectangle: drag from corner to corner',
  ellipse: 'Ellipse: drag a box for the ellipse',
  arrow: 'Arrow: drag from the tail to the point (Shift for straight)',
  line: 'Line: drag from end to end (Shift for straight)',
  pen: 'Pen: hold the mouse button down and draw',
  text: 'Text: click where the text should go, type, then press Enter (Shift+Enter for a new line)',
  highlight: 'Highlight: drag over the area to highlight',
}

/** Typing box for text markups, positioned over the plan. */
function TextEditor(props: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  left: number
  top: number
  fontSize: number
  colour: string
}) {
  const rows = Math.max(1, props.value.split('\n').length)
  return (
    <textarea
      autoFocus
      data-testid="text-editor"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={props.onCommit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          props.onCommit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          props.onCancel()
        }
      }}
      rows={rows}
      placeholder="Type…"
      className="absolute z-20 resize-none rounded-sm border-2 bg-white/95 outline-none"
      style={{
        left: props.left,
        top: props.top,
        fontSize: Math.max(10, props.fontSize),
        lineHeight: 1.2,
        color: props.colour,
        borderColor: props.colour,
        padding: Math.max(2, props.fontSize * 0.3),
        fontFamily: 'Arial, Helvetica, sans-serif',
        minWidth: 160,
        width: Math.max(160, Math.max(...props.value.split('\n').map((l) => l.length)) * props.fontSize * 0.6 + 24),
      }}
    />
  )
}

/** Top-right of the plan: Focus (hide all panels) and browser Full screen. */
function ViewControls() {
  const focused = usePanels((s) => isFocused(s.open))
  const toggleFocus = usePanels((s) => s.toggleFocus)
  const [fullScreen, setFullScreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setFullScreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const canFullScreen = typeof document !== 'undefined' && document.fullscreenEnabled
  const btn = 'rounded px-2 py-1 whitespace-nowrap hover:bg-neutral-100'
  return (
    <div
      className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-neutral-300 bg-white/95 p-1 text-sm"
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="view-controls"
    >
      <button
        onClick={toggleFocus}
        className={`${btn} ${focused ? 'bg-accent text-graphite hover:bg-accent-hover' : ''}`}
        title={focused ? 'Show the panels again (F)' : 'Hide the side panels and scale bar so the plan fills the screen (F)'}
        data-testid="focus-button"
        aria-pressed={focused}
      >
        {focused ? 'Show panels' : 'Focus'}
      </button>
      {canFullScreen && (
        <button
          onClick={() => (fullScreen ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
          className={btn}
          title={fullScreen ? 'Leave full screen (Esc)' : 'Full screen: also hide the browser’s tabs and address bar'}
          data-testid="fullscreen-button"
        >
          {fullScreen ? 'Exit full screen' : 'Full screen'}
        </button>
      )}
    </div>
  )
}

/** On an earlier version of a sheet: say so, and offer the latest. */
function OldVersionBanner({ sheetId }: { sheetId: string }) {
  const supersedes = useApp((s) => s.supersedes)
  const selectSheet = useApp((s) => s.selectSheet)
  if (!isSuperseded(sheetId, supersedes)) return null
  const latest = latestVersion(sheetId, supersedes)
  return (
    <div
      className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded border border-signal-orange-3 bg-signal-orange-4 px-3 py-1.5 text-sm text-graphite"
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="old-version-banner"
    >
      <span>
        <span className="font-semibold">Old version (v{versionNumber(sheetId, supersedes)})</span> · there’s a newer version of this sheet (v{versionNumber(latest, supersedes)}).
      </span>
      <button onClick={() => selectSheet(latest)} className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-graphite hover:bg-accent-hover">
        Open v{versionNumber(latest, supersedes)}
      </button>
    </div>
  )
}
