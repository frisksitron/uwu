import { type JSX, Show } from 'solid-js'
import { getModels, type ProviderModel } from '../../opcodeProject'
import Select, { type SelectGroup } from '../ui/Select'

interface ModelSelectorProps {
  projectPath: string
  value?: { providerID: string; modelID: string }
  onChange: (model: { providerID: string; modelID: string } | undefined) => void
}

export default function ModelSelector(props: ModelSelectorProps): JSX.Element {
  const models = () => getModels(props.projectPath)

  const groups = (): SelectGroup<ProviderModel>[] => {
    const byProvider = new Map<string, ProviderModel[]>()
    for (const m of models()) {
      const list = byProvider.get(m.providerName) ?? []
      list.push(m)
      byProvider.set(m.providerName, list)
    }
    return Array.from(byProvider.entries()).map(([label, options]) => ({ label, options }))
  }

  return (
    <Show when={models().length > 0}>
      <Select<ProviderModel>
        groups={groups()}
        value={models().find(
          (m) => m.providerID === props.value?.providerID && m.modelID === props.value?.modelID
        )}
        onChange={(model) =>
          props.onChange(
            model ? { providerID: model.providerID, modelID: model.modelID } : undefined
          )
        }
        optionValue={(m) => `${m.providerID}:${m.modelID}`}
        optionLabel={(m) => m.modelName}
        placeholder="Model"
        size="compact"
        label="Model"
        triggerClass="inline-flex items-center gap-0.5 bg-transparent border-none rounded px-1 py-0.5 text-[11px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-36 truncate"
      />
    </Show>
  )
}
