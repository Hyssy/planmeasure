import { useState } from 'react'
import { COMMON_RATIOS, describeCandidate, type PaperName } from '../lib/scale'
import type { SheetMeta } from '../lib/pdf'
import { useApp } from '../store'

const PAPERS: PaperName[] = ['A0', 'A1', 'A2', 'A3', 'A4']

/** Shows and sets the current sheet's scale, above the plan. */
export default function ScaleBar({ sheet }: { sheet: SheetMeta }) {
  const scale = useApp((s) => s.scales[sheet.id])
  const detection = useApp((s) => s.detections[sheet.id])
  const setTool = useApp((s) => s.setTool)
  const confirmScale = useApp((s) => s.confirmScale)
  const setRatioScale = useApp((s) => s.setRatioScale)
  const [picking, setPicking] = useState(false)

  const candidates = detection?.candidates ?? []
  const calibrate = (
    <BarButton onClick={() => setTool('calibrate')} primary={!scale}>
      {scale?.source === 'calibrated' ? 'Calibrate again' : 'Calibrate'}
    </BarButton>
  )
  const change = <BarButton onClick={() => setPicking((p) => !p)}>Set scale…</BarButton>

  let content: React.ReactNode
  if (scale?.status === 'confirmed') {
    content = (
      <>
        <span className="rounded bg-green-100 px-2 py-0.5 font-medium text-green-800">✓ {scale.label}</span>
        <span className="text-neutral-500">
          {scale.source === 'calibrated' ? 'Set by calibration' : 'Confirmed'}
        </span>
        <div className="flex-1" />
        {calibrate}
        {change}
      </>
    )
  } else if (scale?.status === 'detected') {
    content = (
      <>
        <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">{scale.label}</span>
        <span className="text-amber-900">Detected — please verify</span>
        <span className="text-neutral-500">(measure a known dimension, or calibrate)</span>
        <div className="flex-1" />
        <BarButton onClick={() => confirmScale(sheet.id)} primary>
          It’s correct
        </BarButton>
        {calibrate}
        {change}
      </>
    )
  } else if (candidates.length > 1) {
    content = (
      <>
        <span className="font-medium text-amber-900">⚠ Several scales on this sheet:</span>
        {candidates.map((c) => (
          <BarButton key={describeCandidate(c)} onClick={() => setRatioScale(sheet.id, c.ratio, c.paper, 'detected')}>
            Use {describeCandidate(c)}
          </BarButton>
        ))}
        <span className="text-neutral-500">Pick the one for the view you’re measuring.</span>
        <div className="flex-1" />
        {calibrate}
        {change}
      </>
    )
  } else {
    content = (
      <>
        <span className="font-medium text-amber-900">
          ⚠ {detection?.done ? 'No scale set' : 'Looking for a scale…'}
        </span>
        {detection?.done && (
          <span className="text-neutral-500">
            No scale was found in this sheet’s text. Calibrate from a known dimension.
          </span>
        )}
        <div className="flex-1" />
        {calibrate}
        {change}
      </>
    )
  }

  return (
    <div className="relative z-10 border-b border-neutral-300 bg-white">
      <div className="flex min-h-10 flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
        <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Scale</span>
        {content}
      </div>
      {picking && (
        <ScalePicker
          sheet={sheet}
          onDone={(ratio, paper) => {
            setRatioScale(sheet.id, ratio, paper, 'manual')
            setPicking(false)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function ScalePicker(props: {
  sheet: SheetMeta
  onDone: (ratio: number, paper: PaperName | null) => void
  onCancel: () => void
}) {
  const [ratio, setRatio] = useState(100)
  const [paper, setPaper] = useState<PaperName | ''>('')
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
      <label className="flex items-center gap-1">
        Scale 1:
        <select
          className="rounded border border-neutral-300 bg-white px-1.5 py-1"
          value={ratio}
          onChange={(e) => setRatio(Number(e.target.value))}
        >
          {COMMON_RATIOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        drawn for
        <select
          className="rounded border border-neutral-300 bg-white px-1.5 py-1"
          value={paper}
          onChange={(e) => setPaper(e.target.value as PaperName | '')}
        >
          <option value="">this page size</option>
          {PAPERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <BarButton primary onClick={() => props.onDone(ratio, paper || null)}>
        Apply
      </BarButton>
      <BarButton onClick={props.onCancel}>Cancel</BarButton>
    </div>
  )
}

function BarButton(props: { onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded px-2.5 py-1 text-sm font-medium ${
        props.primary
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-neutral-300 bg-white hover:bg-neutral-100'
      }`}
    >
      {props.children}
    </button>
  )
}
