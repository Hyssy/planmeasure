import { Circle, Group, Label, Layer, Line, Stage, Tag, Text } from 'react-konva'
import type { Point } from '../lib/scale'
import type { View } from '../lib/view'

export interface OverlayLine {
  points: Point[]
  colour: string
  label?: string
  dashed?: boolean
}

interface Props {
  width: number
  height: number
  view: View
  lines: OverlayLine[]
}

/**
 * Drawing layer on top of the plan. Shapes are given in page points; the layer
 * is moved and scaled by the view, so they stay locked to the drawing at any zoom.
 * Line widths, handles and labels stay the same size on screen.
 */
export default function MeasureOverlay({ width, height, view, lines }: Props) {
  const s = view.scale
  return (
    <Stage width={width} height={height} listening={false} className="pointer-events-none absolute inset-0">
      <Layer x={view.x} y={view.y} scaleX={s} scaleY={s} listening={false}>
        {lines.map((line, i) => {
          const flat = line.points.flatMap((p) => [p.x, p.y])
          const last = line.points[line.points.length - 1]
          const first = line.points[0]
          const mid =
            line.points.length >= 2
              ? { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }
              : first
          return (
            <Group key={i}>
              {/* white halo so the line shows on dark linework */}
              <Line points={flat} stroke="white" strokeWidth={5} strokeScaleEnabled={false} lineCap="round" opacity={0.8} />
              <Line
                points={flat}
                stroke={line.colour}
                strokeWidth={2}
                strokeScaleEnabled={false}
                lineCap="round"
                dash={line.dashed ? [6 / s, 4 / s] : undefined}
              />
              {line.points.map((p, j) => (
                <Circle
                  key={j}
                  x={p.x}
                  y={p.y}
                  radius={4 / s}
                  fill="white"
                  stroke={line.colour}
                  strokeWidth={2}
                  strokeScaleEnabled={false}
                />
              ))}
              {line.label && mid && (
                <Label x={mid.x} y={mid.y}>
                  <Tag fill={line.colour} cornerRadius={3 / s} pointerDirection="down" pointerWidth={8 / s} pointerHeight={5 / s} />
                  <Text
                    text={line.label}
                    fontSize={13 / s}
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontStyle="bold"
                    fill="white"
                    padding={5 / s}
                  />
                </Label>
              )}
            </Group>
          )
        })}
      </Layer>
    </Stage>
  )
}
