import { useMemo, useState } from 'react'
import { usePanels } from '../panels'
import CollapsedRail, { CollapseButton } from './CollapsedRail'
import type { SheetMeta } from '../lib/pdf'
import { paperSizeFromPt } from '../lib/units'
import { isSuperseded, sheetGroups, versionNumber } from '../lib/versions'
import { sheetName, useApp, type SheetLabel, type SheetScale } from '../store'

export default function SheetList() {
  const open = usePanels((s) => s.open.sheets)
  const setPanel = usePanels((s) => s.setPanel)
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const labelAreas = useApp((s) => s.labelAreas)
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const supersedes = useApp((s) => s.supersedes)
  const [query, setQuery] = useState('')

  // each drawing once: its latest version, with earlier versions under it
  const groups = useMemo(() => sheetGroups(sheets.map((s) => s.id), supersedes), [sheets, supersedes])
  const byId = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets])
  const newVersions = Object.keys(supersedes).length
  const q = query.trim().toLowerCase()
  const matches = (id: string) => {
    const l = labels[id]
    return `${l?.number ?? ''} ${l?.title ?? ''} ${byId.get(id)?.fileName ?? ''}`.toLowerCase().includes(q)
  }
  const shown = q ? groups.filter((g) => matches(g.current) || g.older.some(matches)) : groups

  if (!open) return <CollapsedRail side="left" label={`Sheets${sheets.length ? ` (${sheets.length})` : ''}`} onOpen={() => setPanel('sheets', true)} testId="open-sheets" />

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-300 bg-white" data-testid="sheet-panel">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="section-label">
          Sheets {sheets.length > 0 && <span className="font-normal">({groups.length})</span>}
        </span>
        {newVersions > 0 && (
          <span className="rounded bg-graphite px-1.5 py-0.5 text-[11px] font-medium text-chalk" data-testid="new-version-count" title="Sheets replaced by a newer version">
            {newVersions} new version{newVersions === 1 ? '' : 's'}
          </span>
        )}
        <CollapseButton side="left" label="Sheet list" onClick={() => setPanel('sheets', false)} testId="hide-sheets" />
      </div>
      {sheets.length > 0 && (
        <div className="border-b border-neutral-200 px-2 py-1.5">
          <button
            onClick={() => setTool('areas')}
            className={`w-full rounded border px-2 py-1 text-left text-xs ${tool === 'areas' ? 'border-neutral-900 bg-neutral-100 font-medium' : 'border-neutral-300 hover:bg-neutral-50'}`}
            title="Show the app where the sheet number, title and scale are on one sheet, then read that spot on every sheet"
          >
            {Object.keys(labelAreas).length ? '✓ Title-block areas set · change' : 'Names not found? Set title-block areas'}
          </button>
        </div>
      )}
      {sheets.length > 1 && (
        <div className="border-b border-neutral-200 p-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number or title"
            aria-label="Search sheets"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm focus:border-graphite focus:outline-none"
          />
        </div>
      )}
      <ol className="flex-1 space-y-2 overflow-y-auto p-2">
        {shown.map((g) => {
          const sheet = byId.get(g.current)!
          return <SheetItem key={sheet.id} sheet={sheet} index={sheets.indexOf(sheet)} older={g.older.map((id) => byId.get(id)!)} />
        })}
        {q && shown.length === 0 && <li className="p-2 text-sm text-neutral-500">No sheets match “{query}”.</li>}
      </ol>
    </aside>
  )
}

function SheetItem({ sheet, index, older }: { sheet: SheetMeta; index: number; older: SheetMeta[] }) {
  const thumbnail = useApp((s) => s.thumbnails[sheet.id])
  const selected = useApp((s) => s.selectedSheetId === sheet.id)
  const selectSheet = useApp((s) => s.selectSheet)
  const scale = useApp((s) => s.scales[sheet.id])
  const detection = useApp((s) => s.detections[sheet.id])
  const label = useApp((s) => s.labels[sheet.id])
  const [editing, setEditing] = useState(false)
  const paper = paperSizeFromPt(sheet.widthPt, sheet.heightPt)
  const supersedes = useApp((s) => s.supersedes)
  const version = older.length ? versionNumber(sheet.id, supersedes) : 0

  return (
    <li
      className={`rounded-md border p-2 transition ${
        selected ? 'border-accent bg-signal-orange-4/25 ring-1 ring-accent' : 'border-neutral-200 hover:border-neutral-400'
      }`}
    >
      {version > 0 && (
        <div className="mb-1.5 flex items-center gap-1.5" data-testid="version-badge">
          <span className="rounded bg-graphite px-1.5 py-0.5 text-xs font-semibold text-chalk">v{version}</span>
          <span className="text-xs font-semibold text-graphite">New version</span>
        </div>
      )}
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
              <div className="text-[11px] text-accent-text">Read by OCR — please check</div>
            )}
            {label?.fromArea && !label.fromOcr && !label.edited && (
              <div className="text-[11px] text-neutral-500">From title-block areas</div>
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
      {older.length > 0 && <OlderVersions sheet={sheet} older={older} />}
    </li>
  )
}

