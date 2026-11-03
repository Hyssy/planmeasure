import type { MeasureText } from './markup'

/** Text measured with the same font the screen draws (Arial), in points. */
let measureCtx: CanvasRenderingContext2D | null = null
export const measureScreenText: MeasureText = (line, size) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return line.length * size * 0.55
  measureCtx.font = `${size}px Arial, Helvetica, sans-serif`
  return measureCtx.measureText(line).width
}

