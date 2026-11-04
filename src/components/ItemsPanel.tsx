import { useMemo, useState } from 'react'
import { usePanels } from '../panels'
import CollapsedRail, { CollapseButton } from './CollapsedRail'
import {
  groupItems,
  groupOf,
  groupTotal,
  type ItemGroup,
  formatQuantity,
  grossAreaM2,
  netAreaM2,
  perimeterM,
  ITEM_COLOURS,
  itemTotal,
  KIND_LABEL,
  KIND_UNIT,
  takeoffQuantity,
  type Item,
  type SheetScaleInfo,
  type Takeoff,
  type TakeoffKind,
} from '../lib/takeoff'
import { sheetName, TAKEOFF_TOOLS, takeoffScales, useApp } from '../store'

type Scope = 'sheet' | 'project'

/** Right-hand panel: takeoff items with running totals. */
export default function ItemsPanel() {
  const panelOpen = usePanels((s) => s.open.items)
  const setPanel = usePanels((s) => s.setPanel)
  const items = useApp((s) => s.items)
  const takeoffs = useApp((s) => s.takeoffs)
  const scales = useApp((s) => s.scales)
  const sheets = useApp((s) => s.sheets)
  const labels = useApp((s) => s.labels)
  const selectedSheetId = useApp((s) => s.selectedSheetId)
  const activeItemId = useApp((s) => s.activeItemId)
  const itemsPerSheet = useApp((s) => s.itemsPerSheet)
  const setItemsPerSheet = useApp((s) => s.setItemsPerSheet)
  const [scope, setScope] = useState<Scope>('project')
  const [adding, setAdding] = useState(false)

  const scaleRegions = useApp((s) => s.scaleRegions)
  // each shape's scale: its scale area, else its sheet's (shapes crossing an area's edge have none)
  const scaleInfos = useMemo(() => takeoffScales({ scales, scaleRegions }), [scales, scaleRegions])

  const inScope = scope === 'sheet' ? takeoffs.filter((t) => t.sheetId === selectedSheetId) : takeoffs
  const sheetLabel = (id: string) => {
    const i = sheets.findIndex((s) => s.id === id)
    return sheetName(labels[id], i)
  }

  if (!panelOpen) return <CollapsedRail side="right" label="Items & quantities" onOpen={() => setPanel('items', true)} testId="open-items" />

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-300 bg-white" data-testid="items-panel">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <CollapseButton side="right" label="Items panel" onClick={() => setPanel('items', false)} testId="hide-items" />
        <span className="section-label mr-auto">Items &amp; quantities</span>
        <button
          onClick={() => setAdding((a) => !a)}
          disabled={!sheets.length}
          className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-graphite hover:bg-accent-hover disabled:opacity-40"
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
      <label
        className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 text-xs text-neutral-600"
        title="On: drawing an item on another sheet starts that sheet's own item, grouped with the others so their totals add together. Off: one item collects shapes from every sheet."
      >
        <input type="checkbox" checked={itemsPerSheet} onChange={(e) => setItemsPerSheet(e.target.checked)} data-testid="items-per-sheet" />
        New item for each sheet (totals added together)
      </label>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-neutral-500">
            No items yet. Pick Linear, Area, Perimeter or Count in the toolbar and start drawing, or add an item with
            “+ Item”.
          </p>
        ) : (
          <ul data-testid="items">
            {groupItems(items).map((group) => {
              // "This sheet": just the part of each group on this sheet
              const shown =
                scope === 'sheet'
                  ? group.items.filter((i) => i.sheetId === selectedSheetId || (!i.sheetId && inScope.some((t) => t.itemId === i.id)))
                  : group.items
              if (!shown.length) return null
              if (shown.length === 1) {
                return (
                  <ItemRow
                    key={group.id}
                    item={shown[0]}
                    active={shown[0].id === activeItemId}
                    total={itemTotal(shown[0], inScope, scaleInfos)}
                    showSheets={scope === 'project' && !shown[0].sheetId}
                    sheetLabel={sheetLabel}
                  />
                )
              }
              return (
                <GroupRow
                  key={group.id}
                  group={{ ...group, items: shown }}
                  activeItemId={activeItemId}
                  totals={groupTotal({ ...group, items: shown }, inScope, scaleInfos)}
                  sheetLabel={sheetLabel}
                />
              )
            })}
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
      className={`border-b border-neutral-100 px-3 py-2 ${active ? 'bg-signal-orange-4/25' : 'hover:bg-neutral-50'}`}
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
            {item.sheetId && <span data-testid="item-sheet"> · {sheetLabel(item.sheetId)}</span>}
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
              {total.unscaled} shape{total.unscaled > 1 ? 's' : ''} without a scale not counted
            </div>
          )}
          {total.unverified > 0 && (
            <div className="text-accent-text">
              includes {total.unverified} shape{total.unverified > 1 ? 's' : ''} on an unverified scale
            </div>
          )}
        </div>
      )}
      {showSheets && total.bySheet.length > 0 && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-accent-text hover:underline">
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
                          {row.unverified > 0 && <span className="text-accent-text" title="unverified scale"> (unverified)</span>}
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
        className="w-full rounded border border-neutral-300 px-2 py-1 focus:border-graphite focus:outline-none"
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
        className="w-full rounded border border-neutral-300 px-2 py-1 focus:border-graphite focus:outline-none"
      />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onDone} className="rounded px-2 py-1 text-xs hover:bg-neutral-200">
          Cancel
        </button>
        <button type="submit" className="rounded bg-accent px-2 py-1 text-xs font-medium text-graphite hover:bg-accent-hover">
          Add and start drawing
        </button>
      </div>
    </form>
  )
}

