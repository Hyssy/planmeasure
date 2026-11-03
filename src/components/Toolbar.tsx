import { useRef } from 'react'
import { useApp } from '../store'

export default function Toolbar() {
  const openFiles = useApp((s) => s.openFiles)
  const loading = useApp((s) => s.loading)
  const inputRef = useRef<HTMLInputElement>(null)

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
      <span className="text-xs text-neutral-500">
        Scroll to zoom · drag to pan · files stay on your computer
      </span>
    </header>
  )
}
