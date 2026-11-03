import { MARKUP_COLOURS, MARKUP_LABEL, MARKUP_TYPES, MARKUP_WIDTHS, TEXT_SIZES, type Markup } from '../lib/markup'
import { KIND_LABEL } from '../lib/takeoff'
import { DRAW_STYLES, isTakeoffTool, useApp, type DrawStyle } from '../store'

const STYLE_LABEL: Record<DrawStyle, { label: string; linear?: string; key: string }> = {
  polygon: { label: 'Polygon', linear: 'Lines', key: '1' },
  rectangle: { label: 'Rectangle', key: '2' },
  freehand: { label: 'Freehand', key: '3' },
}

/** Options for the current tool, shown under the toolbar. */
export default function OptionsBar() {
  const tool = useApp((s) => s.tool)
  const drawStyles = useApp((s) => s.drawStyles)
  const setDrawStyle = useApp((s) => s.setDrawStyle)
  const activeItem = useApp((s) => s.items.find((i) => i.id === s.activeItemId))

  const markupOptions = useApp((s) => s.markupOptions)
  const setMarkupOptions = useApp((s) => s.setMarkupOptions)
  const selectedMarkup = useApp((s) => s.markups.find((m) => m.id === s.selectedMarkupId))
  const updateMarkup = useApp((s) => s.updateMarkup)

  if (tool === 'markup') {
    return (
      <Bar>
        <span className="font-medium">Markup</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Markup type">
          {MARKUP_TYPES.map((t) => (
            <Choice key={t} on={markupOptions.type === t} onClick={() => setMarkupOptions({ type: t, ...(t === 'highlight' ? { colour: '#facc15' } : markupOptions.colour === '#facc15' ? { colour: MARKUP_COLOURS[0] } : {}) })}>
              {MARKUP_LABEL[t]}
            </Choice>
          ))}
        </div>
        <Divider />
        <MarkupStyle
          colour={markupOptions.colour}
          width={markupOptions.width}
          fontSize={markupOptions.type === 'text' ? markupOptions.fontSize : undefined}
          showWidth={markupOptions.type !== 'text' && markupOptions.type !== 'highlight'}
          onChange={(patch) => setMarkupOptions(patch)}
        />
      </Bar>
    )
  }

  if (tool === 'select' && selectedMarkup) {
    return (
      <Bar>
        <span className="font-medium">Selected {MARKUP_LABEL[selectedMarkup.type].toLowerCase()}</span>
        <Divider />
        <MarkupStyle
          colour={selectedMarkup.colour}
          width={selectedMarkup.width}
          fontSize={selectedMarkup.type === 'text' ? (selectedMarkup.fontSize ?? 14) : undefined}
          showWidth={selectedMarkup.type !== 'text' && selectedMarkup.type !== 'highlight'}
          onChange={(patch: Partial<Pick<Markup, 'colour' | 'width' | 'fontSize'>>) => updateMarkup(selectedMarkup.id, patch)}
        />
      </Bar>
    )
  }

  if (!isTakeoffTool(tool)) return null
  const item = activeItem?.kind === tool ? activeItem : undefined

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-neutral-300 bg-neutral-50 px-3 text-sm" data-testid="options-bar">
      <span className="font-medium">{KIND_LABEL[tool]}</span>
      <span className="flex items-center gap-1.5 text-neutral-600">
        into
        {item ? (
          <>
            <span className="h-3 w-3 rounded-sm" style={{ background: item.colour }} />
            <span className="font-medium text-neutral-900">{item.name}</span>
          </>
        ) : (
          <span className="italic">a new item</span>
        )}
      </span>
      {tool !== 'count' && (
        <>
          <div className="h-5 w-px bg-neutral-300" />
          <span className="text-neutral-600">Draw:</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Drawing style">
            {DRAW_STYLES[tool].map((style) => (
              <button
                key={style}
                role="radio"
                aria-checked={drawStyles[tool] === style}
                onClick={() => setDrawStyle(tool, style)}
                title={`${STYLE_LABEL[style].label} (${STYLE_LABEL[style].key})`}
                className={`rounded px-2 py-0.5 ${
                  drawStyles[tool] === style ? 'bg-neutral-800 text-white' : 'border border-neutral-300 bg-white hover:bg-neutral-100'
                }`}
              >
                {(tool === 'linear' && STYLE_LABEL[style].linear) || STYLE_LABEL[style].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-3 border-b border-neutral-300 bg-neutral-50 px-3 py-1 text-sm" data-testid="options-bar">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-neutral-300" />
}

function Choice(props: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      role="radio"
      aria-checked={props.on}
      onClick={props.onClick}
      title={props.title}
      className={`rounded px-2 py-0.5 ${props.on ? 'bg-neutral-800 text-white' : 'border border-neutral-300 bg-white hover:bg-neutral-100'}`}
    >
      {props.children}
    </button>
  )
}

/** Colour, line weight and text size pickers for markups. */
function MarkupStyle(props: {
  colour: string
  width: number
  fontSize?: number
  showWidth: boolean
  onChange: (patch: { colour?: string; width?: number; fontSize?: number }) => void
}) {
  return (
    <>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
        {MARKUP_COLOURS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={props.colour === c}
            aria-label={c}
            onClick={() => props.onChange({ colour: c })}
            className={`h-5 w-5 rounded-sm border border-neutral-300 ${props.colour === c ? 'ring-2 ring-neutral-900 ring-offset-1' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
      {props.showWidth && (
        <>
          <Divider />
          <div className="flex gap-1" role="radiogroup" aria-label="Line weight">
            {MARKUP_WIDTHS.map((w) => (
              <Choice key={w.pt} on={props.width === w.pt} onClick={() => props.onChange({ width: w.pt })}>
                {w.label}
              </Choice>
            ))}
          </div>
        </>
      )}
      {props.fontSize !== undefined && (
        <>
          <Divider />
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Text size">
            <span className="text-neutral-600">Size:</span>
            {TEXT_SIZES.map((sz) => (
              <Choice key={sz} on={props.fontSize === sz} onClick={() => props.onChange({ fontSize: sz })}>
                {sz}
              </Choice>
            ))}
          </div>
        </>
      )}
    </>
  )
}
