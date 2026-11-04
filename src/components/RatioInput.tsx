import { useState } from 'react'
import { formatRatio, parseRatioInput } from '../lib/scale'

/** "Scale 1 : [ 150 ]" — type any scale; Enter applies it. */
export default function RatioInput(props: { initial?: string; onApply: (ratio: number) => void; onCancel: () => void; testId?: string; applyTestId?: string; applyClass?: string }) {
  const [text, setText] = useState(props.initial ?? '')
  const ratio = parseRatioInput(text)
  const showError = text.trim() !== '' && ratio === null
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (ratio) props.onApply(ratio)
      }}
      onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
    >
      <label className="flex items-center gap-1">
        Scale 1 :
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 150"
          aria-label="Scale ratio"
          aria-invalid={showError}
          className={`w-20 rounded border bg-white px-1.5 py-1 tabular-nums focus:outline-none ${showError ? 'border-red-600' : 'border-neutral-300 focus:border-graphite'}`}
          data-testid={props.testId}
        />
      </label>
      <button
        type="submit"
        disabled={!ratio}
        className={props.applyClass ?? 'rounded bg-accent px-2.5 py-1 text-sm font-medium text-graphite hover:bg-accent-hover disabled:opacity-40'}
        data-testid={props.applyTestId}
      >
        {ratio ? `Use ${formatRatio(ratio)}` : 'Apply'}
      </button>
      {showError && <span className="text-xs text-red-700">Type the number after “1:”, e.g. 150</span>}
    </form>
  )
}
