import { useState } from 'react'
import { exportMarkedUpPdf, markedSheetIds, sheetsToExport, type PageChoice, type PdfExportOptions } from '../exportPdf'
import { sheetName, useApp } from '../store'

/** Choose pages and layers, then export a marked-up PDF. */
export default function ExportPdfDialog({ onClose }: { onClose: () => void }) {
  const state = useApp()
  const current = state.sheets.findIndex((s) => s.id === state.selectedSheetId)
  const [opts, setOpts] = useState<PdfExportOptions>({
    pages: 'marked',
    markups: state.showMarkups,
    takeoffs: state.showTakeoffs,
    labels: state.showTakeoffs,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const markedCount = markedSheetIds(state, opts).size
  const count = sheetsToExport(state, opts).length

  const choice = (value: PageChoice, label: string, detail: string) => (
    <label className="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-neutral-50">
      <input type="radio" name="pages" className="mt-1" checked={opts.pages === value} onChange={() => setOpts({ ...opts, pages: value })} />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-[26rem] rounded-lg bg-white p-4 text-sm shadow-xl" data-testid="export-pdf-dialog" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <h2 className="text-base font-semibold">Export marked-up PDF</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Shapes are drawn into the pages (flattened). The original drawings stay as sharp as before.
        </p>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Pages</legend>
          {choice('current', 'This page', current >= 0 ? sheetName(state.labels[state.selectedSheetId!], current) : 'No sheet selected')}
          {choice('marked', 'Marked-up pages only', `${markedCount} page${markedCount === 1 ? '' : 's'} with something drawn on them`)}
          {choice('all', 'Whole document', `All ${state.sheets.length} page${state.sheets.length === 1 ? '' : 's'}, in sheet-list order`)}
        </fieldset>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Include</legend>
          <label className="flex items-center gap-2 p-1">
            <input type="checkbox" checked={opts.markups} onChange={(e) => setOpts({ ...opts, markups: e.target.checked })} /> Markups
          </label>
          <label className="flex items-center gap-2 p-1">
            <input type="checkbox" checked={opts.takeoffs} onChange={(e) => setOpts({ ...opts, takeoffs: e.target.checked, labels: e.target.checked && opts.labels })} /> Takeoff shapes
          </label>
          <label className={`flex items-center gap-2 p-1 pl-6 ${opts.takeoffs ? '' : 'opacity-40'}`}>
            <input type="checkbox" disabled={!opts.takeoffs} checked={opts.labels} onChange={(e) => setOpts({ ...opts, labels: e.target.checked })} /> Item names and quantities on the shapes
          </label>
        </fieldset>

        {error && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-neutral-500" data-testid="export-count">
            {count} page{count === 1 ? '' : 's'} will be exported
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="rounded px-3 py-1.5 hover:bg-neutral-100">
              Cancel
            </button>
            <button
              disabled={busy || count === 0}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await exportMarkedUpPdf(opts)
                  onClose()
                } catch (err) {
                  console.error(err)
                  setError((err as Error).message || 'The export didn’t work.')
                } finally {
                  setBusy(false)
                }
              }}
              className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
