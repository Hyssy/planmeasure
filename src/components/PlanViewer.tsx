import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderPage, type RenderHandle, type SheetMeta } from '../lib/pdf'
import { distancePt, formatLength, realMm, type Point } from '../lib/scale'
import { describePaperSize } from '../lib/units'
import { ACTUAL_SIZE_SCALE, fitView, screenToPage, zoomAt, type View } from '../lib/view'
import { useApp } from '../store'
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
  const setCalibratedScale = useApp((s) => s.setCalibratedScale)

  /** Points placed so far for the line being drawn (calibrate or measure). */
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
  }, [])

  // Clear in-progress drawing when the sheet or tool changes.
  const drawingKey = `${sheet.id}|${tool}`
  const [lastDrawingKey, setLastDrawingKey] = useState(drawingKey)
  if (lastDrawingKey !== drawingKey) {
    setLastDrawingKey(drawingKey)
    resetDrawing()
  }

  // Space held = temporary pan; Esc cancels.
  const spaceHeld = useRef(false)
  const [spaceDown, setSpaceDown] = useState(false)
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.code === 'Space') {
        e.preventDefault()
        spaceHeld.current = true
        setSpaceDown(true)
      } else if (e.key === 'Escape') {
        resetDrawing()
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
  }, [resetDrawing])

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

    // Calibrate / Measure: click the start point, then the end point.
    const p = pagePointFromEvent(e, draft[0])
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
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (d && d.id === e.pointerId) {
      setView({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy })
      return
    }
    if (tool !== 'pan' && draft.length > 0 && viewRef.current) {
      setCursor(pagePointFromEvent(e, draft[0]))
    }
  }
  const endDrag = (e: React.PointerEvent) => {
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
  const toolColour = tool === 'calibrate' ? '#c2410c' : '#1d4ed8'
  if (draft.length === 1 && cursor) {
    overlayLines.push({
      points: [draft[0], cursor],
      colour: toolColour,
      dashed: true,
      label: tool === 'measure' ? lengthLabel(draft[0], cursor) : undefined,
    })
  } else if (draft.length === 1) {
    overlayLines.push({ points: draft, colour: toolColour })
  }
  if (measured) {
    overlayLines.push({ points: measured, colour: '#1d4ed8', label: lengthLabel(measured[0], measured[1]) })
  }
  if (calibLine) overlayLines.push({ points: calibLine, colour: '#c2410c' })

  const cursorClass = dragging
    ? 'cursor-grabbing'
    : tool === 'pan' || spaceDown
      ? 'cursor-grab'
      : 'cursor-crosshair'

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
        <MeasureOverlay width={boxSize.w} height={boxSize.h} view={view} lines={overlayLines} />
      )}

      {tool !== 'pan' && !calibLine && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-sm text-white">
          {tool === 'calibrate'
            ? draft.length === 0
              ? 'Calibrate: click one end of a dimension you know'
              : 'Now click the other end (hold Shift for straight)'
            : draft.length === 0
              ? 'Measure: click the start point'
              : 'Click the end point (hold Shift for straight)'}
          <span className="text-white/60"> · Space+drag to pan · Esc to cancel</span>
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
        {sheet.fileName} · page {sheet.pageNumber} · {describePaperSize(sheet.widthPt, sheet.heightPt)}
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
