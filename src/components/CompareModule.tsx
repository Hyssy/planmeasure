import { useEffect, useMemo, useRef, useState } from 'react'
import { compareSheets, pairSheets, type Comparison } from '../lib/compare'
import { COMPARE_PX, renderTo, toGrey } from '../lib/compareRender'
import { getPageText, loadPdfBytes, newFileId, type SheetMeta } from '../lib/pdf'
import { detectSheetLabel } from '../lib/sheetLabel'
import { isSuperseded, type VersionMatch } from '../lib/versions'
import { sheetName, useApp } from '../store'

const ADDED = [37, 99, 235] // blue
const REMOVED = [249, 115, 22] // orange
const SAME = [150, 150, 150]

interface OtherSheet {
  sheet: SheetMeta
  number: string
}

interface Pair {
  /** this project's sheet */
  mine: SheetMeta
  /** the other version's sheet, if matched */
  other: OtherSheet | null
}

/** Compare this project's sheets with another version of the plans. */
export default function CompareModule({ onClose, versionPairs }: { onClose: () => void; versionPairs?: VersionMatch[] }) {
  const [projectIs, setProjectIs] = useState<'new' | 'old'>('new')
  const [others, setOthers] = useState<OtherSheet[] | null>(null)
  const [loading, setLoading] = useState(false)
  const allSheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const supersedes = useApp((s) => s.supersedes)
  // compare against the current version of each drawing
  const sheets = useMemo(() => allSheets.filter((s) => !isSuperseded(s.id, supersedes)), [allSheets, supersedes])
  /** new versions in this project, paired with the version they replace */
  const inProject = (list: VersionMatch[]): Pair[] =>
    list.flatMap((m) => {
      const mine = allSheets.find((s) => s.id === m.newId)
      const old = allSheets.find((s) => s.id === m.oldId)
      return mine && old ? [{ mine, other: { sheet: old, number: labels[old.id]?.number ?? '' } }] : []
    })
  const [pairs, setPairs] = useState<Pair[] | null>(() => (versionPairs ? inProject(versionPairs) : null))
  const [viewing, setViewing] = useState(!!versionPairs)
  const versionCount = Object.keys(supersedes).length

  const openOther = async (files: File[]) => {
    setLoading(true)
    const loaded: OtherSheet[] = []
    for (const f of files) {
      const fileSheets = await loadPdfBytes(new Uint8Array(await f.arrayBuffer()), f.name, `cmp-${newFileId()}`)
      for (const sh of fileSheets) {
        let number = ''
        try {
          const text = await getPageText(sh)
          number = detectSheetLabel(text.items, sh.widthPt, sh.heightPt, sh.fileName, fileSheets.length).number ?? ''
        } catch {
          // no text: paired by page order
        }
        loaded.push({ sheet: sh, number })
      }
    }
    const match = pairSheets(
      sheets.map((s) => labels[s.id]?.number),
      loaded.map((o) => o.number),
    )
    setOthers(loaded)
    setPairs(sheets.map((s, i) => ({ mine: s, other: match[i] >= 0 ? loaded[match[i]] : null })))
    setLoading(false)
  }

  if (viewing && pairs) return <CompareView pairs={pairs} projectIs={projectIs} onBack={versionPairs ? onClose : () => setViewing(false)} backLabel={versionPairs ? 'Back' : 'Pairs…'} onClose={onClose} />

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-[36rem] overflow-y-auto rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite" data-testid="compare-setup" role="dialog">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Compare revisions</h2>
          <button onClick={onClose} className="rounded px-2 hover:bg-neutral-100" aria-label="Close">
            ×
          </button>
        </div>
        <p className="mt-1 text-neutral-600">Compare this project’s sheets with another version of the plans. The other version is only opened for comparing; it isn’t added to your project.</p>

        {versionCount > 0 && (
          <div className="mt-3 rounded border border-steel-blue-3 bg-steel-blue-4 p-2">
            <p>
              This project has {versionCount} sheet{versionCount === 1 ? '' : 's'} with a newer version.
            </p>
            <button
              onClick={() => {
                setProjectIs('new')
                setPairs(inProject(Object.entries(supersedes).map(([newId, oldId]) => ({ newId, oldId }))))
                setViewing(true)
              }}
              className="mt-1.5 rounded bg-accent px-3 py-1 text-xs font-medium text-graphite hover:bg-accent-hover"
              data-testid="compare-in-project"
            >
              Compare each new version with its previous one
            </button>
            <p className="mt-1.5 text-xs text-neutral-500">Or compare with plans that aren’t in this project:</p>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <span className="text-neutral-600">This project is the</span>
          {(['new', 'old'] as const).map((v) => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" name="projectIs" checked={projectIs === v} onChange={() => setProjectIs(v)} /> {v === 'new' ? 'new version' : 'old version'}
            </label>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="font-medium">Open the {projectIs === 'new' ? 'old' : 'new'} version’s PDF(s)</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="mt-1 block text-xs"
            data-testid="compare-file"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) void openOther(files)
            }}
          />
        </label>
        {loading && <p className="mt-2 text-neutral-500">Opening and matching sheets…</p>}

        {pairs && others && (
          <>
            <h3 className="section-label mt-4">Sheet pairs</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Matched by sheet number where possible. Change any pairing if it’s wrong.</p>
            <table className="mt-2 w-full text-xs" data-testid="compare-pairs">
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={p.mine.id} className="border-b border-neutral-100">
                    <td className="py-1 pr-2 font-medium">{sheetName(labels[p.mine.id], sheets.indexOf(p.mine))}</td>
                    <td className="py-1 text-neutral-500">↔</td>
                    <td className="py-1 pl-2">
                      <select
                        value={p.other ? others.indexOf(p.other) : -1}
                        onChange={(e) => {
                          const j = Number(e.target.value)
                          setPairs(pairs.map((q, k) => (k === i ? { ...q, other: j >= 0 ? others[j] : null } : q)))
                        }}
                        className="w-full rounded border border-neutral-300 bg-white px-1 py-0.5"
                      >
                        <option value={-1}>— not compared —</option>
                        {others.map((o, j) => (
                          <option key={o.sheet.id} value={j}>
                            {o.number || `Page ${o.sheet.pageNumber}`} · {o.sheet.fileName}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 hover:bg-neutral-100">
            Cancel
          </button>
          <button
            disabled={!pairs?.some((p) => p.other)}
            onClick={() => setViewing(true)}
            className="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover disabled:opacity-40"
            data-testid="compare-start"
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  )
}

type Mode = 'slider' | 'flicker' | 'overlay'

/** Flicker speeds: how long each version shows (ms). */
const FLICKER_SPEEDS = [500, 1000, 2000]

function CompareView(props: { pairs: Pair[]; projectIs: 'new' | 'old'; onBack: () => void; backLabel: string; onClose: () => void }) {
  const compared = useMemo(() => props.pairs.filter((p) => p.other), [props.pairs])
  const selectedSheetId = useApp((s) => s.selectedSheetId)
  const labels = useApp((s) => s.labels)
  const sheets = useApp((s) => s.sheets)
  const addMarkup = useApp((s) => s.addMarkup)
  const selectSheet = useApp((s) => s.selectSheet)
  const [index, setIndex] = useState(() => Math.max(0, compared.findIndex((p) => p.mine.id === selectedSheetId)))
  const [mode, setMode] = useState<Mode>('slider')
  // flicker: which version is showing, how fast it swaps, and whether it's swapping
  const [flickNew, setFlickNew] = useState(true)
  const [flickMs, setFlickMs] = useState(1000)
  const [flickOn, setFlickOn] = useState(true)
  const [slider, setSlider] = useState(50)
  const [highlight, setHighlight] = useState(true)
  const [box, setBox] = useState({ w: 1, h: 1 })
  const [result, setResult] = useState<{ key: string; old: string; new: string; overlay: string; cmp: Comparison; w: number; h: number; sNew: number; sOld: number } | null>(null)
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 })
  const [added, setAdded] = useState<{ key: string; n: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const pair = compared[index]
  const key = `${pair?.mine.id}|${pair?.other?.sheet.id}`
  const busy = !result || result.key !== key

  // Render both versions to the same size and compare them.
  useEffect(() => {
    if (!pair?.other) return
    let live = true
    const newSheet = props.projectIs === 'new' ? pair.mine : pair.other.sheet
    const oldSheet = props.projectIs === 'new' ? pair.other.sheet : pair.mine
    const thisKey = `${pair.mine.id}|${pair.other.sheet.id}`
    void (async () => {
      const longPt = Math.max(newSheet.widthPt, newSheet.heightPt)
      const w = Math.round((newSheet.widthPt / longPt) * COMPARE_PX)
      const h = Math.round((newSheet.heightPt / longPt) * COMPARE_PX)
      const [nc, oc] = await Promise.all([renderTo(newSheet, w, h), renderTo(oldSheet, w, h)])
      await new Promise((r) => setTimeout(r, 0)) // let "Comparing…" show before the heavy part
      const cmp = compareSheets(toGrey(oc), toGrey(nc))
      // overlay picture: unchanged grey, added blue, removed orange
      const ov = document.createElement('canvas')
      ov.width = w
      ov.height = h
      const ctx = ov.getContext('2d')!
      const img = ctx.createImageData(w, h)
      for (let i = 0; i < w * h; i++) {
        const c = cmp.added[i] ? ADDED : cmp.removed[i] ? REMOVED : cmp.same[i] ? SAME : null
        img.data[i * 4] = c ? c[0] : 255
        img.data[i * 4 + 1] = c ? c[1] : 255
        img.data[i * 4 + 2] = c ? c[2] : 255
        img.data[i * 4 + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      // shift the old render the same way it was lined up, so the slider matches too
      const oShift = document.createElement('canvas')
      oShift.width = w
      oShift.height = h
      const octx = oShift.getContext('2d')!
      octx.fillStyle = '#fff'
      octx.fillRect(0, 0, w, h)
      octx.drawImage(oc, cmp.offset.dx, cmp.offset.dy)
      if (!live) return
      setResult({ key: thisKey, old: oShift.toDataURL(), new: nc.toDataURL(), overlay: ov.toDataURL(), cmp, w, h, sNew: w / newSheet.widthPt, sOld: w / oldSheet.widthPt })
      setZoom({ k: 1, x: 0, y: 0 })
    })()
    return () => {
      live = false
    }
  }, [pair, props.projectIs])

  // Flicker: swap between the versions every flickMs.
  useEffect(() => {
    if (mode !== 'flicker' || !flickOn) return
    const t = window.setInterval(() => setFlickNew((v) => !v), flickMs)
    return () => window.clearInterval(t)
  }, [mode, flickOn, flickMs])

  // Space flicks by hand (and pauses the automatic swap).
  useEffect(() => {
    if (mode !== 'flicker') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, select, textarea')) return
      e.preventDefault()
      setFlickOn(false)
      setFlickNew((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  // Track the viewing area's size.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Wheel to zoom.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      setZoom((z) => {
        const k = Math.min(12, Math.max(1, z.k * f))
        const cx = e.clientX - r.left
        const cy = e.clientY - r.top
        return { k, x: cx - ((cx - z.x) * k) / z.k, y: cy - ((cy - z.y) * k) / z.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const drag = useRef<{ mode: 'pan' | 'slider'; sx: number; sy: number; z: typeof zoom } | null>(null)
  const display = result ? Math.min(box.w / result.w, (box.h - 8) / result.h) : 1

  const zoomTo = (b: { x: number; y: number; w: number; h: number }) => {
    if (!result) return
    const k = Math.min(12, Math.max(1, Math.min(box.w / (b.w * display * 1.8), box.h / (b.h * display * 1.8))))
    const cx = (b.x + b.w / 2) * display
    const cy = (b.y + b.h / 2) * display
    setZoom({ k, x: box.w / 2 - cx * k, y: box.h / 2 - cy * k })
  }

  /** Turn the found changes into revision clouds on this project's sheet. */
  const addClouds = () => {
    if (!result) return
    const s = props.projectIs === 'new' ? result.sNew : result.sOld
    const dx = props.projectIs === 'new' ? 0 : result.cmp.offset.dx
    const dy = props.projectIs === 'new' ? 0 : result.cmp.offset.dy
    const pad = 6
    for (const b of result.cmp.boxes) {
      addMarkup({
        sheetId: pair.mine.id,
        type: 'cloud',
        points: [
          { x: (b.x - dx - pad) / s, y: (b.y - dy - pad) / s },
          { x: (b.x - dx + b.w + pad) / s, y: (b.y - dy + b.h + pad) / s },
        ],
        colour: '#e11d48',
        width: 3,
      })
    }
    setAdded({ key, n: result.cmp.boxes.length })
  }

  const nameOf = (p: Pair) => sheetName(labels[p.mine.id], sheets.indexOf(p.mine))
  const changes = !busy && result ? result.cmp.boxes : []
  const addedHere = added?.key === key ? added.n : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-sm text-graphite" data-testid="compare-view">
      <div className="flex flex-wrap items-center gap-3 bg-graphite px-3 py-2 text-chalk">
        <span className="font-bold">Compare revisions</span>
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="rounded px-2 py-0.5 hover:bg-white/10 disabled:opacity-30" aria-label="Previous sheet">
          ‹
        </button>
        <span data-testid="compare-sheet">
          {nameOf(pair)} <span className="text-foundation-grey">({index + 1} of {compared.length})</span>
        </span>
        <button onClick={() => setIndex((i) => Math.min(compared.length - 1, i + 1))} disabled={index >= compared.length - 1} className="rounded px-2 py-0.5 hover:bg-white/10 disabled:opacity-30" aria-label="Next sheet">
          ›
        </button>
        <div className="h-5 w-px bg-white/20" />
        {(['slider', 'flicker', 'overlay'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              if (m === 'flicker') setFlickOn(true)
            }}
            aria-pressed={mode === m}
            className={`rounded px-2.5 py-1 ${mode === m ? 'bg-accent text-graphite' : 'hover:bg-white/10'}`}
            data-testid={`compare-mode-${m}`}
            title={m === 'flicker' ? 'Swap between the old and new version so small changes jump out' : undefined}
          >
            {m === 'slider' ? 'Slider' : m === 'flicker' ? 'Flicker' : 'Overlay'}
          </button>
        ))}
        {mode === 'flicker' && (
          <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-xs" data-testid="flicker-controls">
            <button onClick={() => setFlickOn(!flickOn)} className="rounded px-1.5 py-0.5 hover:bg-white/10" data-testid="flicker-play">
              {flickOn ? 'Pause' : 'Play'}
            </button>
            <select value={flickMs} onChange={(e) => setFlickMs(Number(e.target.value))} className="rounded bg-graphite px-1 py-0.5 text-chalk" aria-label="Flicker speed" data-testid="flicker-speed">
              {FLICKER_SPEEDS.map((ms) => (
                <option key={ms} value={ms}>
                  every {ms / 1000} s
                </option>
              ))}
            </select>
            <span className="text-foundation-grey">Space to flick by hand</span>
          </span>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight changes
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={props.onBack} className="rounded px-2.5 py-1 hover:bg-white/10">
            {props.backLabel}
          </button>
          <button onClick={props.onClose} className="rounded border border-chalk/60 px-2.5 py-1 hover:bg-white/10" data-testid="compare-close">
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={boxRef}
          className="relative min-w-0 flex-1 cursor-grab overflow-hidden bg-steel-blue-2 select-none"
          onPointerDown={(e) => {
            const onHandle = (e.target as HTMLElement).dataset.handle === 'slider'
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            drag.current = { mode: onHandle ? 'slider' : 'pan', sx: e.clientX, sy: e.clientY, z: zoom }
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d || !result) return
            if (d.mode === 'pan') setZoom({ ...d.z, x: d.z.x + e.clientX - d.sx, y: d.z.y + e.clientY - d.sy })
            else {
              const r = boxRef.current!.getBoundingClientRect()
              const xImg = (e.clientX - r.left - zoom.x) / zoom.k / display
              setSlider(Math.min(100, Math.max(0, (xImg / result.w) * 100)))
            }
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {busy && <div className="absolute inset-0 z-10 flex items-center justify-center text-chalk">Comparing…</div>}
          {mode === 'flicker' && !busy && (
            <div
              className={`pointer-events-none absolute top-3 left-3 z-10 rounded px-3 py-1 text-lg font-bold ${flickNew ? 'bg-graphite text-chalk' : 'bg-accent text-graphite'}`}
              data-testid="flicker-label"
            >
              {flickNew ? 'NEW' : 'OLD'}
            </div>
          )}
          {result && !busy && (
            <div className="absolute top-0 left-0" style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})`, transformOrigin: '0 0', width: result.w * display, height: result.h * display }}>
              {mode === 'overlay' ? (
                <img src={result.overlay} alt="Overlay of both versions" className="absolute inset-0 h-full w-full bg-white" draggable={false} data-testid="compare-overlay" />
              ) : mode === 'flicker' ? (
                <>
                  {/* both stay loaded; only one is visible, so the swap is instant */}
                  <img src={result.old} alt="Old version" className="absolute inset-0 h-full w-full bg-white" style={{ visibility: flickNew ? 'hidden' : 'visible' }} draggable={false} />
                  <img src={result.new} alt="New version" className="absolute inset-0 h-full w-full bg-white" style={{ visibility: flickNew ? 'visible' : 'hidden' }} draggable={false} />
                </>
              ) : (
                <>
                  <img src={result.new} alt="New version" className="absolute inset-0 h-full w-full bg-white" draggable={false} />
                  <img src={result.old} alt="Old version" className="absolute inset-0 h-full w-full bg-white" style={{ clipPath: `inset(0 ${100 - slider}% 0 0)` }} draggable={false} />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: `${slider}%` }} />
                  <div
                    data-handle="slider"
                    data-testid="compare-slider"
                    className="absolute top-1/2 h-10 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-accent"
                    style={{ left: `${slider}%`, transform: `translate(-50%, -50%) scale(${1 / zoom.k})` }}
                    title="Drag to compare"
                  />
                  <div className="pointer-events-none absolute top-2 left-2 rounded bg-graphite/85 px-1.5 py-0.5 text-xs text-chalk" style={{ transform: `scale(${1 / zoom.k})`, transformOrigin: '0 0' }}>
                    Old
                  </div>
                  <div className="pointer-events-none absolute top-2 right-2 rounded bg-graphite/85 px-1.5 py-0.5 text-xs text-chalk" style={{ transform: `scale(${1 / zoom.k})`, transformOrigin: '100% 0' }}>
                    New
                  </div>
                </>
              )}
              {highlight && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${result.w} ${result.h}`}>
                  {changes.map((b, i) => (
                    <g key={i}>
                      <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke={b.added >= b.removed ? '#2563eb' : '#f97316'} strokeWidth={3 / zoom.k / display} strokeDasharray={`${10 / zoom.k / display} ${6 / zoom.k / display}`} />
                      <text x={b.x - 4} y={b.y - 8} fontSize={16 / zoom.k / display} fontWeight="bold" fill="#1f1f1f">
                        {i + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          )}
        </div>

        <aside className="flex w-64 shrink-0 flex-col border-l border-neutral-300">
          <div className="border-b border-neutral-200 px-3 py-2">
            <span className="section-label">Changes</span>
            <p className="mt-1 text-xs" data-testid="compare-count">
              {busy ? 'Comparing…' : changes.length === 0 ? 'No changes found.' : `${changes.length} change${changes.length === 1 ? '' : 's'} found`}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              <span className="font-semibold text-[#2563eb]">Blue</span> = added in the new version · <span className="font-semibold text-[#c2410c]">orange</span> = removed from the old one.
            </p>
            {result && (result.cmp.offset.dx !== 0 || result.cmp.offset.dy !== 0) && (
              <p className="mt-1 text-xs text-neutral-500">The versions were lined up automatically (the old one sits slightly differently on its page).</p>
            )}
          </div>
          <ol className="flex-1 overflow-y-auto" data-testid="compare-list">
            {changes.map((b, i) => (
              <li key={i}>
                <button onClick={() => zoomTo(b)} className="flex w-full items-center gap-2 border-b border-neutral-100 px-3 py-1.5 text-left text-xs hover:bg-neutral-50">
                  <span className="w-5 font-bold">{i + 1}</span>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.added >= b.removed ? '#2563eb' : '#f97316' }} />
                  <span>{b.added && b.removed ? 'Changed' : b.added ? 'Added' : 'Removed'}</span>
                  <span className="ml-auto text-neutral-500">zoom</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="border-t border-neutral-200 p-3">
            <button
              onClick={addClouds}
              disabled={!changes.length || addedHere !== null}
              className="w-full rounded bg-accent px-3 py-1.5 text-xs font-medium text-graphite hover:bg-accent-hover disabled:opacity-40"
              data-testid="compare-clouds"
            >
              {addedHere !== null ? `${addedHere} cloud${addedHere === 1 ? '' : 's'} added to ${nameOf(pair)}` : 'Add changes as clouds'}
            </button>
            {addedHere !== null && (
              <button
                onClick={() => {
                  selectSheet(pair.mine.id)
                  props.onClose()
                }}
                className="mt-2 w-full text-xs text-accent-text hover:underline"
              >
                Close and view the sheet
              </button>
            )}
            <p className="mt-1 text-xs text-neutral-500">Clouds go on this project’s sheet as markups (Ctrl+Z can undo).</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
