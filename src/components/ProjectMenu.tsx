import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { useApp } from '../store'

/** Project name, save status, and the menu to switch, export or import projects. */
export default function ProjectMenu() {
  const projectId = useApp((s) => s.projectId)
  const projectName = useApp((s) => s.projectName)
  const saveStatus = useApp((s) => s.saveStatus)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="project-menu"
        className="flex max-w-56 items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100"
        title="Projects: rename, switch, export or import"
      >
        <span className="truncate">{projectId ? projectName : 'No project'}</span>
        <span className="text-neutral-400">▾</span>
      </button>
      {projectId && <SaveBadge status={saveStatus} />}
      {open && <MenuPanel onClose={() => setOpen(false)} />}
    </div>
  )
}

function SaveBadge({ status }: { status: string }) {
  const text = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? '⚠ Not saved' : ''
  const cls = status === 'error' ? 'text-red-700' : 'text-neutral-500'
  return (
    <span data-testid="save-status" className={`w-20 text-xs ${cls}`} title={status === 'error' ? 'Couldn’t save to browser storage. Export the project to keep a copy.' : 'Saved in this browser'}>
      {text}
    </span>
  )
}

function MenuPanel({ onClose }: { onClose: () => void }) {
  const projectId = useApp((s) => s.projectId)
  const projectName = useApp((s) => s.projectName)
  const renameProject = useApp((s) => s.renameProject)
  const newProject = useApp((s) => s.newProject)
  const openProject = useApp((s) => s.openProject)
  const deleteProject = useApp((s) => s.deleteProject)
  const exportProject = useApp((s) => s.exportProject)
  const importProject = useApp((s) => s.importProject)
  const [name, setName] = useState(projectName)
  const [projects, setProjects] = useState<db.ProjectRecord[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void db.listProjects().then(setProjects)
  }, [])

  const others = (projects ?? []).filter((p) => p.id !== projectId)

  return (
    <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-lg border border-neutral-200 bg-white p-3 text-sm shadow-xl" data-testid="project-panel">
      {projectId && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            renameProject(name)
            onClose()
          }}
        >
          <label className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Project name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => renameProject(name)}
              aria-label="Project name"
              className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1 text-sm font-normal tracking-normal text-neutral-900 normal-case focus:border-blue-500 focus:outline-none"
            />
          </label>
        </form>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MenuButton
          onClick={() => {
            newProject()
            onClose()
          }}
        >
          New project
        </MenuButton>
        <MenuButton onClick={() => importRef.current?.click()}>Import project…</MenuButton>
        <MenuButton
          disabled={!projectId || exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await exportProject()
            } finally {
              setExporting(false)
            }
            onClose()
          }}
        >
          {exporting ? 'Exporting…' : 'Export project…'}
        </MenuButton>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Export saves one file with the PDFs and all takeoffs, for backup or sharing.
      </p>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) {
            onClose()
            void importProject(file)
          }
        }}
      />

      <div className="mt-3 border-t border-neutral-200 pt-2">
        <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Other projects in this browser</div>
        {projects === null ? (
          <p className="py-2 text-xs text-neutral-400">Loading…</p>
        ) : others.length === 0 ? (
          <p className="py-2 text-xs text-neutral-400">None yet.</p>
        ) : (
          <ul className="mt-1 max-h-64 overflow-y-auto" data-testid="project-list">
            {others.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-neutral-50">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onClose()
                    void openProject(p.id)
                  }}
                >
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs text-neutral-500">
                    {p.sheetCount} sheet{p.sheetCount === 1 ? '' : 's'} · {formatWhen(p.updatedAt)}
                  </div>
                </button>
                <button
                  className="rounded px-1.5 text-xs text-red-700 hover:bg-red-50"
                  title="Delete this project from this browser"
                  onClick={async () => {
                    if (!confirm(`Delete “${p.name}” from this browser? This can’t be undone. Export it first if you want a copy.`)) return
                    await deleteProject(p.id)
                    setProjects(await db.listProjects())
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {projectId && (
        <div className="mt-2 border-t border-neutral-200 pt-2 text-right">
          <button
            className="text-xs text-red-700 hover:underline"
            onClick={async () => {
              if (!confirm(`Delete “${projectName}” from this browser? This can’t be undone. Export it first if you want a copy.`)) return
              await deleteProject(projectId)
              onClose()
            }}
          >
            Delete this project
          </button>
        </div>
      )}
    </div>
  )
}

function MenuButton(props: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded border border-neutral-300 px-2 py-1.5 text-left font-medium hover:bg-neutral-100 disabled:opacity-40"
    >
      {props.children}
    </button>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `today ${time}`
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