function EditItemForm({ item, onDone, wholeGroup }: { item: Item; onDone: () => void; wholeGroup?: boolean }) {
  const updateItem = useApp((s) => s.updateItem)
  const deleteItemOne = useApp((s) => s.deleteItem)
  const deleteGroup = useApp((s) => s.deleteGroup)
  const deleteItem = (id: string) => (wholeGroup ? deleteGroup(groupOf(item)) : deleteItemOne(id))
  const shapes = useApp((s) =>
    s.takeoffs.filter((t) => (wholeGroup ? s.items.some((i) => i.id === t.itemId && groupOf(i) === groupOf(item)) : t.itemId === item.id)).length,
  )
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
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 focus:border-graphite focus:outline-none"
          />
          <ColourPicker value={colour} onChange={setColour} />
        </div>
        <input
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          placeholder="Trade (optional)"
          aria-label="Trade"
          className="w-full rounded border border-neutral-300 px-2 py-1 focus:border-graphite focus:outline-none"
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
            <button type="submit" className="rounded bg-accent px-2 py-1 text-xs font-medium text-graphite hover:bg-accent-hover">
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
        <div className="absolute right-0 z-10 mt-1 flex gap-1 rounded border border-neutral-300 bg-white p-1">
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
function SelectedShape({ scaleInfos }: { scaleInfos: (t: Takeoff) => SheetScaleInfo | undefined }) {
  const selectedId = useApp((s) => s.selectedTakeoffId)
  const takeoff = useApp((s) => s.takeoffs.find((t) => t.id === selectedId))
  const items = useApp((s) => s.items)
  const updateTakeoff = useApp((s) => s.updateTakeoff)
  const deleteTakeoff = useApp((s) => s.deleteTakeoff)
  const startCutout = useApp((s) => s.startCutout)
  const removeCutout = useApp((s) => s.removeCutout)
  const cutoutFor = useApp((s) => s.cutoutFor)
  const dimStyle = usePanels((s) => s.dims.style)
  if (!takeoff) return null
  const item = items.find((i) => i.id === takeoff.itemId)
  if (!item) return null
  const q = takeoffQuantity(takeoff, item.kind, scaleInfos(takeoff))
  return (
    <div className="border-t border-neutral-300 bg-neutral-50 p-3 text-sm" data-testid="selected-shape">
      <div className="section-label">Selected shape</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {q.value === null ? 'No scale' : formatQuantity(q.value, item.kind)}
        {item.kind === 'count' && ' each'}
        {q.state === 'unverified' && item.kind !== 'count' && q.value !== null && (
          <span className="ml-1 text-xs font-normal text-accent-text">unverified scale</span>
        )}
      </div>
      {item.kind === 'area' && (
        <AreaBreakdown
          takeoff={takeoff}
          scale={scaleInfos(takeoff)}
          drawing={cutoutFor === takeoff.id}
          onAdd={() => startCutout(takeoff.id)}
          onRemove={(i) => removeCutout(takeoff.id, i)}
        />
      )}
      <label className="mt-2 block text-xs text-neutral-600">
        Item
        <select
          value={takeoff.itemId}
          onChange={(e) => updateTakeoff(takeoff.id, { itemId: e.target.value })}
          className="mt-0.5 block w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-sm"
        >
          {items
            .filter((i) => i.kind === item.kind && (!i.sheetId || i.sheetId === takeoff.sheetId))
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
      </label>
      <div className="mt-2 flex items-center justify-between">
        {item.kind !== 'count' && dimStyle === 'offset' ? (
          <button
            onClick={() => updateTakeoff(takeoff.id, { dimFlip: !takeoff.dimFlip })}
            className="text-xs text-accent-text hover:underline"
            title="Put this shape's dimensions on the other side of its lines"
            data-testid="flip-dims"
          >
            Flip dimension side
          </button>
        ) : (
          <span />
        )}
        <button onClick={() => deleteTakeoff(takeoff.id)} className="text-xs text-red-700 hover:underline">
          Delete shape
        </button>
      </div>
    </div>
  )
}

/** Gross area, cut-outs and net area for a selected area shape. */
function AreaBreakdown(props: {
  takeoff: Takeoff
  scale: SheetScaleInfo | undefined
  drawing: boolean
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const { takeoff: t, scale, drawing } = props
  const k = scale?.realMmPerPt
  const fmt = (v: number) => (k ? formatQuantity(v, 'area') : '—')
  return (
    <div className="mt-2 rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="area-breakdown">
      <table className="w-full">
        <tbody>
          <tr>
            <td className="text-neutral-600">Gross area</td>
            <td className="text-right tabular-nums">{fmt(k ? grossAreaM2(t.points, k) : 0)}</td>
          </tr>
          {t.holes.map((h, i) => (
            <tr key={i}>
              <td className="text-neutral-600">
                Cut-out {i + 1}{' '}
                <button onClick={() => props.onRemove(i)} className="text-red-700 hover:underline">
                  remove
                </button>
              </td>
              <td className="text-right tabular-nums">− {fmt(k ? grossAreaM2(h, k) : 0)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td>Net area</td>
            <td className="text-right tabular-nums">{fmt(k ? netAreaM2(t.points, t.holes, k) : 0)}</td>
          </tr>
          <tr>
            <td className="text-neutral-600">Outer perimeter</td>
            <td className="text-right tabular-nums">{k ? formatQuantity(perimeterM(t.points, k), 'perimeter') : '—'}</td>
          </tr>
        </tbody>
      </table>
      <button
        onClick={props.onAdd}
        disabled={drawing}
        className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 font-medium hover:bg-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-500"
      >
        {drawing ? 'Drawing cut-out… (Esc to stop)' : '+ Add cut-out'}
      </button>
    </div>
  )
}

/** An item measured on several sheets: one row per sheet, with the sheets added together. */
function GroupRow(props: {
  group: ItemGroup
  activeItemId: string | null
  totals: ReturnType<typeof groupTotal>
  sheetLabel: (id: string) => string
}) {
  const { group, activeItemId, totals, sheetLabel } = props
  const first = group.items[0]
  const activateItem = useApp((s) => s.activateItem)
  const selectSheet = useApp((s) => s.selectSheet)
  const selectedSheetId = useApp((s) => s.selectedSheetId)
  const deleteItem = useApp((s) => s.deleteItem)
  const combineGroup = useApp((s) => s.combineGroup)
  const takeoffs = useApp((s) => s.takeoffs)
  const [editing, setEditing] = useState(false)

  if (editing) return <EditItemForm item={first} wholeGroup onDone={() => setEditing(false)} />

  const forThisSheet = group.items.find((i) => i.sheetId === selectedSheetId) ?? first
  return (
    <li data-testid="item-group" className="border-b border-neutral-100 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: first.colour }} />
        <button className="min-w-0 flex-1 text-left" onClick={() => activateItem(forThisSheet.id)} title="Draw more of this item on this sheet">
          <div className="truncate text-sm font-medium" data-testid="item-name">
            {first.name}
          </div>
          <div className="text-xs text-neutral-500">
            {KIND_LABEL[first.kind]}
            {first.trade && ` · ${first.trade}`} · {group.items.length} sheets
          </div>
        </button>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums" data-testid="item-total" title="All sheets added together">
            {formatQuantity(totals.total, first.kind)}
            {first.kind === 'count' && <span className="font-normal text-neutral-500"> each</span>}
          </div>
          <button onClick={() => setEditing(true)} className="text-xs text-neutral-500 hover:text-neutral-900">
            Edit
          </button>
        </div>
      </div>
      <ul className="mt-1.5 ml-5 border-l border-neutral-200" data-testid="group-sheets">
        {totals.parts.map(({ item, total }) => {
          const shapes = takeoffs.filter((t) => t.itemId === item.id).length
          return (
            <li
              key={item.id}
              data-testid="group-sheet-row"
              className={`flex items-center gap-2 py-0.5 pl-2 text-xs ${item.id === activeItemId ? 'bg-signal-orange-4/25' : ''}`}
            >
              <button
                className="min-w-0 flex-1 truncate text-left text-neutral-700 hover:underline"
                title="Draw more on this sheet"
                onClick={() => {
                  if (item.sheetId && item.sheetId !== selectedSheetId) selectSheet(item.sheetId)
                  activateItem(item.id)
                }}
              >
                {item.sheetId ? sheetLabel(item.sheetId) : 'All sheets'}
              </button>
              <span className="tabular-nums">
                {total.unscaled > 0 && total.total === 0 ? (
                  <span className="text-red-700">no scale</span>
                ) : (
                  <>
                    {formatQuantity(total.total, item.kind)}
                    {total.unverified > 0 && <span className="text-accent-text" title="unverified scale"> (unverified)</span>}
                    {total.unscaled > 0 && <span className="text-red-700"> + {total.unscaled} unscaled</span>}
                  </>
                )}
              </span>
              <button
                className="text-neutral-400 hover:text-red-700"
                title="Remove this sheet’s item"
                aria-label={`Remove ${item.sheetId ? sheetLabel(item.sheetId) : 'this'} from ${item.name}`}
                onClick={() => {
                  if (shapes === 0 || confirm(`Remove “${item.name}” on ${item.sheetId ? sheetLabel(item.sheetId) : 'all sheets'} and its ${shapes} shape${shapes > 1 ? 's' : ''}? (Ctrl+Z can undo.)`)) {
                    deleteItem(item.id)
                  }
                }}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
      {(totals.unscaled > 0 || totals.unverified > 0) && (
        <div className="mt-1 space-y-0.5 text-xs" data-testid="item-warnings">
          {totals.unscaled > 0 && <div className="text-red-700">{totals.unscaled} shape{totals.unscaled > 1 ? 's' : ''} without a scale not counted</div>}
          {totals.unverified > 0 && <div className="text-accent-text">includes {totals.unverified} shape{totals.unverified > 1 ? 's' : ''} on an unverified scale</div>}
        </div>
      )}
      <button
        onClick={() => combineGroup(group.id)}
        className="mt-1 text-xs text-accent-text hover:underline"
        title="Merge these sheets into a single item (Ctrl+Z can undo)"
      >
        Combine into one item
      </button>
    </li>
  )
}
