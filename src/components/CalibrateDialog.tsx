import { useState } from 'react'
import { equivalentRatio, formatRatio, mmPerPtFromCalibration } from '../lib/scale'
import { ptToMm } from '../lib/units'

interface Props {
  /** length of the line the user drew, in PDF points */
  distPt: number
  onApply: (realMmPerPt: number) => void
  onCancel: () => void
}

/** Asks for the real length of the line just drawn with the Calibrate tool. */
export default function CalibrateDialog({ distPt, onApply, onCancel }: Props) {
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<'mm' | 'm'>('mm')

  const num = Number(value.replace(/,/g, ''))
  const realMm = unit === 'm' ? num * 1000 : num
  const valid = value.trim() !== '' && Number.isFinite(num) && num > 0
  const mmPerPt = valid ? mmPerPtFromCalibration(distPt, realMm) : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mmPerPt) onApply(mmPerPt)
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/30"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-80 cursor-default rounded-lg bg-white p-4 border border-neutral-300"
      >
        <h2 className="font-semibold">Calibrate scale</h2>
        <p className="mt-1 text-sm text-neutral-600">
          What is the real length of the line you drew? It measures{' '}
          {ptToMm(distPt).toFixed(1)} mm on paper.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            inputMode="decimal"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 tabular-nums focus:border-graphite focus:outline-none"
            placeholder={unit === 'mm' ? 'e.g. 3600' : 'e.g. 3.6'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <select
            className="rounded border border-neutral-300 px-2 py-1.5"
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'mm' | 'm')}
          >
            <option value="mm">mm</option>
            <option value="m">m</option>
          </select>
        </div>
        <p className="mt-2 h-5 text-sm text-neutral-500">
          {mmPerPt && <>Scale on this page: ≈ {formatRatio(equivalentRatio(mmPerPt))}</>}
        </p>
        <p className="text-xs text-neutral-500">
          Tip: zoom in close and use the longest known dimension you can for best accuracy.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!mmPerPt}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-graphite hover:bg-accent-hover disabled:opacity-50"
          >
            Set scale
          </button>
        </div>
      </form>
    </div>
  )
}
