import { Group, Label, Rect, Tag, Text } from 'react-konva'
import RatioInput from './RatioInput'
import type { ScaleRegion } from '../lib/scaleRegions'

const COLOUR = '#0f766e' // teal: different from markup and takeoff colours

type Box = { x0: number; y0: number; x1: number; y1: number }

/** Scale areas on the plan: a dashed box with its scale on a tag. */
export default function RegionBoxes({ regions, draft, scale: s }: { regions: ScaleRegion[]; draft: Box | null; scale: number }) {
  return (
    <>
      {regions.map((r) => (
        <Group key={r.id} listening={false}>
          <Rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} stroke={COLOUR} strokeWidth={1.5} dash={[8, 4]} strokeScaleEnabled={false} />
          <Label x={r.x0} y={r.y0} offsetY={18 / s}>
            <Tag fill={COLOUR} cornerRadius={2 / s} />
            <Text text={`Scale area ${r.label}`} fontSize={11 / s} fontFamily="Arial, Helvetica, sans-serif" fontStyle="bold" fill="white" padding={3 / s} />
          </Label>
        </Group>
      ))}
      {draft && (
        <Rect
          x={draft.x0}
          y={draft.y0}
          width={draft.x1 - draft.x0}
          height={draft.y1 - draft.y0}
          stroke={COLOUR}
          strokeWidth={2}
          dash={[6, 4]}
          fill="rgba(15, 118, 110, 0.08)"
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </>
  )
}

/** After drawing a scale area's box: pick its scale, or calibrate inside it. */
export function RegionScaleDialog(props: { onRatio: (ratio: number) => void; onCalibrate: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="w-96 cursor-default rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite"
        role="dialog"
        data-testid="region-dialog"
        onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
      >
        <h2 className="font-semibold">Scale for this area</h2>
        <p className="mt-1 text-neutral-600">Shapes drawn inside the box use this scale. Everything else on the sheet keeps the sheet’s scale.</p>
        <div className="mt-3">
          <RatioInput onApply={props.onRatio} onCancel={props.onCancel} testId="region-ratio" applyTestId="region-apply" applyClass="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover disabled:opacity-40" />
          <span className="mt-1 block text-xs text-neutral-500">As printed on this page.</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3">
          <button onClick={props.onCalibrate} className="rounded border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100" data-testid="region-calibrate">
            Calibrate inside it instead
          </button>
          <button onClick={props.onCancel} className="rounded px-3 py-1.5 hover:bg-neutral-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
