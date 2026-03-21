import { type JSX, Show } from 'solid-js'
import { getAgents } from '../../opcodeProject'
import Select from '../ui/Select'

interface AgentSelectorProps {
  projectPath: string
  value?: string
  onChange: (agent: string | undefined) => void
}

export default function AgentSelector(props: AgentSelectorProps): JSX.Element {
  const agents = () => getAgents(props.projectPath)

  return (
    <Show when={agents().length > 1}>
      <Select
        options={agents()}
        value={agents().find((a) => a.name === props.value)}
        onChange={(agent) => props.onChange(agent?.name)}
        optionValue="name"
        optionLabel="name"
        placeholder="Agent"
        size="compact"
        label="Agent"
      />
    </Show>
  )
}
