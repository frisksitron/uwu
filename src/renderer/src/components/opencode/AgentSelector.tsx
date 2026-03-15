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
        class="bg-app border border-border rounded px-2 py-0.5 text-[11px] text-content cursor-pointer focus:outline-none focus:border-accent transition-colors"
        title={`Agent: ${props.value || 'Default'}`}
      >
        <option value="">Default</option>
        <For each={agents()}>{(agent) => <option value={agent.name}>{agent.name}</option>}</For>
      </select>
    </Show>
  )
}
