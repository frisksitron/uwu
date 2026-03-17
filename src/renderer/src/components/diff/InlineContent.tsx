import type { JSX } from 'solid-js'
import type { InlineSpan } from '../../lib/inlineDiff'

export default function InlineContent(props: {
  spans: InlineSpan[]
  type: 'add' | 'remove'
}): JSX.Element {
  return (
    <>
      {props.spans.map((s) => (
        <span
          classList={{
            'diff-inline-add': s.type === 'change' && props.type === 'add',
            'diff-inline-remove': s.type === 'change' && props.type === 'remove'
          }}
        >
          {s.text}
        </span>
      ))}
    </>
  )
}
