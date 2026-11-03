import { useApp } from '../store'

/** "Add these PDFs to this project, or start a new one?" — shown when a project already has plans. */
export default function AddPlansDialog() {
  const files = useApp((s) => s.pendingFiles)
  const projectName = useApp((s) => s.projectName)
  const sheetCount = useApp((s) => s.sheets.length)
  const resolve = useApp((s) => s.resolvePendingFiles)
  if (!files) return null
  const names = files.map((f) => f.name)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => e.target === e.currentTarget && void resolve('cancel')}
    >
      <div
        className="w-[28rem] rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite"
        data-testid="add-plans-dialog"
        role="dialog"
        aria-labelledby="add-plans-title"
        onKeyDown={(e) => e.key === 'Escape' && void resolve('cancel')}
      >
        <h2 id="add-plans-title" className="text-base font-semibold">
          Add to this project, or start a new one?
        </h2>
        <p className="mt-1 text-neutral-600">
          “{projectName}” already has {sheetCount} sheet{sheetCount === 1 ? '' : 's'}. You’re opening:
        </p>
        <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-5 text-neutral-700">
          {names.map((n) => (
            <li key={n} className="truncate">
              {n}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={() => void resolve('cancel')} className="rounded px-3 py-1.5 hover:bg-neutral-100">
            Cancel
          </button>
          <button
            onClick={() => void resolve('new')}
            className="rounded border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100"
            data-testid="add-plans-new"
          >
            Start a new project
          </button>
          <button
            autoFocus
            onClick={() => void resolve('add')}
            className="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover"
            data-testid="add-plans-add"
          >
            Add to this project
          </button>
        </div>
        <p className="mt-3 text-xs text-neutral-500">Starting a new project keeps this one saved. Switch back any time from the Project menu.</p>
      </div>
    </div>
  )
}
