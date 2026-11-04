import { usePanels, type DimensionPrefs } from '../panels'

/** Personal display settings: dimensions and snapping. Saved in this browser. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dims = usePanels((s) => s.dims)
  const setDims = usePanels((s) => s.setDims)
  const snap = usePanels((s) => s.snap)
  const setSnap = usePanels((s) => s.setSnap)
  const advanced = usePanels((s) => s.advanced)
  const setAdvanced = usePanels((s) => s.setAdvanced)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="w-[30rem] rounded-lg border border-neutral-300 bg-white p-4 text-sm text-graphite"
        role="dialog"
        aria-labelledby="settings-title"
        data-testid="settings-dialog"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold">
            Settings
          </h2>
          <button onClick={onClose} className="rounded px-2 py-0.5 hover:bg-neutral-100" aria-label="Close settings">
            ×
          </button>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">These are your own preferences, saved in this browser.</p>

        <h3 className="section-label mt-4">Dimensions</h3>
        <p className="mt-0.5 text-xs text-neutral-500">The length of each segment, for the Measure tool, Linear runs and area/perimeter edges.</p>
        <Row label="Show">
          <Choices<DimensionPrefs['show']>
            value={dims.show}
            onChange={(show) => setDims({ show })}
            options={[
              ['selected', 'Selected shape'],
              ['all', 'All shapes'],
              ['off', 'Off'],
            ]}
            testId="dims-show"
          />
        </Row>
        <Row label="Style">
          <Choices<DimensionPrefs['style']>
            value={dims.style}
            onChange={(style) => setDims({ style })}
            options={[
              ['offset', 'Beside the line'],
              ['on', 'On the line'],
            ]}
            testId="dims-style"
          />
        </Row>
        <Row label="Units">
          <Choices<DimensionPrefs['units']>
            value={dims.units}
            onChange={(units) => setDims({ units })}
            options={[
              ['m', 'Metres (3.60 m)'],
              ['mm', 'Millimetres (3600)'],
            ]}
            testId="dims-units"
          />
        </Row>
        <Row label="Text">
          <Choices<DimensionPrefs['size']>
            value={dims.size}
            onChange={(size) => setDims({ size })}
            options={[
              ['normal', 'Normal'],
              ['large', 'Large'],
            ]}
            testId="dims-size"
          />
        </Row>
        <p className="mt-1 text-xs text-neutral-500">
          “Beside the line” puts room dimensions outside the room. To swap sides on one shape, select it and use “Flip dimension side”.
        </p>

        <h3 className="section-label mt-4">Snapping</h3>
        <label className="mt-1 flex items-center gap-2">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          Snap to the drawing’s line ends, corners, midpoints and intersections
        </label>
        <p className="mt-0.5 text-xs text-neutral-500">Shortcut S. Hold Alt to draw freely. On flattened plans snapping is approximate.</p>

        <h3 className="section-label mt-4">Advanced features</h3>
        <p className="mt-0.5 text-xs text-neutral-500">Switch these on when you need them.</p>
        <label className="mt-1 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={advanced.scaleAreas} onChange={(e) => setAdvanced({ scaleAreas: e.target.checked })} data-testid="adv-scale-areas" />
          <span>
            Different scales on one page
            <span className="block text-xs text-neutral-500">Adds “+ Scale area” to the scale bar: box a detail drawn at another scale and give it its own scale.</span>
          </span>
        </label>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded bg-accent px-3 py-1.5 font-medium text-graphite hover:bg-accent-hover">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="w-12 shrink-0 text-xs text-neutral-600">{label}</span>
      {children}
    </div>
  )
}

function Choices<T extends string>(props: { value: T; onChange: (v: T) => void; options: [T, string][]; testId?: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" data-testid={props.testId}>
      {props.options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={props.value === v}
          onClick={() => props.onChange(v)}
          className={`rounded px-2 py-0.5 ${props.value === v ? 'bg-neutral-800 text-white' : 'border border-neutral-300 bg-white hover:bg-neutral-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
