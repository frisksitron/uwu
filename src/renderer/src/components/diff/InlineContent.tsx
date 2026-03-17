import { For, type JSX } from 'solid-js'
import type { InlineSpan } from '../../lib/inlineDiff'

export default function InlineContent(props: {
  spans: InlineSpan[]
  type: 'add' | 'remove'
}): JSX.Element {
  return (
    <For each={props.spans}>
      {(s) => (
        <span
          classList={{
            'diff-inline-add': s.type === 'change' && props.type === 'add',
            'diff-inline-remove': s.type === 'change' && props.type === 'remove'
          }}
        >
          {s.text}
        </span>
      )}
    </For>
  )
}
