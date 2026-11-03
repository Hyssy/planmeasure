import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderPage, type RenderHandle, type SheetMeta } from '../lib/pdf'
import { describePaperSize } from '../lib/units'
import { ACTUAL_SIZE_SCALE, fitView, zoomAt, type View } from '../lib/view'

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

  // ---- Panning: left-drag (Pan tool), middle-drag, or Space+drag ----
  const drag = useRef<{ id: number; sx: number; sy: number; view: View } | null>(null)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view || (e.button !== 0 && e.button !== 1)) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, view }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    setView({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy })
  }
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) {
      drag.current = null
      setDragging(false)
    }
  }

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
      className={`relative h-full w-full overflow-hidden bg-neutral-500 select-none ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
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
