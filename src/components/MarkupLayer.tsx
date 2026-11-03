import { Circle, Group, Line, Rect, Shape, Text } from 'react-konva'
import { LINE_HEIGHT, markupHandles, markupPrimitives, type Markup, type Primitive } from '../lib/markup'
import { measureScreenText } from '../lib/measureText'
import type { Point } from '../lib/scale'

interface Props {
  scale: number
  markups: Markup[]
  selectedId: string | null
  /** markup being drawn */
  draft: Markup | null
  /** hide the markup being edited as text (the text box overlay shows it instead) */
  hiddenId?: string | null
}

/** Draws markups (in page points) inside the overlay's scaled layer. */
export default function MarkupLayer({ scale: s, markups, selectedId, draft, hiddenId }: Props) {
  const selected = markups.find((m) => m.id === selectedId)
  return (
    <>
      {markups.map((m) => (m.id === hiddenId ? null : <PrimitivesShape key={m.id} prims={markupPrimitives(m, measureScreenText)} />))}
      {draft && <PrimitivesShape prims={markupPrimitives(draft, measureScreenText)} />}
      {selected && <SelectionBox m={selected} s={s} />}
    </>
  )
}

export function PrimitivesShape({ prims }: { prims: Primitive[] }) {
  return (
    <Group>
      {prims.map((p, i) => {
        if (p.kind === 'circle') {
          return <Circle key={i} x={p.at.x} y={p.at.y} radius={p.r} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
        }
        if (p.kind === 'text') {
          const pad = p.box?.padding ?? 0
          return (
            <Group key={i} x={p.at.x} y={p.at.y}>
              {p.box && <Rect width={p.box.width} height={p.box.height} fill={p.box.fill} opacity={0.9} stroke={p.box.stroke} strokeWidth={Math.max(0.75, p.fontSize / 14)} />}
              <Text
                x={pad}
                y={pad}
                text={p.lines.join('\n')}
                fontSize={p.fontSize}
                lineHeight={LINE_HEIGHT}
                fontFamily="Arial, Helvetica, sans-serif"
                fill={p.colour}
              />
            </Group>
          )
        }
        return (
          <Shape
            key={i}
            sceneFunc={(ctx, shape) => {
              ctx.beginPath()
              for (const ring of p.rings) {
                ring.forEach((q, j) => (j === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)))
                if (p.closed) ctx.closePath()
              }
              ctx.fillStrokeShape(shape)
            }}
            fill={p.fill ? withAlpha(p.fill, p.fillOpacity ?? 1) : undefined}
            stroke={p.stroke ? withAlpha(p.stroke, p.strokeOpacity ?? 1) : undefined}
            strokeWidth={p.strokeWidth}
            lineCap={p.lineCap ?? 'round'}
            lineJoin="round"
          />
        )
      })}
    </Group>
  )
}

/** Dashed box round the selected markup, with resize handles. */
function SelectionBox({ m, s }: { m: Markup; s: number }) {
  const prims = markupPrimitives(m, measureScreenText)
  const pts: Point[] = prims.flatMap((p) =>
    p.kind === 'path' ? p.rings.flat() : p.kind === 'circle' ? [p.at] : [p.at, { x: p.at.x + (p.box?.width ?? 0), y: p.at.y + (p.box?.height ?? 0) }],
  )
  const pad = 4 / s
  const minX = Math.min(...pts.map((p) => p.x)) - pad
  const minY = Math.min(...pts.map((p) => p.y)) - pad
  const maxX = Math.max(...pts.map((p) => p.x)) + pad
  const maxY = Math.max(...pts.map((p) => p.y)) + pad
  return (
    <Group>
      <Rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} stroke="#111" strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} />
      {markupHandles(m).map((p, i) => {
        const half = 4.5 / s
        return (
          <Line
            key={i}
            points={[p.x - half, p.y - half, p.x + half, p.y - half, p.x + half, p.y + half, p.x - half, p.y + half]}
            closed
            fill="white"
            stroke="#111"
            strokeWidth={1.5}
            strokeScaleEnabled={false}
          />
        )
      })}
    </Group>
  )
}

function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1 || !hex.startsWith('#') || hex.length !== 7) return hex
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
