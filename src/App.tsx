import { useEffect, useState } from 'react'
import PlanViewer from './components/PlanViewer'
import SheetList from './components/SheetList'
import Toolbar from './components/Toolbar'
import { useApp } from './store'

export default function App() {
  const sheets = useApp((s) => s.sheets)
  const selectedId = useApp((s) => s.selectedSheetId)
  const openFiles = useApp((s) => s.openFiles)
  const loading = useApp((s) => s.loading)
  const errors = useApp((s) => s.errors)
  const dismissErrors = useApp((s) => s.dismissErrors)
  const selected = sheets.find((s) => s.id === selectedId) ?? null
  const [dragOver, setDragOver] = useState(false)

  // Drop PDFs anywhere on the window.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragOver(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragOver(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) void openFiles(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [openFiles])

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <SheetList />
        <main className="relative min-w-0 flex-1">
          {selected ? (
            <PlanViewer sheet={selected} />
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-200">
              <div className="rounded-xl border-2 border-dashed border-neutral-400 px-10 py-12 text-center text-neutral-600">
                <p className="text-lg font-medium">
                  {loading ? 'Opening PDFs…' : 'Drop plan PDFs here'}
                </p>
                <p className="mt-1 text-sm">or use “Open PDFs” above. Nothing is uploaded.</p>
              </div>
            </div>
          )}
        </main>
        <aside className="w-64 shrink-0 border-l border-neutral-300 bg-white">
          <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Items & quantities
          </div>
          <p className="p-3 text-sm text-neutral-400">Takeoff items will appear here (Phase 4).</p>
        </aside>
      </div>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-600/20">
          <div className="rounded-xl bg-white px-8 py-6 text-lg font-medium shadow-xl">
            Drop PDFs to open them
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="fixed top-14 left-1/2 z-40 w-[28rem] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 shadow-lg">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          <button className="mt-2 text-xs font-medium underline" onClick={dismissErrors}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
