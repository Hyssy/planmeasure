import { useEffect, useState } from 'react'
import ItemsPanel from './components/ItemsPanel'
import OptionsBar from './components/OptionsBar'
import PlanViewer from './components/PlanViewer'
import ScaleBar from './components/ScaleBar'
import SheetList from './components/SheetList'
import Toolbar from './components/Toolbar'
import { DRAW_STYLES, useApp, type Tool } from './store'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select', h: 'pan', c: 'calibrate', m: 'measure', l: 'linear', a: 'area', p: 'perimeter', n: 'count', k: 'markup',
}

export default function App() {
  const sheets = useApp((s) => s.sheets)
  const selectedId = useApp((s) => s.selectedSheetId)
  const openFiles = useApp((s) => s.openFiles)
  const loading = useApp((s) => s.loading)
  const loadingMessage = useApp((s) => s.loadingMessage)
  const errors = useApp((s) => s.errors)
  const dismissErrors = useApp((s) => s.dismissErrors)
  const selected = sheets.find((s) => s.id === selectedId) ?? null
  const [dragOver, setDragOver] = useState(false)

  // Shortcuts: tools by letter; Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo.
  const setTool = useApp((s) => s.setTool)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      const key = e.key.toLowerCase()
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault()
          useApp.getState().undo()
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault()
          useApp.getState().redo()
        }
        return
      }
      if (e.altKey || !useApp.getState().sheets.length) return
      const st = useApp.getState()
      if ((key === '1' || key === '2' || key === '3') && (st.tool === 'linear' || st.tool === 'area' || st.tool === 'perimeter')) {
        const style = (['polygon', 'rectangle', 'freehand'] as const)[Number(key) - 1]
        if (DRAW_STYLES[st.tool].includes(style)) st.setDrawStyle(st.tool, style)
        return
      }
      const tool = TOOL_KEYS[key]
      if (tool) setTool(tool)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTool])

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
      <OptionsBar />
      <div className="flex min-h-0 flex-1">
        <SheetList />
        <main className="relative min-w-0 flex-1">
          {selected ? (
            <div className="flex h-full flex-col">
              <ScaleBar sheet={selected} />
              <div className="relative min-h-0 flex-1">
                <PlanViewer sheet={selected} />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-200">
              <div className="rounded-xl border-2 border-dashed border-neutral-400 px-10 py-12 text-center text-neutral-600">
                <p className="text-lg font-medium">
                  {loading ? loadingMessage || 'Opening…' : 'Drop plan PDFs here'}
                </p>
                <p className="mt-1 text-sm">or use “Open PDFs” above. Nothing is uploaded.</p>
              </div>
            </div>
          )}
        </main>
        <ItemsPanel />
      </div>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/20">
          <div className="rounded-xl bg-white px-8 py-6 text-lg font-medium border border-neutral-300">
            Drop PDFs to open them
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="fixed top-14 left-1/2 z-40 w-[28rem] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
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
