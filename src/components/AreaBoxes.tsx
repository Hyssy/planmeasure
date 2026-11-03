import { Group, Label, Rect, Tag, Text } from 'react-konva'
import { AREA_COLOURS, areaInPoints, FIELD_LABEL, LABEL_FIELDS, type AreaRect, type LabelAreas, type LabelField } from '../lib/labelAreas'


/** Dashed boxes showing the taught title-block areas on the current sheet. */
export default function AreaBoxes(props: {
  areas: LabelAreas
  draft: { field: LabelField; rect: AreaRect } | null
  pageW: number
  pageH: number
  scale: number
}) {
  const { areas, draft, pageW, pageH, scale: s } = props
  const boxes = LABEL_FIELDS.flatMap((f) => (areas[f] ? [{ field: f, rect: areas[f]! }] : []))
  if (draft) boxes.push(draft)
  return (
    <>
      {boxes.map(({ field, rect }, i) => {
        const b = areaInPoints(rect, pageW, pageH)
        const colour = AREA_COLOURS[field]
        return (
          <Group key={`${field}-${i}`}>
            <Rect x={b.x} y={b.y} width={b.w} height={b.h} fill={colour} opacity={0.12} />
            <Rect x={b.x} y={b.y} width={b.w} height={b.h} stroke={colour} strokeWidth={2} dash={[6, 4]} strokeScaleEnabled={false} />
            <Label x={b.x} y={b.y} offsetY={18 / s}>
              <Tag fill={colour} cornerRadius={2 / s} />
              <Text text={FIELD_LABEL[field]} fontSize={11 / s} fontFamily="Arial, Helvetica, sans-serif" fill="white" padding={3 / s} />
            </Label>
          </Group>
        )
      })}
    </>
  )
}
