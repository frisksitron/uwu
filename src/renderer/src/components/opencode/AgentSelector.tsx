import { For, type JSX, Show } from 'solid-js'
import { getAgents } from '../../opcodeProject'

interface AgentSelectorProps {
  projectPath: string
  value?: string
  onChange: (agent: string | undefined) => void
}

export default function AgentSelector(props: AgentSelectorProps): JSX.Element {
  const agents = () => getAgents(props.projectPath)

  return (
    <Show when={agents().length > 1}>
      <select
        value={props.value ?? ''}
        onChange={(e) => {
          const val = e.currentTarget.value
          props.onChange(val || undefined)
        }}
        class="bg-transparent border-none rounded px-1 py-0.5 text-[11px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-28 truncate"
        aria-label="Agent"
        title={`Agent: ${props.value || 'Default'}`}
      >
        <option value="">Default</option>
        <For each={agents()}>{(agent) => <option value={agent.name}>{agent.name}</option>}</For>
      </select>
    </Show>
  )
}
