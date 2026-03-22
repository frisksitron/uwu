import { createStore, produce } from 'solid-js/store'

export interface AgentInfo {
  name: string
  description?: string
  mode: 'subagent' | 'primary' | 'all'
  hidden?: boolean
  color?: string
  model?: { providerID: string; modelID: string }
  variant?: string
}

export interface ProviderModel {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
}

export interface OcSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface SlashCommand {
  name: string
  description: string
  source: 'command' | 'mcp' | 'skill'
}

interface VariantInfo {
  name: string
  disabled?: boolean
}

interface OpcodeProjectState {
  agents: Record<string, AgentInfo[]>
  models: Record<string, ProviderModel[]>
  variants: Record<string, Record<string, string[]>>
  sessions: Record<string, OcSession[]>
  slashCommands: Record<string, SlashCommand[]>
  providerDefaults: Record<string, Record<string, string>>
  configModel: Record<string, string>
  configDefaultAgent: Record<string, string>
}

const [state, setState] = createStore<OpcodeProjectState>({
  agents: {},
  models: {},
  variants: {},
  sessions: {},
  slashCommands: {},
  providerDefaults: {},
  configModel: {},
  configDefaultAgent: {}
})

export { state as opcodeProject }

export async function loadAgents(projectPath: string): Promise<void> {
  const data = (await window.opencodeAPI.agents(projectPath)) as Array<{
    name: string
    description?: string
    mode: 'subagent' | 'primary' | 'all'
    hidden?: boolean
    color?: string
    model?: { modelID: string; providerID: string }
    variant?: string
  }> | null
  if (!data) return
  const filtered: AgentInfo[] = data
    .filter((a) => !a.hidden && (a.mode === 'primary' || a.mode === 'all'))
    .map((a) => ({
      name: a.name,
      description: a.description,
      mode: a.mode,
      hidden: a.hidden,
      color: a.color,
      model: a.model,
      variant: a.variant
    }))
  setState('agents', projectPath, filtered)
}

export async function loadModels(projectPath: string): Promise<void> {
  const data = (await window.opencodeAPI.providers(projectPath)) as {
    all: Array<{
      id: string
      name: string
      models: Record<string, { id: string; name: string; variants?: Record<string, VariantInfo> }>
    }>
    default?: Record<string, string>
    connected: Array<string>
  } | null
  if (!data?.all) return

  const models: ProviderModel[] = []
  const variantsMap: Record<string, string[]> = {}
  const connected = new Set(data.connected ?? [])

  for (const provider of data.all.filter((p) => connected.has(p.id))) {
    for (const [, model] of Object.entries(provider.models)) {
      models.push({
        providerID: provider.id,
        providerName: provider.name,
        modelID: model.id,
        modelName: model.name
      })
      if (model.variants) {
        const key = `${provider.id}:${model.id}`
        variantsMap[key] = Object.entries(model.variants)
          .filter(([, v]) => !v.disabled)
          .map(([name]) => name)
      }
    }
  }

  setState('models', projectPath, models)
  setState('variants', projectPath, variantsMap)

  if (data.default) {
    setState('providerDefaults', projectPath, data.default)
  }
}

export async function loadConfig(projectPath: string): Promise<void> {
  const data = (await window.opencodeAPI.config(projectPath)) as {
    default_agent?: string
    model?: string
  } | null
  if (!data) return
  if (data.default_agent) {
    setState('configDefaultAgent', projectPath, data.default_agent)
  }
  if (data.model) {
    setState('configModel', projectPath, data.model)
  }
}

export async function loadSessions(projectPath: string): Promise<void> {
  const data = (await window.opencodeAPI.sessionList(projectPath)) as Array<{
    id: string
    title: string
    time: { created: number; updated: number }
  }> | null
  if (!data) return
  const sessions: OcSession[] = data.map((s) => ({
    id: s.id,
    title: s.title || 'Untitled',
    createdAt: s.time.created,
    updatedAt: s.time.updated
  }))
  setState('sessions', projectPath, sessions)
}

export async function createSession(
  projectPath: string,
  title?: string
): Promise<OcSession | null> {
  const data = (await window.opencodeAPI.sessionCreate(projectPath, title)) as {
    id: string
    title: string
    time: { created: number; updated: number }
  } | null
  if (!data) return null
  const session: OcSession = {
    id: data.id,
    title: data.title || 'Untitled',
    createdAt: data.time.created,
    updatedAt: data.time.updated
  }
  setState('sessions', projectPath, (prev) => [...(prev || []), session])
  return session
}

export async function loadSlashCommands(projectPath: string): Promise<void> {
  try {
    const commands = (await window.opencodeAPI.commands(projectPath)) as Array<{
      name: string
      description?: string
      source?: 'command' | 'mcp' | 'skill'
    }> | null

    const result: SlashCommand[] = []
    if (commands) {
      for (const c of commands) {
        result.push({
          name: c.name,
          description: c.description || '',
          source: c.source || 'command'
        })
      }
    }
    setState('slashCommands', projectPath, result)
  } catch (err) {
    console.error('[opencode] Failed to load slash commands:', err)
  }
}

export function getAgents(projectPath: string): AgentInfo[] {
  return state.agents[projectPath] || []
}

export function getModels(projectPath: string): ProviderModel[] {
  return state.models[projectPath] || []
}

export function getVariants(
  projectPath: string,
  model?: { providerID: string; modelID: string }
): string[] {
  if (!model) return []
  const key = `${model.providerID}:${model.modelID}`
  return state.variants[projectPath]?.[key] || []
}

export function getSlashCommands(projectPath: string): SlashCommand[] {
  return state.slashCommands[projectPath] || []
}

export async function deleteSession(projectPath: string, sessionId: string): Promise<void> {
  await window.opencodeAPI.sessionDelete(projectPath, sessionId)
  setState(
    produce((s: OpcodeProjectState) => {
      const sessions = s.sessions[projectPath]
      if (sessions) {
        const idx = sessions.findIndex((ss) => ss.id === sessionId)
        if (idx !== -1) sessions.splice(idx, 1)
      }
    })
  )
}

export function updateSessionTitle(sessionId: string, title: string, updatedAt: number): void {
  setState(
    produce((s: OpcodeProjectState) => {
      for (const key of Object.keys(s.sessions)) {
        const sessions = s.sessions[key]
        const idx = sessions.findIndex((ss) => ss.id === sessionId)
        if (idx !== -1) {
          sessions[idx].title = title || sessions[idx].title
          sessions[idx].updatedAt = updatedAt
        }
      }
    })
  )
}
