import { useState } from 'react'
import { COMMON_RATIOS, describeCandidate } from '../lib/scale'
import { paperSizeFromPt } from '../lib/units'
import type { SheetMeta } from '../lib/pdf'
import { usePanels } from '../panels'
import { useApp } from '../store'

/** Shows and sets the current sheet's scale, above the plan. */
export default function ScaleBar({ sheet }: { sheet: SheetMeta }) {
  const setPanel = usePanels((s) => s.setPanel)
  const scale = useApp((s) => s.scales[sheet.id])
  const detection = useApp((s) => s.detections[sheet.id])
  const setTool = useApp((s) => s.setTool)
  const confirmScale = useApp((s) => s.confirmScale)
  const setRatioScale = useApp((s) => s.setRatioScale)
  const [picking, setPicking] = useState(false)

  const candidates = detection?.candidates ?? []
  const mismatched = detection?.mismatched ?? []
  const ocrBusy = detection?.ocr === 'pending' || detection?.ocr === 'running'
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
        <span className="rounded bg-steel-blue-4 px-2 py-0.5 font-medium text-graphite">✓ {scale.label}</span>
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
        <span className="rounded bg-signal-orange-4 px-2 py-0.5 font-medium text-accent-text">{scale.label}</span>
        <span className="text-accent-text">
          Detected{detection?.ocr === 'done' ? ' by OCR' : ''} — please verify
        </span>
        <span className="text-neutral-500">(measure a known dimension, or calibrate)</span>
        <div className="flex-1" />
        <BarButton onClick={() => confirmScale(sheet.id)} primary>
          It’s correct
        </BarButton>
        {calibrate}
        {change}
      </>
    )
  } else if (mismatched.length > 0) {
    const page = paperSizeFromPt(sheet.widthPt, sheet.heightPt)
    content = (
      <>
        <span className="font-medium text-accent-text">Sheet has been resized</span>
        <span className="text-neutral-600">
          It says {mismatched.map(describeCandidate).join(', ')}, but this PDF is{' '}
          {page.name ?? `${Math.round(page.widthMm)} × ${Math.round(page.heightMm)} mm`}, so the printed
          scale doesn’t apply. Calibrate using a dimension line on the plan.
        </span>
        <div className="flex-1" />
        {calibrate}
      </>
    )
  } else if (candidates.length > 1) {
    content = (
      <>
        <span className="font-medium text-accent-text">Several scales on this sheet:</span>
        {candidates.map((c) => (
          <BarButton key={describeCandidate(c)} onClick={() => setRatioScale(sheet.id, c, 'detected')}>
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
        <span className="font-medium text-accent-text">
          {!detection?.done || ocrBusy ? 'Looking for a scale…' : 'No scale set'}
        </span>
        <span className="text-neutral-500">
          {ocrBusy
            ? 'This sheet’s text is flattened, so it’s being read with OCR. You can calibrate now if you like.'
            : detection?.ocr === 'done' || detection?.ocr === 'failed'
              ? 'This sheet’s text is flattened and OCR found no scale. Calibrate from a dimension line.'
              : detection?.done
                ? 'No scale was found in this sheet’s text. Calibrate from a known dimension.'
                : null}
        </span>
        <div className="flex-1" />
        {calibrate}
        {change}
      </>
    )
  }

  return (
    <div className="relative z-10 border-b border-neutral-300 bg-white">
      <div className="flex min-h-10 flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
        <span className="section-label">Scale</span>
        {content}
        <button
          onClick={() => setPanel('scaleBar', false)}
          data-testid="hide-scale-bar"
          title="Hide the scale bar (the scale still shows at the bottom of the plan)"
          aria-label="Hide the scale bar"
          className="rounded px-1.5 text-base leading-none text-neutral-500 hover:bg-neutral-100 hover:text-graphite"
        >
          ˄
        </button>
      </div>
      {picking && (
        <ScalePicker
          onDone={(ratio) => {
            setRatioScale(sheet.id, { ratio, paper: null }, 'manual')
            setPicking(false)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function ScalePicker(props: { onDone: (ratio: number) => void; onCancel: () => void }) {
  const [ratio, setRatio] = useState(100)
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
      <span className="text-neutral-500">as printed on this page</span>
      <BarButton primary onClick={() => props.onDone(ratio)}>
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
          ? 'bg-accent text-graphite hover:bg-accent-hover'
          : 'border border-neutral-300 bg-white hover:bg-neutral-100'
      }`}
    >
      {props.children}
    </button>
  )
}
