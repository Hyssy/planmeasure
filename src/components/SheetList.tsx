import { useApp, type SheetScale } from '../store'
import { paperSizeFromPt } from '../lib/units'

export default function SheetList() {
  const sheets = useApp((s) => s.sheets)
  const thumbnails = useApp((s) => s.thumbnails)
  const selectedId = useApp((s) => s.selectedSheetId)
  const selectSheet = useApp((s) => s.selectSheet)
  const scales = useApp((s) => s.scales)
  const detections = useApp((s) => s.detections)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-300 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        Sheets {sheets.length > 0 && <span className="font-normal">({sheets.length})</span>}
      </div>
      <ol className="flex-1 space-y-2 overflow-y-auto p-2">
        {sheets.map((sheet, i) => {
          const paper = paperSizeFromPt(sheet.widthPt, sheet.heightPt)
          const selected = sheet.id === selectedId
          return (
            <li key={sheet.id}>
              <button
                onClick={() => selectSheet(sheet.id)}
                className={`w-full rounded-md border p-2 text-left transition ${
                  selected
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <div
                  className="flex items-center justify-center bg-neutral-100"
                  style={{ aspectRatio: `${sheet.widthPt} / ${sheet.heightPt}` }}
                >
                  {thumbnails[sheet.id] ? (
                    <img
                      src={thumbnails[sheet.id]}
                      alt=""
                      className="h-full w-full border border-neutral-200 bg-white object-contain"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">Loading…</span>
                  )}
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">Sheet {i + 1}</span>
                  <span className="text-xs text-neutral-500">
                    {paper.name ?? `${Math.round(paper.widthMm)}×${Math.round(paper.heightMm)}`}
                  </span>
                </div>
                <ScaleBadge
                  scale={scales[sheet.id]}
                  multiple={(detections[sheet.id]?.candidates.length ?? 0) > 1}
                  resized={(detections[sheet.id]?.mismatched.length ?? 0) > 0}
                />
                <div className="truncate text-xs text-neutral-500" title={sheet.fileName}>
                  {sheet.fileName} · p{sheet.pageNumber}
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

function ScaleBadge(props: { scale: SheetScale | undefined; multiple: boolean; resized: boolean }) {
  const { scale, multiple, resized } = props
  const short = scale?.source === 'calibrated' ? 'Calibrated' : scale?.label.split(' (')[0]
  const [cls, text] = !scale
    ? ['bg-amber-100 text-amber-900', resized ? '⚠ Resized — calibrate' : multiple ? '⚠ Several scales — choose' : '⚠ No scale']
    : scale.status === 'detected'
      ? ['bg-amber-100 text-amber-900', `${short} · verify`]
      : ['bg-green-100 text-green-800', `✓ ${short}`]
  return <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{text}</div>
}
