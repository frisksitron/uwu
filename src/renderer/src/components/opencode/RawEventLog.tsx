import { createEffect, For, type JSX } from 'solid-js'
import type { RawEvent } from '../../opencodeStore'

interface RawEventLogProps {
  events: RawEvent[]
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })
}

export default function RawEventLog(props: RawEventLogProps): JSX.Element {
  let scrollRef: HTMLDivElement | undefined

  createEffect(() => {
    props.events.length
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight
    }
  })

  return (
    <div ref={scrollRef} class="h-full overflow-y-auto bg-app font-mono text-[11px] p-2">
      <For each={props.events}>
        {(ev) => (
          <div class="mb-1 border-b border-border/30 pb-1">
            <div class="flex gap-2 text-muted">
              <span class="text-content/60 flex-shrink-0">{formatTime(ev.timestamp)}</span>
              <span class="text-accent font-semibold">{ev.type}</span>
            </div>
            <pre class="text-content/70 whitespace-pre-wrap break-all m-0 mt-0.5 leading-tight">
              {JSON.stringify(ev.data, null, 2)}
            </pre>
          </div>
        )}
      </For>
    </div>
  )
}
