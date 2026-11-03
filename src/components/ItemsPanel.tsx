import { useMemo, useState } from 'react'
import {
  formatQuantity,
  ITEM_COLOURS,
  itemTotal,
  KIND_LABEL,
  KIND_UNIT,
  takeoffQuantity,
  type Item,
  type SheetScaleInfo,
  type TakeoffKind,
} from '../lib/takeoff'
import { scaleInfo, sheetName, TAKEOFF_TOOLS, useApp } from '../store'

type Scope = 'sheet' | 'project'

/** Right-hand panel: takeoff items with running totals. */
export default function ItemsPanel() {
  const items = useApp((s) => s.items)
  const takeoffs = useApp((s) => s.takeoffs)
  const scales = useApp((s) => s.scales)
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const selectedSheetId = useApp((s) => s.selectedSheetId)
  const activeItemId = useApp((s) => s.activeItemId)
  const [scope, setScope] = useState<Scope>('project')
  const [adding, setAdding] = useState(false)

  const scaleInfos = useMemo(() => {
    const out: Record<string, SheetScaleInfo | undefined> = {}
    for (const [id, sc] of Object.entries(scales)) out[id] = scaleInfo(sc)
    return out
  }, [scales])

  const inScope = scope === 'sheet' ? takeoffs.filter((t) => t.sheetId === selectedSheetId) : takeoffs
  const sheetLabel = (id: string) => {
    const i = sheets.findIndex((s) => s.id === id)
    return sheetName(labels[id], i)
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-300 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Items &amp; quantities</span>
        <button
          onClick={() => setAdding((a) => !a)}
          disabled={!sheets.length}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          + Item
        </button>
      </div>

      {adding && <NewItemForm onDone={() => setAdding(false)} />}

      <div className="flex gap-1 border-b border-neutral-200 px-3 py-1.5 text-xs" role="tablist">
        {(['project', 'sheet'] as Scope[]).map((sc) => (
          <button
            key={sc}
            role="tab"
            aria-selected={scope === sc}
            onClick={() => setScope(sc)}
            className={`rounded px-2 py-0.5 ${scope === sc ? 'bg-neutral-800 text-white' : 'hover:bg-neutral-100'}`}
          >
            {sc === 'project' ? 'Whole project' : 'This sheet'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-neutral-500">
            No items yet. Pick Linear, Area, Perimeter or Count in the toolbar and start drawing, or add an item with
            “+ Item”.
          </p>
        ) : (
          <ul data-testid="items">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                active={item.id === activeItemId}
                total={itemTotal(item, inScope, scaleInfos)}
                showSheets={scope === 'project'}
                sheetLabel={sheetLabel}
              />
            ))}
          </ul>
        )}
      </div>

      <SelectedShape scaleInfos={scaleInfos} />
    </aside>
  )
}

