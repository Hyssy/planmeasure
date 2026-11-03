import { useState } from 'react'
import type { SheetMeta } from '../lib/pdf'
import { paperSizeFromPt } from '../lib/units'
import { sheetName, useApp, type SheetLabel, type SheetScale } from '../store'

export default function SheetList() {
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const shown = q
    ? sheets.filter((sheet) => {
        const l = labels[sheet.id]
        return `${l?.number ?? ''} ${l?.title ?? ''} ${sheet.fileName}`.toLowerCase().includes(q)
      })
    : sheets

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-300 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        Sheets {sheets.length > 0 && <span className="font-normal">({sheets.length})</span>}
      </div>
      {sheets.length > 1 && (
        <div className="border-b border-neutral-200 p-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number or title"
            aria-label="Search sheets"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}
      <ol className="flex-1 space-y-2 overflow-y-auto p-2">
        {shown.map((sheet) => (
          <SheetItem key={sheet.id} sheet={sheet} index={sheets.indexOf(sheet)} />
        ))}
        {q && shown.length === 0 && <li className="p-2 text-sm text-neutral-500">No sheets match “{query}”.</li>}
      </ol>
    </aside>
  )
}

function SheetItem({ sheet, index }: { sheet: SheetMeta; index: number }) {
  const thumbnail = useApp((s) => s.thumbnails[sheet.id])
  const selected = useApp((s) => s.selectedSheetId === sheet.id)
  const selectSheet = useApp((s) => s.selectSheet)
  const scale = useApp((s) => s.scales[sheet.id])
  const detection = useApp((s) => s.detections[sheet.id])
  const label = useApp((s) => s.labels[sheet.id])
  const [editing, setEditing] = useState(false)
  const paper = paperSizeFromPt(sheet.widthPt, sheet.heightPt)

  return (
    <li
      className={`rounded-md border p-2 transition ${
        selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-neutral-200 hover:border-neutral-400'
      }`}
    >
      <button onClick={() => selectSheet(sheet.id)} className="block w-full text-left" aria-label={`Open ${sheetName(label, index)}`}>
        <div
          className="flex items-center justify-center bg-neutral-100"
          style={{ aspectRatio: `${sheet.widthPt} / ${sheet.heightPt}` }}
        >
          {thumbnail ? (
            <img src={thumbnail} alt="" className="h-full w-full border border-neutral-200 bg-white object-contain" />
          ) : (
            <span className="text-xs text-neutral-400">Loading…</span>
          )}
        </div>
      </button>

      {editing ? (
        <LabelEditor
          sheet={sheet}
          label={label}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="mt-1.5 flex items-start gap-1">
          <button onClick={() => selectSheet(sheet.id)} className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span data-testid="sheet-number" className={`truncate font-semibold ${label?.number ? '' : 'text-neutral-400'}`}>
                {label?.number || `Sheet ${index + 1}`}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {paper.name ?? `${Math.round(paper.widthMm)}×${Math.round(paper.heightMm)}`}
              </span>
            </div>
            <div data-testid="sheet-title" className={`text-xs leading-snug ${label?.title ? 'text-neutral-800' : 'text-neutral-400 italic'}`}>
              {label?.title ||
                (!detection?.done
                  ? 'Reading…'
                  : detection.ocr === 'pending' || detection.ocr === 'running'
                    ? 'Reading text (OCR)…'
                    : detection.ocr === 'failed'
                      ? 'Couldn’t read this sheet'
                      : 'No title found')}
            </div>
            {label?.fromOcr && !label.edited && (label.number || label.title) && (
              <div className="text-[11px] text-amber-800">Read by OCR — please check</div>
            )}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
            title="Edit sheet number and title"
          >
            Edit
          </button>
        </div>
      )}

      <ScaleBadge
        scale={scale}
        multiple={(detection?.candidates.length ?? 0) > 1}
        resized={(detection?.mismatched.length ?? 0) > 0}
      />
      <div className="truncate text-xs text-neutral-500" title={sheet.fileName}>
        {sheet.fileName} · p{sheet.pageNumber}
      </div>
    </li>
  )
}

function LabelEditor(props: { sheet: SheetMeta; label: SheetLabel | undefined; onDone: () => void }) {
  const setLabel = useApp((s) => s.setLabel)
  const [number, setNumber] = useState(props.label?.number ?? '')
  const [title, setTitle] = useState(props.label?.title ?? '')
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setLabel(props.sheet.id, number, title)
    props.onDone()
  }
  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && props.onDone()} className="mt-1.5 space-y-1">
      <input
        autoFocus
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Sheet number, e.g. A-101"
        aria-label="Sheet number"
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm font-semibold focus:border-blue-500 focus:outline-none"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title, e.g. Ground floor plan"
        aria-label="Sheet title"
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none"
      />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={props.onDone} className="rounded px-2 py-0.5 text-xs hover:bg-neutral-200">
          Cancel
        </button>
        <button type="submit" className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700">
          Save
        </button>
      </div>
    </form>
  )
}

function ScaleBadge(props: { scale: SheetScale | undefined; multiple: boolean; resized: boolean }) {
  const { scale, multiple, resized } = props
  const short = scale?.source === 'calibrated' ? 'Calibrated' : scale?.label.split(' (')[0]
  const [cls, text] = !scale
    ? ['bg-amber-100 text-amber-900', resized ? '⚠ Resized — calibrate' : multiple ? '⚠ Several scales — choose' : '⚠ No scale']
    : scale.status === 'detected'
      ? ['bg-amber-100 text-amber-900', `${short} · verify`]
      : ['bg-green-100 text-green-800', `✓ ${short}`]
  return <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{text}</div>
}
