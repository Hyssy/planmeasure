import { useRef, useState } from 'react'
import wordmark from '../assets/brand/cyclo-wordmark-chalk.svg'
import { isFocused, usePanels } from '../panels'
import { useApp, type Tool } from '../store'
import ExportPdfDialog from './ExportPdfDialog'
import ProjectMenu from './ProjectMenu'

const TOOL_GROUPS: { id: Tool; label: string; key: string; hint: string }[][] = [
  [
    { id: 'select', label: 'Select', key: 'V', hint: 'Select, change or delete shapes' },
    { id: 'pan', label: 'Pan', key: 'H', hint: 'Drag to move around the plan' },
  ],
  [
    { id: 'calibrate', label: 'Calibrate', key: 'C', hint: 'Set the scale from a dimension you know' },
    { id: 'measure', label: 'Measure', key: 'M', hint: 'Measure a distance (not saved)' },
  ],
  [
    { id: 'linear', label: 'Linear', key: 'L', hint: 'Take off lengths: walls, skirting, pipes' },
    { id: 'area', label: 'Area', key: 'A', hint: 'Take off areas: floors, ceilings' },
    { id: 'perimeter', label: 'Perimeter', key: 'P', hint: 'Take off the edge length of a room' },
    { id: 'count', label: 'Count', key: 'N', hint: 'Count items: lights, doors, fixtures' },
  ],
  [{ id: 'markup', label: 'Markup', key: 'K', hint: 'Clouds, arrows, text, highlights and more' }],
]

export default function Toolbar() {
  const openFiles = useApp((s) => s.openFiles)
  const loading = useApp((s) => s.loading)
  const inputRef = useRef<HTMLInputElement>(null)
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const hasSheets = useApp((s) => s.sheets.length > 0)
  // Focus mode: a slim one-row header with just the logo and the tools.
  const slim = usePanels((s) => isFocused(s.open)) && hasSheets

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-graphite px-3 py-1.5 text-chalk">
      <span className="flex items-center gap-3 whitespace-nowrap pr-1">
        {/* Cyclo wordmark, chalk on graphite, as supplied (never redrawn) */}
        <img src={wordmark} alt="Cyclo" className="h-[15px] w-auto" />
        {!slim && (
          <>
            <span className="h-5 w-px bg-white/25" />
            <span className="text-[15px] font-bold tracking-[-0.025em]">PlanMeasure</span>
          </>
        )}
      </span>
      {!slim && <ProjectMenu />}
      {!slim && <div className="h-6 w-px bg-white/20" />}
      {!slim && <button
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium whitespace-nowrap text-graphite hover:bg-accent-hover disabled:opacity-60"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? 'Opening…' : 'Open PDFs'}
      </button>}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) void openFiles(files)
        }}
      />
      {!slim && <div className="h-6 w-px bg-white/20" />}
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Tools">
        {TOOL_GROUPS.map((group, g) => (
          <div key={g} className="flex items-center gap-1">
            {g > 0 && <div className="mx-1 h-6 w-px bg-white/20" />}
            {group.map((t) => (
              <button
                key={t.id}
                disabled={!hasSheets}
                onClick={() => setTool(t.id)}
                title={`${t.hint} (${t.key})`}
                aria-pressed={tool === t.id}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap disabled:opacity-40 ${
                  tool === t.id ? 'bg-accent text-graphite' : 'text-chalk hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ))}
        <div className="mx-1 h-6 w-px bg-white/20" />
        <UndoRedo />
        <div className="mx-1 h-6 w-px bg-white/20" />
        <Layers />
        <div className="mx-1 h-6 w-px bg-white/20" />
        <ExportPdfButton />
      </div>
      <span className={`ml-auto hidden text-xs whitespace-nowrap text-foundation-grey ${slim ? '' : '2xl:inline'}`}>
        Scroll to zoom · Space+drag to pan · files stay on your computer
      </span>
    </header>
  )
}

function UndoRedo() {
  const canUndo = useApp((s) => s.past.length > 0)
  const canRedo = useApp((s) => s.future.length > 0)
  const undo = useApp((s) => s.undo)
  const redo = useApp((s) => s.redo)
  return (
    <>
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="rounded-md px-2 py-1 text-lg leading-none text-chalk hover:bg-white/10 disabled:opacity-35">
        ↶
      </button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo" className="rounded-md px-2 py-1 text-lg leading-none text-chalk hover:bg-white/10 disabled:opacity-35">
        ↷
      </button>
    </>
  )
}

function Layers() {
  const showTakeoffs = useApp((s) => s.showTakeoffs)
  const showMarkups = useApp((s) => s.showMarkups)
  const setLayerVisible = useApp((s) => s.setLayerVisible)
  return (
    <div className="flex items-center gap-2 text-sm whitespace-nowrap" title="Show or hide each layer (also sets what goes in a PDF export)">
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={showTakeoffs} onChange={(e) => setLayerVisible('takeoffs', e.target.checked)} />
        Takeoffs
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={showMarkups} onChange={(e) => setLayerVisible('markups', e.target.checked)} />
        Markups
      </label>
    </div>
  )
}

function ExportPdfButton() {
  const hasProject = useApp((s) => s.projectId !== null && s.sheets.length > 0)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!hasProject}
        title="Export a marked-up PDF: this page, marked-up pages or the whole document"
        className="rounded-md border border-chalk/60 px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-chalk hover:bg-white/10 disabled:opacity-40"
      >
        Export PDF
      </button>
      {open && <ExportPdfDialog onClose={() => setOpen(false)} />}
    </>
  )
}
