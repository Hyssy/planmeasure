import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderPage, type RenderHandle, type SheetMeta } from '../lib/pdf'
import { distancePt, formatLength, realMm, type Point } from '../lib/scale'
import { describePaperSize } from '../lib/units'
import { ACTUAL_SIZE_SCALE, fitView, screenToPage, zoomAt, type View } from '../lib/view'
import { distanceToPolyline, pointInPolygon, polygonAreaPt2, rectCorners, simplifyPath } from '../lib/geometry'
import { formatQuantity, ITEM_COLOURS, KIND_LABEL, takeoffQuantity, type Takeoff, type TakeoffKind } from '../lib/takeoff'
import { isTakeoffTool, scaleInfo, useApp, type DrawStyle } from '../store'
import TakeoffLayer, { type TakeoffDraft } from './TakeoffLayer'
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
    const ro = new ResizeObserver(() => {
      setBoxSize({ w: el.clientWidth, h: el.clientHeight })
      const v = viewRef.current
      if (v) setView({ ...v })
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
  const addCutout = useApp((s) => s.addCutout)
  const cancelCutout = useApp((s) => s.cancelCutout)
  const [notice, setNotice] = useState<string | null>(null)

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const takeoffs = useMemo(() => allTakeoffs.filter((t) => t.sheetId === sheet.id), [allTakeoffs, sheet.id])
  const activeItem = itemsById.get(activeItemId ?? '')
  const drawItem = isTakeoffTool(tool) && activeItem?.kind === tool ? activeItem : undefined
  const scaleForQty = scaleInfo(scale)

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
      setNotice(null)
      addCutout(cutoutTarget.id, pts)
      return
    }
    if (!isTakeoffTool(tool) || tool === 'count') return
    const degenerate = isClosedTool && polygonAreaPt2(pts) < 0.01 // e.g. a double-click on one spot
    if (pts.length >= minPoints && !degenerate) addTakeoff(sheet.id, tool, pts)
    setDraft([])
    setCursor(null)
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
      else selectTakeoff(null)
    } else if (e.key === 'Enter' && draft.length) {
      e.preventDefault()
      finishShape()
    } else if (e.key === 'Backspace' && draft.length) {
      e.preventDefault()
      setDraft((d) => d.slice(0, -1))
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !draft.length && selectedId) {
      e.preventDefault()
      deleteTakeoff(selectedId)
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
  const pagePointFromEvent = (e: React.PointerEvent | React.MouseEvent, from?: Point): Point => {
    const rect = boxRef.current!.getBoundingClientRect()
    const p = screenToPage(viewRef.current!, e.clientX - rect.left, e.clientY - rect.top)
    if (e.shiftKey && from) {
      return Math.abs(p.x - from.x) >= Math.abs(p.y - from.y)
        ? { x: p.x, y: from.y }
        : { x: from.x, y: p.y }
    }
    return p
  }

  /** The topmost shape under a page point, if any. */
  const hitTest = (p: Point): string | null => {
    const v = viewRef.current
    if (!v) return null
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

  // ---- Editing shapes: drag a handle to reshape, or the shape to move it ----
  const edit = useRef<{
    pointerId: number
    takeoff: Takeoff
    start: Point
    handle: { ring: number; index: number } | null
    moved: boolean
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
    const { takeoff: t, handle } = d
    if (handle) {
      const moveIn = (ring: Point[], r: number) => (r === handle.ring ? ring.map((q, i) => (i === handle.index ? p : q)) : ring)
      updateTakeoff(t.id, { points: moveIn(t.points, -1), holes: t.holes.map((h, i) => moveIn(h, i)) }, false)
    } else {
      const shift = (ring: Point[]) => ring.map((q) => ({ x: q.x + dx, y: q.y + dy }))
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
      const handle = handleAt(p)
      const id = handle ? selectedId : hitTest(p)
      selectTakeoff(id)
      const t = takeoffs.find((x) => x.id === id)
      if (t) {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        edit.current = { pointerId: e.pointerId, takeoff: t, start: p, handle, moved: false }
      }
      return
    }

    if (tool === 'count') {
      addTakeoff(sheet.id, 'count', [p])
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
    if (tool === 'calibrate') setCalibLine(line)
    else setMeasured(line)
  }
  const onDoubleClick = () => {
    if (cutoutTarget || tool === 'linear' || tool === 'area' || tool === 'perimeter') finishShape()
  }
  const [hoverHandle, setHoverHandle] = useState(false)
  const onPointerMove = (e: React.PointerEvent) => {
    if (editMove(e)) return
    if (tool === 'select' && viewRef.current) {
      const over = handleAt(pagePointFromEvent(e)) !== null
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
      setCursor(pagePointFromEvent(e))
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
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4 && draft[0]) finishShape(rectCorners(draft[0], pagePointFromEvent(e)))
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
    if (!scale) return 'No scale'
    const text = formatLength(realMm(distancePt(a, b), scale.realMmPerPt))
    return scale.status === 'confirmed' ? text : `${text} (unverified)`
  }
  const overlayLines: OverlayLine[] = []
  const measuring = tool === 'calibrate' || tool === 'measure'
  const toolColour = tool === 'calibrate' ? '#c2410c' : '#1d4ed8'
  if (measuring && draft.length === 1 && cursor) {
    overlayLines.push({
      points: [draft[0], cursor],
      colour: toolColour,
      dashed: true,
      label: tool === 'measure' ? lengthLabel(draft[0], cursor) : undefined,
    })
  } else if (measuring && draft.length === 1) {
    overlayLines.push({ points: draft, colour: toolColour })
  }
  if (measured) {
    overlayLines.push({ points: measured, colour: '#1d4ed8', label: lengthLabel(measured[0], measured[1]) })
  }
  if (calibLine) overlayLines.push({ points: calibLine, colour: '#c2410c' })

  const qtyText = (t: Takeoff | { points: Point[]; holes: Point[][] }, kind: TakeoffKind) => {
    const q = takeoffQuantity({ id: '', itemId: '', sheetId: '', ...t }, kind, scaleForQty)
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
  const selected = takeoffs.find((t) => t.id === selectedId)
  const selectedKind = selected ? itemsById.get(selected.itemId)?.kind : undefined
  const selectedLabel = selected && selectedKind ? qtyText(selected, selectedKind) : undefined

  const cursorClass = dragging
    ? 'cursor-grabbing'
    : tool === 'pan' || spaceDown
      ? 'cursor-grab'
      : cutoutTarget
        ? 'cursor-crosshair'
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
      : tool === 'select'
        ? selected
          ? 'Drag a corner to reshape, or the shape to move it · Delete to remove · Esc to deselect'
          : 'Select: click a shape'
        : tool === 'calibrate'
          ? draft.length === 0
            ? 'Calibrate: click one end of a dimension you know'
            : 'Now click the other end (hold Shift for straight)'
          : tool === 'measure'
            ? draft.length === 0
              ? 'Measure: click the start point'
              : 'Click the end point (hold Shift for straight)'
            : tool === 'count'
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
      className={`relative h-full w-full overflow-hidden bg-neutral-500 select-none ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onAuxClick={(e) => e.preventDefault()}
    >
      <canvas
        ref={baseRef}
        className="absolute top-0 left-0 bg-white shadow-lg"
        style={{ transformOrigin: '0 0' }}
      />
      <div
        ref={detailHostRef}
        className="pointer-events-none absolute top-0 left-0"
        style={{ transformOrigin: '0 0' }}
      />

      {view && boxSize.w > 0 && (
        <MeasureOverlay width={boxSize.w} height={boxSize.h} view={view} lines={overlayLines}>
          <TakeoffLayer
            scale={view.scale}
            takeoffs={takeoffs}
            items={itemsById}
            selectedId={selectedId}
            selectedLabel={selectedLabel}
            draft={takeoffDraft}
          />
        </MeasureOverlay>
      )}

      {hint && !calibLine && (
        <div
          data-testid="tool-hint"
          className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-center text-sm text-white"
        >
          {hint}
          <span className="text-white/60">
            {' · Space+drag to pan'}
            {tool !== 'select' || cutoutTarget ? ' · Esc to cancel' : ''}
          </span>
          {notice && <div className="mt-1 text-amber-300">⚠ {notice}</div>}
          {noScaleWarning && (
            <div className="mt-1 text-amber-300">
              ⚠ No scale on this sheet — these shapes won’t count in totals until you calibrate.
            </div>
          )}
        </div>
      )}

      {calibLine && (
        <CalibrateDialog
          distPt={distancePt(calibLine[0], calibLine[1])}
          onCancel={() => setCalibLine(null)}
          onApply={(mmPerPt) => {
            setCalibratedScale(sheet.id, mmPerPt)
            setCalibLine(null)
            setTool('measure')
          }}
        />
      )}

      <div
        className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg bg-white/95 p-1 text-sm shadow-md"
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

      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
        {label?.number && <strong className="font-semibold">{label.number}</strong>}
        {label?.title && <> {label.title}</>}
        {(label?.number || label?.title) && ' · '}
        {sheet.fileName} p{sheet.pageNumber} · {describePaperSize(sheet.widthPt, sheet.heightPt)}
      </div>

      {measured && (
        <div
          data-testid="measurement"
          className="pointer-events-none absolute bottom-12 left-3 rounded bg-blue-700 px-2.5 py-1 text-sm font-medium text-white"
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
