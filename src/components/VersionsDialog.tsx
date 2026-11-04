import { useState } from 'react'
import { versionNumber } from '../lib/versions'
import { sheetName, useApp } from '../store'
import CompareModule from './CompareModule'

/**
 * Shown after adding plans when some sheets have the same drawing number as
 * sheets already in the project: "are these new versions?"
 */
export default function VersionsDialog() {
  const matches = useApp((s) => s.pendingVersions)
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const supersedes = useApp((s) => s.supersedes)
  const thumbnails = useApp((s) => s.thumbnails)
  const markVersions = useApp((s) => s.markVersions)
  const dismiss = useApp((s) => s.dismissVersions)
  const [off, setOff] = useState<Set<string>>(new Set())
  if (!matches) return null

  const chosen = matches.filter((m) => !off.has(m.newId))
  const name = (id: string) => sheetName(labels[id], sheets.findIndex((s) => s.id === id))
  const fileOf = (id: string) => sheets.find((s) => s.id === id)?.fileName ?? ''
  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex max-h-[85vh] w-[40rem] flex-col rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite" data-testid="versions-dialog" role="dialog" aria-labelledby="versions-title">
        <h2 id="versions-title" className="text-base font-semibold">
          New versions of {matches.length} sheet{matches.length === 1 ? '' : 's'} found
        </h2>
        <p className="mt-1 text-neutral-600">
          {matches.length === 1 ? 'A sheet you added has' : `${matches.length} of the sheets you added have`} the same drawing number as {matches.length === 1 ? 'one' : 'sheets'} already in this project. Mark {matches.length === 1 ? 'it' : 'them'} as new versions?
        </p>
        <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
          <li>The new version takes the old one’s place in the sheet list, labelled as the new version. The old one stays underneath.</li>
          <li>Takeoffs and markups stay on the version they were drawn on.</li>
        </ul>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="section-label">Sheets</span>
          <span className="space-x-2">
            <button onClick={() => setOff(new Set())} className="text-accent-text hover:underline">
              Select all
            </button>
            <button onClick={() => setOff(new Set(matches.map((m) => m.newId)))} className="text-accent-text hover:underline">
              Select none
            </button>
          </span>
        </div>
        <ul className="mt-1 min-h-0 flex-1 overflow-y-auto rounded border border-neutral-200" data-testid="versions-list">
          {matches.map((m) => {
            const v = versionNumber(m.oldId, supersedes) + 1
            return (
              <li key={m.newId} className="border-b border-neutral-100 last:border-0">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50">
                  <input type="checkbox" checked={!off.has(m.newId)} onChange={() => toggle(m.newId)} />
                  {thumbnails[m.newId] ? <img src={thumbnails[m.newId]} alt="" className="h-8 w-12 border border-neutral-200 bg-white object-contain" /> : <span className="h-8 w-12 bg-neutral-100" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{name(m.newId)}</span> <span className="text-neutral-600">{labels[m.newId]?.title}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {fileOf(m.newId)} replaces v{v - 1} from {fileOf(m.oldId)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-graphite px-1.5 py-0.5 text-xs font-medium text-chalk">v{v}</span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={dismiss} className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100" data-testid="versions-separate">
            Keep as separate sheets
          </button>
          <button
            disabled={!chosen.length}
            onClick={() => markVersions(chosen)}
            className="rounded border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-40"
            data-testid="versions-mark"
          >
            Mark as new versions
          </button>
          <button
            autoFocus
            disabled={!chosen.length}
            onClick={() => markVersions(chosen, true)}
            className="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover disabled:opacity-40"
            data-testid="versions-compare"
          >
            Mark and compare changes
          </button>
        </div>
      </div>
    </div>
  )
}

/** Opens Compare revisions when something asks for it (the dialog above, or the sheet list). */
export function CompareRequest() {
  const pairs = useApp((s) => s.compareRequest)
  const clear = useApp((s) => s.setCompareRequest)
  if (!pairs) return null
  return <CompareModule versionPairs={pairs} onClose={() => clear(null)} />
}
