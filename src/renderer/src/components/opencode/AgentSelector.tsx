import { createResource, For, type JSX, Show } from 'solid-js'
import { opencodeState } from '../../opencodeStore'

interface AgentSelectorProps {
  projectPath: string
  value?: string
  onChange: (agent: string | undefined) => void
}

interface AgentInfo {
  name: string
  description?: string
  mode: 'subagent' | 'primary' | 'all'
  hidden?: boolean
  color?: string
}

async function fetchAgents(projectPath: string): Promise<AgentInfo[]> {
  const data = (await window.opencodeAPI.agents(projectPath)) as AgentInfo[] | null
  if (!data) return []
  return data.filter((a) => !a.hidden && (a.mode === 'primary' || a.mode === 'all'))
}

export default function AgentSelector(props: AgentSelectorProps): JSX.Element {
  const [agents] = createResource(
    () => (opencodeState.servers[props.projectPath] === 'ready' ? props.projectPath : undefined),
    fetchAgents
  )

  return (
    <Show when={(agents()?.length ?? 0) > 1}>
      <select
        value={props.value ?? ''}
        onChange={(e) => {
          const val = e.currentTarget.value
          props.onChange(val || undefined)
        }}
        class="bg-transparent border-none rounded px-1 py-0.5 text-[10px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-28 truncate"
        title={`Agent: ${props.value || 'Default'}`}
      >
        <option value="">Default</option>
        <For each={agents()}>{(agent) => <option value={agent.name}>{agent.name}</option>}</For>
      </select>
    </Show>
  )
}
