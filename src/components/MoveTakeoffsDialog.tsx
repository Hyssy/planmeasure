import { useEffect, useMemo, useState } from 'react'
import { alignVersions } from '../lib/compareRender'
import { samePaperSize, sheetsWithContentToMove, type PageTransform } from '../lib/moveVersion'
import { paperSizeFromPt } from '../lib/units'
import { isSuperseded, latestVersion, versionNumber } from '../lib/versions'
import { sheetName, useApp } from '../store'

const PT_TO_MM = 25.4 / 72

/** "shifted 2.0 mm right and 1.5 mm down" — how far the shapes move on paper. */
function describeShift(t: PageTransform): string {
  const x = t.tx * PT_TO_MM
  const y = t.ty * PT_TO_MM
  const parts = [
    Math.abs(x) >= 0.05 ? `${Math.abs(x).toFixed(1)} mm ${x > 0 ? 'right' : 'left'}` : '',
    Math.abs(y) >= 0.05 ? `${Math.abs(y).toFixed(1)} mm ${y > 0 ? 'down' : 'up'}` : '',
  ].filter(Boolean)
  return parts.length ? `shifted ${parts.join(' and ')} to line up` : 'already lined up (no shift)'
}

export default function MoveTakeoffsDialog() {
  const request = useApp((s) => s.moveRequest)
  if (!request) return null
  return <MoveBox key={request.join(',')} request={request} />
}

