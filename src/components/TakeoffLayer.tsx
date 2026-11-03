import { Circle, Group, Label, Line, Shape, Tag, Text } from 'react-konva'
import { polygonCentroid, signedAreaPt2 } from '../lib/geometry'
import type { Point } from '../lib/scale'
import type { Item, Takeoff, TakeoffKind } from '../lib/takeoff'

export interface TakeoffDraft {
  kind: TakeoffKind | 'cutout'
  colour: string
  points: Point[]
  cursor: Point | null
  label?: string
  /** show a dot at each clicked point (off for rectangles and freehand) */
  handles?: boolean
}

interface Props {
  /** CSS px per PDF point, to keep line widths and handles constant on screen */
  scale: number
  takeoffs: Takeoff[]
  items: Map<string, Item>
  selectedId: string | null
  /** label for the selected shape, e.g. "24.00 m²" */
  selectedLabel?: string
  draft: TakeoffDraft | null
}

const MARKER_RADIUS = 7

/**
 * Draws takeoff shapes (in page points) inside the overlay's scaled layer.
 * Drawing only — clicks are handled by the viewer.
 */
export default function TakeoffLayer({ scale: s, takeoffs, items, selectedId, selectedLabel, draft }: Props) {
  const selected = takeoffs.find((t) => t.id === selectedId)
  return (
    <>
      {takeoffs.map((t) => {
        const item = items.get(t.itemId)
        if (!item) return null
        return <TakeoffShape key={t.id} t={t} kind={item.kind} colour={item.colour} s={s} selected={t.id === selectedId} />
      })}

      {selected && items.get(selected.itemId) && (
        <SelectionHandles t={selected} kind={items.get(selected.itemId)!.kind} s={s} label={selectedLabel} />
      )}

      {draft && <DraftShape draft={draft} s={s} />}
    </>
  )
}

function TakeoffShape(props: { t: Takeoff; kind: TakeoffKind; colour: string; s: number; selected: boolean }) {
  const { t, kind, colour, s, selected } = props
  const flat = t.points.flatMap((p) => [p.x, p.y])
  const width = selected ? 4 : 3

  if (kind === 'count') {
    const p = t.points[0]
    return (
      <Group>
        <Circle x={p.x} y={p.y} radius={(MARKER_RADIUS + 2) / s} fill="white" opacity={0.9} />
        <Circle x={p.x} y={p.y} radius={MARKER_RADIUS / s} fill={colour} stroke={selected ? '#111' : 'white'} strokeWidth={selected ? 2.5 : 1.5} strokeScaleEnabled={false} />
      </Group>
    )
  }

  if (kind === 'linear') {
    return (
      <Group>
        <Line points={flat} stroke="white" strokeWidth={width + 3} strokeScaleEnabled={false} lineCap="round" lineJoin="round" opacity={0.7} />
        <Line points={flat} stroke={colour} strokeWidth={width} strokeScaleEnabled={false} lineCap="round" lineJoin="round" opacity={0.9} />
      </Group>
    )
  }

  // area / perimeter: closed outline; areas are filled, with cut-outs left clear
  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        ctx.beginPath()
        traceRing(ctx, t.points, false)
        // Cut-outs are traced the opposite way round so the fill leaves them empty.
        const outlineClockwise = signedAreaPt2(t.points) > 0
        for (const h of t.holes) traceRing(ctx, h, (signedAreaPt2(h) > 0) === outlineClockwise)
        ctx.fillStrokeShape(shape)
      }}
      fill={kind === 'area' ? hexToRgba(colour, selected ? 0.35 : 0.25) : undefined}
      stroke={colour}
      strokeWidth={width}
      strokeScaleEnabled={false}
      lineJoin="round"
    />
  )
}

function traceRing(ctx: { moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void; closePath: () => void }, ring: Point[], reverse: boolean) {
  const pts = reverse ? [...ring].reverse() : ring
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

function SelectionHandles(props: { t: Takeoff; kind: TakeoffKind; s: number; label?: string }) {
  const { t, kind, s, label } = props
  const anchor = kind === 'area' || kind === 'perimeter' ? polygonCentroid(t.points) : kind === 'linear' ? midpoint(t.points) : t.points[0]
  return (
    <Group>
      {kind !== 'count' &&
        [t.points, ...t.holes].flatMap((ring, r) =>
          ring.map((p, i) => (
            <Rect key={`${r}-${i}`} p={p} s={s} />
          )),
        )}
      {label && <QuantityLabel at={anchor} text={label} s={s} />}
    </Group>
  )
}

/** Square vertex handle, constant size on screen. */
function Rect({ p, s }: { p: Point; s: number }) {
  const half = 4.5 / s
  return (
    <Line
      points={[p.x - half, p.y - half, p.x + half, p.y - half, p.x + half, p.y + half, p.x - half, p.y + half]}
      closed
      fill="white"
      stroke="#111"
      strokeWidth={1.5}
      strokeScaleEnabled={false}
    />
  )
}

function DraftShape({ draft, s }: { draft: TakeoffDraft; s: number }) {
  const pts = draft.cursor ? [...draft.points, draft.cursor] : draft.points
  const closed = draft.kind === 'area' || draft.kind === 'perimeter' || draft.kind === 'cutout'
  const flat = pts.flatMap((p) => [p.x, p.y])
  const colour = draft.kind === 'cutout' ? '#111' : draft.colour
  return (
    <Group>
      {pts.length >= 2 && (
        <Line
          points={flat}
          closed={closed && pts.length >= 3}
          fill={draft.kind === 'area' && pts.length >= 3 ? hexToRgba(colour, 0.15) : undefined}
          stroke={colour}
          strokeWidth={2.5}
          dash={[8 / s, 5 / s]}
          strokeScaleEnabled={false}
          lineJoin="round"
        />
      )}
      {draft.handles !== false && draft.points.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={(i === 0 && closed ? 6 : 4) / s} fill="white" stroke={colour} strokeWidth={2} strokeScaleEnabled={false} />
      ))}
      {draft.label && pts.length >= 2 && <QuantityLabel at={pts[pts.length - 1]} text={draft.label} s={s} offset />}
    </Group>
  )
}

function QuantityLabel({ at, text, s, offset }: { at: Point; text: string; s: number; offset?: boolean }) {
  return (
    <Label x={at.x + (offset ? 12 / s : 0)} y={at.y - (offset ? 12 / s : 0)}>
      <Tag fill="#111" opacity={0.85} cornerRadius={3 / s} />
      <Text text={text} fontSize={13 / s} fontFamily="Arial, Helvetica, sans-serif" fontStyle="bold" fill="white" padding={5 / s} />
    </Label>
  )
}

function midpoint(points: Point[]): Point {
  // midpoint of the longest segment, so the label sits on the line
  let best = 0
  let at = points[0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best) {
      best = len
      at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
  }
  return at
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
