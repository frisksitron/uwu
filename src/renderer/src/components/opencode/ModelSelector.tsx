import { createResource, For, type JSX, Show } from 'solid-js'
import { opencodeState } from '../../opencodeStore'

interface ModelSelectorProps {
  projectPath: string
  value?: { providerID: string; modelID: string }
  onChange: (model: { providerID: string; modelID: string }) => void
}

interface ProviderModel {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
}

async function fetchModels(projectPath: string): Promise<ProviderModel[]> {
  const data = (await window.opencodeAPI.providers(projectPath)) as {
    all: Array<{
      id: string
      name: string
      models: Record<string, { id: string; name: string }>
    }>
    connected: Array<string>
  } | null
  if (!data?.all) return []
  const models: ProviderModel[] = []
  const connected = new Set(data.connected ?? [])
  for (const provider of data.all.filter((p) => connected.has(p.id))) {
    for (const [, model] of Object.entries(provider.models)) {
      models.push({
        providerID: provider.id,
        providerName: provider.name,
        modelID: model.id,
        modelName: model.name
      })
    }
  }
  return models
}

export default function ModelSelector(props: ModelSelectorProps): JSX.Element {
  const [models] = createResource(
    () => (opencodeState.servers[props.projectPath] === 'ready' ? props.projectPath : undefined),
    fetchModels
  )

  const currentLabel = (): string => {
    if (!props.value) return 'Default'
    const m = models()?.find(
      (m) => m.providerID === props.value?.providerID && m.modelID === props.value?.modelID
    )
    return m ? m.modelName : props.value.modelID
  }

  return (
    <Show when={models()?.length}>
      <select
        value={props.value ? `${props.value.providerID}:${props.value.modelID}` : ''}
        onChange={(e) => {
          const val = e.currentTarget.value
          if (!val) return
          const [providerID, ...rest] = val.split(':')
          const modelID = rest.join(':')
          props.onChange({ providerID, modelID })
        }}
        class="bg-app border border-border rounded px-2 py-1 text-[11px] text-content cursor-pointer focus:outline-none focus:border-accent transition-colors"
        title={`Model: ${currentLabel()}`}
      >
        <option value="">Default</option>
        <For each={models()}>
          {(model) => (
            <option value={`${model.providerID}:${model.modelID}`}>
              {model.providerName} / {model.modelName}
            </option>
          )}
        </For>
      </select>
    </Show>
  )
}