function MoveBox({ request }: { request: string[] }) {
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const scales = useApp((s) => s.scales)
  const supersedes = useApp((s) => s.supersedes)
  const takeoffs = useApp((s) => s.takeoffs)
  const markups = useApp((s) => s.markups)
  const close = useApp((s) => s.setMoveRequest)
  const move = useApp((s) => s.moveToNewVersions)
  const selectSheet = useApp((s) => s.selectSheet)
  const eligible = useMemo(() => sheetsWithContentToMove({ supersedes, takeoffs, markups }), [supersedes, takeoffs, markups])
  const [all, setAll] = useState(false)
  const [withMarkups, setWithMarkups] = useState(true)
  const [copyScale, setCopyScale] = useState<Set<string>>(new Set())
  const [aligned, setAligned] = useState<Record<string, PageTransform | 'failed'>>({})
  const [done, setDone] = useState<{ takeoffs: number; markups: number; to: string } | null>(null)

  const byId = (id: string) => sheets.find((s) => s.id === id)
  const olds = (all ? eligible : request).filter((id) => isSuperseded(id, supersedes) && byId(id))
  const pairs = olds.map((oldId) => ({ oldId, newId: latestVersion(oldId, supersedes) }))
  const name = (id: string) => `${sheetName(labels[id], sheets.findIndex((s) => s.id === id))} v${versionNumber(id, supersedes)}`

  // line each pair up (one at a time: each renders two sheets)
  const todo = pairs.find((p) => !aligned[p.oldId])
  useEffect(() => {
    if (!todo) return
    let live = true
    const o = byId(todo.oldId)!
    const n = byId(todo.newId)!
    alignVersions(o, n)
      .then((t) => live && setAligned((a) => ({ ...a, [todo.oldId]: t })))
      .catch(() => live && setAligned((a) => ({ ...a, [todo.oldId]: 'failed' })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo?.oldId])

  const ready = pairs.length > 0 && pairs.every((p) => aligned[p.oldId] && aligned[p.oldId] !== 'failed')
  const counts = (id: string) => ({ t: takeoffs.filter((t) => t.sheetId === id).length, m: markups.filter((m) => m.sheetId === id).length })

  const apply = () => {
    const moves = pairs.map((p) => ({ ...p, t: aligned[p.oldId] as PageTransform }))
    const r = move(moves, { markups: withMarkups, copyScale: [...copyScale] })
    setDone({ ...r, to: pairs.length === 1 ? name(pairs[0].newId) : `${pairs.length} new versions` })
  }

  if (done) {
    return (
      <Shell>
        <h2 className="text-base font-semibold">Moved</h2>
        <p className="mt-1" data-testid="move-done">
          {done.takeoffs} takeoff{done.takeoffs === 1 ? '' : 's'}
          {withMarkups ? ` and ${done.markups} markup${done.markups === 1 ? '' : 's'}` : ''} moved to {done.to}.
        </p>
        <p className="mt-1 text-xs text-neutral-600">Check a few shapes against the new drawing — anything that changed in this revision needs redrawing. Ctrl+Z puts them back.</p>
        <div className="mt-4 flex justify-end">
          <button
            autoFocus
            onClick={() => {
              if (pairs.length === 1) selectSheet(pairs[0].newId)
              close(null)
            }}
            className="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover"
          >
            Done
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <h2 className="text-base font-semibold">Move takeoffs to the new version</h2>
      <p className="mt-1 text-neutral-600">
        Shapes drawn on the old version move onto the new one, lined up with the drawing (the same way Compare lines the two versions up). Quantities then use the new version’s scale.
      </p>

      <ul className="mt-3 max-h-[45vh] overflow-y-auto rounded border border-neutral-200" data-testid="move-list">
        {pairs.map(({ oldId, newId }) => {
          const o = byId(oldId)!
          const n = byId(newId)!
          const c = counts(oldId)
          const t = aligned[oldId]
          const same = samePaperSize(o, n)
          const oldScale = scales[oldId]
          const newScale = scales[newId]
          const newConfirmed = newScale?.status === 'confirmed'
          const offerScale = same && !!oldScale && !newConfirmed
          return (
            <li key={oldId} className="border-b border-neutral-100 px-2 py-2 last:border-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">
                  {name(oldId)} → v{versionNumber(newId, supersedes)}
                </span>
                <span className="text-xs text-neutral-600">
                  {c.t} takeoff{c.t === 1 ? '' : 's'}
                  {c.m ? `, ${c.m} markup${c.m === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              <div className="text-xs text-neutral-600" data-testid="move-shift">
                {!t ? 'Lining the drawings up…' : t === 'failed' ? <span className="text-red-700">Couldn’t line these up — this sheet can’t be moved.</span> : describeShift(t)}
              </div>
              {!same && (
                <div className="text-xs text-accent-text">
                  Different paper size ({paperSizeFromPt(o.widthPt, o.heightPt).name ?? 'v1'} → {paperSizeFromPt(n.widthPt, n.heightPt).name ?? 'new'}): shapes are scaled to the new page. Check the new version’s scale.
                </div>
              )}
              <div className="text-xs text-neutral-600">
                New version’s scale:{' '}
                {newScale ? (
                  <span className={newConfirmed ? '' : 'text-accent-text'}>
                    {newScale.label}
                    {newConfirmed ? '' : ' (detected — please verify)'}
                  </span>
                ) : (
                  <span className="text-accent-text">none yet — moved shapes won’t count until it has one</span>
                )}
              </div>
              {offerScale && (
                <label className="mt-0.5 flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={copyScale.has(newId)}
                    onChange={(e) => {
                      const next = new Set(copyScale)
                      if (e.target.checked) next.add(newId)
                      else next.delete(newId)
                      setCopyScale(next)
                    }}
                    data-testid="move-copy-scale"
                  />
                  Use the old version’s scale on the new version ({oldScale.label}
                  {oldScale.status === 'confirmed' ? '' : ', unverified'})
                </label>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-3 space-y-1">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={withMarkups} onChange={(e) => setWithMarkups(e.target.checked)} data-testid="move-markups" /> Move markups too
        </label>
        {eligible.length > request.length && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} data-testid="move-all" /> Do this for every sheet with a new version ({eligible.length})
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Anything that changed in the revision needs checking or redrawing afterwards. Ctrl+Z undoes the move (a copied scale stays — change it in the scale bar).
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => close(null)} className="rounded px-3 py-1.5 hover:bg-neutral-100">
          Cancel
        </button>
        <button
          disabled={!ready}
          onClick={apply}
          className="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover disabled:opacity-40"
          data-testid="move-apply"
        >
          {ready ? `Move to new version${pairs.length === 1 ? '' : 's'}` : 'Lining up…'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[36rem] rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite" data-testid="move-dialog" role="dialog">
        {children}
      </div>
    </div>
  )
}
