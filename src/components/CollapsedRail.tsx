/** A collapsed side panel: a thin strip with its name; click to open it again. */
export default function CollapsedRail(props: { side: 'left' | 'right'; label: string; onOpen: () => void; testId?: string }) {
  return (
    <button
      onClick={props.onOpen}
      data-testid={props.testId}
      title={`Show ${props.label.toLowerCase()}`}
      aria-label={`Show ${props.label.toLowerCase()}`}
      className={`flex w-7 shrink-0 flex-col items-center gap-2 bg-white py-2 text-xs font-bold text-graphite hover:bg-neutral-100 ${
        props.side === 'left' ? 'border-r' : 'border-l'
      } border-neutral-300`}
    >
      <span className="text-base leading-none">{props.side === 'left' ? '›' : '‹'}</span>
      <span className="h-[7px] w-[7px] bg-signal-orange" />
      <span style={{ writingMode: 'vertical-rl', transform: props.side === 'left' ? 'rotate(180deg)' : undefined }}>{props.label}</span>
    </button>
  )
}

/** The small ‹ / › button in a panel's header that collapses it. */
export function CollapseButton(props: { side: 'left' | 'right'; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={props.onClick}
      data-testid={props.testId}
      title={`Hide ${props.label.toLowerCase()}`}
      aria-label={`Hide ${props.label.toLowerCase()}`}
      className="rounded px-1.5 text-base leading-none text-neutral-500 hover:bg-neutral-100 hover:text-graphite"
    >
      {props.side === 'left' ? '‹' : '›'}
    </button>
  )
}
