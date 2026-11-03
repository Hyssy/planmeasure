import { useRef } from 'react'
import { useApp, type Tool } from '../store'

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'pan', label: 'Pan', key: 'H', hint: 'Drag to move around the plan' },
  { id: 'calibrate', label: 'Calibrate', key: 'C', hint: 'Set the scale from a dimension you know' },
  { id: 'measure', label: 'Measure', key: 'M', hint: 'Measure a distance' },
]

export default function Toolbar() {
  const openFiles = useApp((s) => s.openFiles)
  const loading = useApp((s) => s.loading)
  const inputRef = useRef<HTMLInputElement>(null)
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const hasSheets = useApp((s) => s.sheets.length > 0)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-300 bg-white px-3">
      <span className="font-semibold tracking-tight">PlanMeasure</span>
      <div className="h-6 w-px bg-neutral-200" />
      <button
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? 'Opening…' : 'Open PDFs'}
      </button>
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
      <div className="h-6 w-px bg-neutral-200" />
      <div className="flex gap-1" role="toolbar" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            disabled={!hasSheets}
            onClick={() => setTool(t.id)}
            title={`${t.hint} (${t.key})`}
            aria-pressed={tool === t.id}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
              tool === t.id ? 'bg-neutral-800 text-white' : 'hover:bg-neutral-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-neutral-500">
        Scroll to zoom · Space+drag to pan · files stay on your computer
      </span>
    </header>
  )
}