/** Earlier versions of a sheet, folded under its latest version. */
function OlderVersions({ sheet, older }: { sheet: SheetMeta; older: SheetMeta[] }) {
  const [open, setOpen] = useState(false)
  const supersedes = useApp((s) => s.supersedes)
  const selectedSheetId = useApp((s) => s.selectedSheetId)
  const selectSheet = useApp((s) => s.selectSheet)
  const thumbnails = useApp((s) => s.thumbnails)
  const unmark = useApp((s) => s.unmarkVersion)
  const compare = useApp((s) => s.setCompareRequest)
  const previous = older[0]
  const showing = open || older.some((o) => o.id === selectedSheetId)
  return (
    <div className="mt-1.5 border-t border-neutral-200 pt-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => compare([{ newId: sheet.id, oldId: previous.id }])}
          className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs font-medium hover:bg-neutral-100"
          data-testid="compare-previous"
        >
          Compare with v{versionNumber(previous.id, supersedes)}
        </button>
        <button onClick={() => setOpen(!showing)} className="ml-auto rounded px-1 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100" aria-expanded={showing} data-testid="older-toggle">
          {showing ? '˄' : '˅'} {older.length} earlier
        </button>
      </div>
      {showing && (
        <ul className="mt-1 space-y-1">
          {older.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => selectSheet(o.id)}
                className={`flex w-full items-center gap-2 rounded border px-1.5 py-1 text-left text-xs ${o.id === selectedSheetId ? 'border-accent ring-1 ring-accent' : 'border-neutral-200 hover:border-neutral-400'}`}
                data-testid="older-version"
              >
                {thumbnails[o.id] ? <img src={thumbnails[o.id]} alt="" className="h-7 w-10 border border-neutral-200 bg-white object-contain opacity-60" /> : <span className="h-7 w-10 bg-neutral-100" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">v{versionNumber(o.id, supersedes)}</span> <span className="text-neutral-500">· superseded</span>
                  <span className="block truncate text-neutral-500" title={o.fileName}>
                    {o.fileName} · p{o.pageNumber}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => unmark(sheet.id)} className="text-[11px] text-neutral-500 hover:text-graphite hover:underline" title="Show this sheet and its previous version as two separate sheets">
              Not a new version? Separate them
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

function LabelEditor(props: { sheet: SheetMeta; label: SheetLabel | undefined; onDone: () => void }) {
  const setLabel = useApp((s) => s.setLabel)
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const supersedes = useApp((s) => s.supersedes)
  const markVersions = useApp((s) => s.markVersions)
  const [number, setNumber] = useState(props.label?.number ?? '')
  const [title, setTitle] = useState(props.label?.title ?? '')
  const [versionOf, setVersionOf] = useState('')
  // a sheet with no earlier version can be marked as the new version of another current sheet
  const canLink = !supersedes[props.sheet.id]
  const candidates = canLink ? sheets.filter((s) => s.id !== props.sheet.id && !isSuperseded(s.id, supersedes)) : []
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setLabel(props.sheet.id, number, title)
    if (versionOf) markVersions([{ newId: props.sheet.id, oldId: versionOf }])
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
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm font-semibold focus:border-graphite focus:outline-none"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title, e.g. Ground floor plan"
        aria-label="Sheet title"
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-graphite focus:outline-none"
      />
      {candidates.length > 0 && (
        <label className="block text-[11px] text-neutral-600">
          New version of another sheet?
          <select
            value={versionOf}
            onChange={(e) => setVersionOf(e.target.value)}
            className="mt-0.5 w-full rounded border border-neutral-300 px-1 py-0.5 text-xs text-graphite"
            data-testid="version-of"
          >
            <option value="">— no —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {sheetName(labels[c.id], sheets.indexOf(c))} {labels[c.id]?.title ?? ''} · {c.fileName} p{c.pageNumber}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-1">
        <button type="button" onClick={props.onDone} className="rounded px-2 py-0.5 text-xs hover:bg-neutral-200">
          Cancel
        </button>
        <button type="submit" className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-graphite hover:bg-accent-hover">
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
    ? ['bg-signal-orange-4 text-accent-text', resized ? 'Resized — calibrate' : multiple ? 'Several scales — choose' : 'No scale']
    : scale.status === 'detected'
      ? ['bg-signal-orange-4 text-accent-text', `${short} · verify`]
      : ['bg-steel-blue-4 text-graphite', `✓ ${short}`]
  return <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{text}</div>
}