function ItemRow(props: {
  item: Item
  active: boolean
  total: ReturnType<typeof itemTotal>
  showSheets: boolean
  sheetLabel: (id: string) => string
}) {
  const { item, active, total, showSheets, sheetLabel } = props
  const activateItem = useApp((s) => s.activateItem)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)

  if (editing) return <EditItemForm item={item} onDone={() => setEditing(false)} />

  return (
    <li
      data-testid="item-row"
      className={`border-b border-neutral-100 px-3 py-2 ${active ? 'bg-blue-50' : 'hover:bg-neutral-50'}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: item.colour }} />
        <button className="min-w-0 flex-1 text-left" onClick={() => activateItem(item.id)} title="Draw more of this item">
          <div className="truncate text-sm font-medium" data-testid="item-name">
            {item.name}
          </div>
          <div className="text-xs text-neutral-500">
            {KIND_LABEL[item.kind]}
            {item.trade && ` · ${item.trade}`}
          </div>
        </button>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums" data-testid="item-total">
            {formatQuantity(total.total, item.kind)}
            {item.kind === 'count' && <span className="font-normal text-neutral-500"> each</span>}
          </div>
          <button onClick={() => setEditing(true)} className="text-xs text-neutral-500 hover:text-neutral-900">
            Edit
          </button>
        </div>
      </div>
      {(total.unscaled > 0 || total.unverified > 0) && (
        <div className="mt-1 space-y-0.5 text-xs" data-testid="item-warnings">
          {total.unscaled > 0 && (
            <div className="text-red-700">
              ⚠ {total.unscaled} shape{total.unscaled > 1 ? 's' : ''} on unscaled sheets not counted
            </div>
          )}
          {total.unverified > 0 && (
            <div className="text-amber-800">
              ⚠ includes {total.unverified} shape{total.unverified > 1 ? 's' : ''} on an unverified scale
            </div>
          )}
        </div>
      )}
      {showSheets && total.bySheet.length > 0 && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-blue-700 hover:underline">
            {open ? 'Hide' : 'Show'} by sheet ({total.bySheet.length})
          </button>
          {open && (
            <table className="mt-1 w-full text-xs">
              <tbody>
                {total.bySheet.map((row) => (
                  <tr key={row.sheetId}>
                    <td className="py-0.5 text-neutral-600">{sheetLabel(row.sheetId)}</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {row.unscaled > 0 && row.total === 0 ? (
                        <span className="text-red-700">no scale</span>
                      ) : (
                        <>
                          {formatQuantity(row.total, item.kind)}
                          {row.unverified > 0 && <span className="text-amber-800"> ⚠</span>}
                          {row.unscaled > 0 && <span className="text-red-700"> + {row.unscaled} unscaled</span>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </li>
  )
}

function NewItemForm({ onDone }: { onDone: () => void }) {
  const addItem = useApp((s) => s.addItem)
  const activateItem = useApp((s) => s.activateItem)
  const count = useApp((s) => s.items.length)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TakeoffKind>('linear')
  const [trade, setTrade] = useState('')
  const [colour, setColour] = useState(ITEM_COLOURS[count % ITEM_COLOURS.length])
  return (
    <form
      className="space-y-2 border-b border-neutral-200 bg-neutral-50 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const id = addItem(kind, { name: name.trim() || undefined, trade: trade.trim(), colour })
        activateItem(id)
        onDone()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name, e.g. Internal wall – plasterboard"
        aria-label="Item name"
        className="w-full rounded border border-neutral-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TakeoffKind)}
          aria-label="Item type"
          className="flex-1 rounded border border-neutral-300 bg-white px-1.5 py-1"
        >
          {TAKEOFF_TOOLS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]} ({KIND_UNIT[k]})
            </option>
          ))}
        </select>
        <ColourPicker value={colour} onChange={setColour} />
      </div>
      <input
        value={trade}
        onChange={(e) => setTrade(e.target.value)}
        placeholder="Trade (optional), e.g. Plastering"
        aria-label="Trade"
        className="w-full rounded border border-neutral-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
      />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onDone} className="rounded px-2 py-1 text-xs hover:bg-neutral-200">
          Cancel
        </button>
        <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
          Add and start drawing
        </button>
      </div>
    </form>
  )
}

function EditItemForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const updateItem = useApp((s) => s.updateItem)
  const deleteItem = useApp((s) => s.deleteItem)
  const shapes = useApp((s) => s.takeoffs.filter((t) => t.itemId === item.id).length)
  const [name, setName] = useState(item.name)
  const [trade, setTrade] = useState(item.trade)
  const [colour, setColour] = useState(item.colour)
  return (
    <li className="border-b border-neutral-200 bg-neutral-50 p-3">
      <form
        className="space-y-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          updateItem(item.id, { name: name.trim() || item.name, trade: trade.trim(), colour })
          onDone()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
      >
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Item name"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
          />
          <ColourPicker value={colour} onChange={setColour} />
        </div>
        <input
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          placeholder="Trade (optional)"
          aria-label="Trade"
          className="w-full rounded border border-neutral-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-red-700 hover:underline"
            onClick={() => {
              if (shapes === 0 || confirm(`Delete “${item.name}” and its ${shapes} shape${shapes > 1 ? 's' : ''}? (Ctrl+Z can undo.)`)) {
                deleteItem(item.id)
                onDone()
              }
            }}
          >
            Delete item
          </button>
          <div className="flex gap-1">
            <button type="button" onClick={onDone} className="rounded px-2 py-1 text-xs hover:bg-neutral-200">
              Cancel
            </button>
            <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
              Save
            </button>
          </div>
        </div>
      </form>
    </li>
  )
}

function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Colour">
      {ITEM_COLOURS.slice(0, 5).map((c) => (
        <Swatch key={c} c={c} value={value} onChange={onChange} />
      ))}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded px-1 text-xs text-neutral-500 hover:bg-neutral-200">more</summary>
        <div className="absolute right-0 z-10 mt-1 flex gap-1 rounded border border-neutral-200 bg-white p-1 shadow">
          {ITEM_COLOURS.slice(5).map((c) => (
            <Swatch key={c} c={c} value={value} onChange={onChange} />
          ))}
        </div>
      </details>
    </div>
  )
}

function Swatch({ c, value, onChange }: { c: string; value: string; onChange: (c: string) => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={value === c}
      aria-label={c}
      onClick={() => onChange(c)}
      className={`h-5 w-5 rounded-sm ${value === c ? 'ring-2 ring-neutral-900 ring-offset-1' : ''}`}
      style={{ background: c }}
    />
  )
}

/** Details of the selected shape, with actions. */
function SelectedShape({ scaleInfos }: { scaleInfos: Record<string, SheetScaleInfo | undefined> }) {
  const selectedId = useApp((s) => s.selectedTakeoffId)
  const takeoff = useApp((s) => s.takeoffs.find((t) => t.id === selectedId))
  const items = useApp((s) => s.items)
  const updateTakeoff = useApp((s) => s.updateTakeoff)
  const deleteTakeoff = useApp((s) => s.deleteTakeoff)
  if (!takeoff) return null
  const item = items.find((i) => i.id === takeoff.itemId)
  if (!item) return null
  const q = takeoffQuantity(takeoff, item.kind, scaleInfos[takeoff.sheetId])
  return (
    <div className="border-t border-neutral-300 bg-neutral-50 p-3 text-sm" data-testid="selected-shape">
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Selected shape</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {q.value === null ? 'No scale' : formatQuantity(q.value, item.kind)}
        {item.kind === 'count' && ' each'}
        {q.state === 'unverified' && item.kind !== 'count' && q.value !== null && (
          <span className="ml-1 text-xs font-normal text-amber-800">unverified scale</span>
        )}
      </div>
      <label className="mt-2 block text-xs text-neutral-600">
        Item
        <select
          value={takeoff.itemId}
          onChange={(e) => updateTakeoff(takeoff.id, { itemId: e.target.value })}
          className="mt-0.5 block w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-sm"
        >
          {items
            .filter((i) => i.kind === item.kind)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
      </label>
      <div className="mt-2 flex justify-end">
        <button onClick={() => deleteTakeoff(takeoff.id)} className="text-xs text-red-700 hover:underline">
          Delete shape
        </button>
      </div>
    </div>
  )
}
