import { createEffect, type JSX, on, Show } from 'solid-js'
import { getVariants } from '../../opcodeProject'
import Select from '../ui/Select'

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
      <Select<string>
        options={variants()}
        value={props.value}
        onChange={props.onChange}
        placeholder="Variant"
        size="compact"
        label="Variant"
      />
    </Show>
  )
}
