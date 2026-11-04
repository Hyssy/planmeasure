import { useState } from 'react'
import { versionNumber, type VersionMatch } from '../lib/versions'
import { sheetName, useApp, type PendingVersions } from '../store'
import CompareModule from './CompareModule'

/**
 * Shown after adding plans when some sheets have the same drawing number as
 * sheets already in the project: "are these new versions?"
 */
export default function VersionsDialog() {
  const pending = useApp((s) => s.pendingVersions)
  if (!pending) return null
  return <VersionsBox key={pending.added.join(',')} pending={pending} />
}

function VersionsBox({ pending }: { pending: PendingVersions }) {
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const supersedes = useApp((s) => s.supersedes)
  const thumbnails = useApp((s) => s.thumbnails)
  const markVersions = useApp((s) => s.markVersions)
  const dismiss = useApp((s) => s.dismissVersions)
  // which existing sheet each added sheet replaces ('' = not a new version); starts from the automatic matches
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(pending.matches.map((m) => [m.newId, m.oldId])))
  const [showAll, setShowAll] = useState(false)

  const auto = new Set(pending.matches.map((m) => m.newId))
  const name = (id: string) => sheetName(labels[id], sheets.findIndex((s) => s.id === id))
  const fileOf = (id: string) => sheets.find((s) => s.id === id)?.fileName ?? ''
  const chosen: VersionMatch[] = Object.entries(choice)
    .filter(([, o]) => o)
    .map(([newId, oldId]) => ({ newId, oldId }))
  const taken = new Map(chosen.map((m) => [m.oldId, m.newId]))
  // matched (automatically or by hand) sheets first; the rest on request
  const rows = pending.added.filter((id) => showAll || auto.has(id) || choice[id])
  const others = pending.added.length - rows.length
  const n = pending.matches.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex max-h-[85vh] w-[46rem] flex-col rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite" data-testid="versions-dialog" role="dialog" aria-labelledby="versions-title">
        <h2 id="versions-title" className="text-base font-semibold">
          New versions of {n} sheet{n === 1 ? '' : 's'} found
        </h2>
        <p className="mt-1 text-neutral-600">
          {n === 1 ? 'A sheet you added has' : `${n} of the sheets you added have`} the same drawing number as {n === 1 ? 'one' : 'sheets'} already in this project. Check the matches below — change any that are wrong, or match others by hand.
        </p>
        <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
          <li>The new version takes the old one’s place in the sheet list, labelled as the new version. The old one stays underneath.</li>
          <li>Takeoffs and markups stay on the version they were drawn on.</li>
        </ul>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="section-label">Sheets you added</span>
          <button onClick={() => setChoice({})} className="text-accent-text hover:underline">
            Clear all matches
          </button>
        </div>
        <ul className="mt-1 min-h-0 flex-1 overflow-y-auto rounded border border-neutral-200" data-testid="versions-list">
          {rows.map((id) => {
            const old = choice[id] ?? ''
            const v = old ? versionNumber(old, supersedes) + 1 : 0
            return (
              <li key={id} className="flex items-center gap-2 border-b border-neutral-100 px-2 py-1.5 last:border-0">
                {thumbnails[id] ? <img src={thumbnails[id]} alt="" className="h-8 w-12 border border-neutral-200 bg-white object-contain" /> : <span className="h-8 w-12 bg-neutral-100" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{name(id)}</span> <span className="text-neutral-600">{labels[id]?.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {fileOf(id)}
                    {old && !auto.has(id) && <span className="text-accent-text"> · matched by hand</span>}
                    {old && auto.has(id) && pending.matches.find((m) => m.newId === id)?.oldId !== old && <span className="text-accent-text"> · match changed</span>}
                  </span>
                </span>
                <span className="text-xs text-neutral-500">replaces</span>
                <select
                  value={old}
                  onChange={(e) => setChoice({ ...choice, [id]: e.target.value })}
                  className={`w-52 rounded border px-1 py-0.5 text-xs ${old ? 'border-graphite' : 'border-neutral-300 text-neutral-500'}`}
                  aria-label={`Which sheet ${name(id)} replaces`}
                  data-testid="versions-replaces"
                >
                  <option value="">— not a new version —</option>
                  {pending.existing.map((e) => (
                    <option key={e} value={e} disabled={taken.has(e) && taken.get(e) !== id}>
                      {name(e)} {labels[e]?.title ?? ''} · {fileOf(e)}
                    </option>
                  ))}
                </select>
                <span className={`w-7 shrink-0 rounded px-1 py-0.5 text-center text-xs font-medium ${v ? 'bg-graphite text-chalk' : 'text-neutral-400'}`}>{v ? `v${v}` : '—'}</span>
              </li>
            )
          })}
        </ul>
        {others > 0 && (
          <button onClick={() => setShowAll(true)} className="mt-1 self-start text-xs text-accent-text hover:underline" data-testid="versions-show-all">
            Show the other {others} sheet{others === 1 ? '' : 's'} you added, to match by hand
          </button>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={dismiss} className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100" data-testid="versions-separate">
            Keep all as separate sheets
          </button>
          <button
            disabled={!chosen.length}
            onClick={() => markVersions(chosen)}
            className="rounded border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-40"
            data-testid="versions-mark"
          >
            Mark {chosen.length || ''} as new versions
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
