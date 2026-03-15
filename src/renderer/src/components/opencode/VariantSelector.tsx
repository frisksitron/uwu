import { createEffect, createResource, For, type JSX, on, Show } from 'solid-js'
import { opencodeState } from '../../opencodeStore'

interface VariantSelectorProps {
  projectPath: string
  model?: { providerID: string; modelID: string }
  value?: string
  onChange: (variant: string | undefined) => void
}

interface VariantInfo {
  name: string
  disabled?: boolean
}

async function fetchVariants(key: {
  projectPath: string
  model?: { providerID: string; modelID: string }
}): Promise<string[]> {
  if (!key.model) return []
  const selectedModel = key.model
  const data = (await window.opencodeAPI.providers(key.projectPath)) as {
    all: Array<{
      id: string
      models: Record<
        string,
        {
          id: string
          variants?: Record<string, VariantInfo>
        }
      >
    }>
  } | null
  if (!data?.all) return []
  for (const provider of data.all) {
    if (provider.id !== selectedModel.providerID) continue
    for (const [, model] of Object.entries(provider.models)) {
      if (model.id !== selectedModel.modelID) continue
      if (!model.variants) return []
      return Object.entries(model.variants)
        .filter(([, v]) => !v.disabled)
        .map(([name]) => name)
    }
  }
  return []
}

export default function VariantSelector(props: VariantSelectorProps): JSX.Element {
  const [variants] = createResource(() => {
    if (opencodeState.servers[props.projectPath] !== 'ready') return undefined
    return {
      projectPath: props.projectPath,
      model: props.model
    }
  }, fetchVariants)

  // Reset variant when model changes and current variant is no longer available
  createEffect(
    on(
      () => props.model,
      () => {
        const available = variants()
        if (!available || !props.value) return
        if (!available.includes(props.value)) {
          props.onChange(undefined)
        }
      }
    )
  )

  return (
    <Show when={(variants()?.length ?? 0) > 0}>
      <select
        value={props.value ?? ''}
        onChange={(e) => {
          const val = e.currentTarget.value
          props.onChange(val || undefined)
        }}
        class="bg-transparent border-none rounded px-1 py-0.5 text-[10px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-28 truncate"
        title={`Variant: ${props.value || 'Default'}`}
      >
        <option value="">Default</option>
        <For each={variants()}>{(v) => <option value={v}>{v}</option>}</For>
      </select>
    </Show>
  )
}
