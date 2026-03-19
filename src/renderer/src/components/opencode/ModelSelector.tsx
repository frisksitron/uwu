import { For, type JSX, Show } from 'solid-js'
import { getModels } from '../../opcodeProject'

interface ModelSelectorProps {
  projectPath: string
  value?: { providerID: string; modelID: string }
  onChange: (model: { providerID: string; modelID: string } | undefined) => void
}

export default function ModelSelector(props: ModelSelectorProps): JSX.Element {
  const models = () => getModels(props.projectPath)

  const label = (): string => {
    if (!props.value) return 'Default model'
    const m = models().find(
      (m) => m.providerID === props.value?.providerID && m.modelID === props.value?.modelID
    )
    return m ? `${m.providerName} / ${m.modelName}` : props.value.modelID
  }

  return (
    <Show when={models().length > 0}>
      <select
        value={props.value ? `${props.value.providerID}:${props.value.modelID}` : ''}
        onChange={(e) => {
          const val = e.currentTarget.value
          if (!val) {
            props.onChange(undefined)
            return
          }
          const [providerID, ...rest] = val.split(':')
          props.onChange({ providerID, modelID: rest.join(':') })
        }}
        class="bg-transparent border-none rounded px-1 py-0.5 text-[11px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-36 truncate"
        aria-label="Model"
        title={`Model: ${label()}`}
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
