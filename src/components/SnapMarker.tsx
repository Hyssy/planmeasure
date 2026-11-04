import { Circle, Group, Line, Rect } from 'react-konva'
import type { Snap } from '../lib/snap'

const VECTOR = '#d81b9c' // magenta: stands out on black-and-white plans
const APPROX = '#ea580c' // orange: approximate (image-based) snaps

/** The marker showing where the next click will land, sized in screen pixels. */
export default function SnapMarkerLayer({ snap, scale: s }: { snap: Snap | null; scale: number }) {
  if (!snap) return null
  const { x, y } = snap.point
  const r = 7 / s
  const colour = snap.approximate ? APPROX : VECTOR
  const common = { stroke: colour, strokeWidth: 2, strokeScaleEnabled: false, listening: false }
  return (
    <Group listening={false}>
      {snap.kind === 'end' && <Rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...common} />}
      {snap.kind === 'intersection' && (
        <>
          <Line points={[x - r, y - r, x + r, y + r]} {...common} />
          <Line points={[x - r, y + r, x + r, y - r]} {...common} />
        </>
      )}
      {snap.kind === 'mid' && <Line points={[x, y - r, x + r, y + r * 0.8, x - r, y + r * 0.8]} closed {...common} />}
      {snap.kind === 'line' && <Circle x={x} y={y} radius={r * 0.7} {...common} />}
      {(snap.kind === 'corner-approx' || snap.kind === 'line-approx') && (
        <Rect x={x - r} y={y - r} width={r * 2} height={r * 2} dash={[3, 2]} rotation={snap.kind === 'line-approx' ? 45 : 0} offsetX={0} {...common} />
      )}
      <Circle x={x} y={y} radius={1.5 / s} fill={colour} listening={false} />
    </Group>
  )
}

