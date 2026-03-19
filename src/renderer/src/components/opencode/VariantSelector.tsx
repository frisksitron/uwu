import { createEffect, For, type JSX, on, Show } from 'solid-js'
import { getVariants } from '../../opcodeProject'

interface VariantSelectorProps {
  projectPath: string
  model?: { providerID: string; modelID: string }
  value?: string
  onChange: (variant: string | undefined) => void
}

export default function VariantSelector(props: VariantSelectorProps): JSX.Element {
  const variants = () => getVariants(props.projectPath, props.model)

  // Reset variant when model changes and current variant is no longer available
  createEffect(
    on(
      () => props.model,
      () => {
        const available = variants()
        if (available.length === 0 || !props.value) return
        if (!available.includes(props.value)) {
          props.onChange(undefined)
        }
      }
    )
  )

  return (
    <Show when={variants().length > 0}>
      <select
        value={props.value ?? ''}
        onChange={(e) => {
          const val = e.currentTarget.value
          props.onChange(val || undefined)
        }}
        class="bg-transparent border-none rounded px-1 py-0.5 text-[11px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-28 truncate"
        aria-label="Variant"
        title={`Variant: ${props.value || 'Default'}`}
      >
        <option value="">Default</option>
        <For each={variants()}>{(v) => <option value={v}>{v}</option>}</For>
      </select>
    </Show>
  )
}
