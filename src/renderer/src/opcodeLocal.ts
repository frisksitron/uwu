import { createStore } from 'solid-js/store'
import { opcodeProject } from './opcodeProject'

export type ModelKey = { providerID: string; modelID: string }

interface Selection {
  agent?: string
  model?: ModelKey
  variant?: string | null
}

interface PersistedState {
  session: Record<string, Selection>
  recent: ModelKey[]
  modelVariant: Record<string, string>
}

interface LocalState {
  persisted: Record<string, PersistedState>
  draft: Record<string, Selection | undefined>
}

const RECENT_LIMIT = 5

const [state, setState] = createStore<LocalState>({
  persisted: {},
  draft: {}
})

// --- Persistence (localStorage) ---

function storageKey(projectPath: string): string {
  // Simple hash to avoid special chars in key
  let hash = 0
  for (let i = 0; i < projectPath.length; i++) {
    hash = ((hash << 5) - hash + projectPath.charCodeAt(i)) | 0
  }
  return `oc-sel:${hash}`
}

function loadPersisted(projectPath: string): PersistedState {
  const cached = state.persisted[projectPath]
  if (cached) return cached

  try {
    const raw = localStorage.getItem(storageKey(projectPath))
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed.session && parsed.recent) {
        if (!parsed.modelVariant) parsed.modelVariant = {}
        setState('persisted', projectPath, parsed)
        return parsed
      }
    }
  } catch {
    // Corrupted data, start fresh
  }

  const fresh: PersistedState = { session: {}, recent: [], modelVariant: {} }
  setState('persisted', projectPath, fresh)
  return fresh
}

function savePersisted(projectPath: string): void {
  const data = state.persisted[projectPath]
  if (!data) return
  try {
    localStorage.setItem(storageKey(projectPath), JSON.stringify(data))
  } catch {
    // Storage full or unavailable
  }
}

function modelVariantKey(model: ModelKey): string {
  return `${model.providerID}:${model.modelID}`
}

function setModelVariant(projectPath: string, model: ModelKey, variant: string): void {
  loadPersisted(projectPath)
  setState('persisted', projectPath, 'modelVariant', modelVariantKey(model), variant)
  savePersisted(projectPath)
}

// --- Core functions ---

function getScope(projectPath: string, sessionId?: string): Selection | undefined {
  if (sessionId) {
    const persisted = loadPersisted(projectPath)
    return persisted.session[sessionId]
  }
  return state.draft[projectPath]
}

export function setSelection(
  projectPath: string,
  sessionId: string | undefined,
  partial: Partial<Selection>
): void {
  if (sessionId) {
    loadPersisted(projectPath)
    const prev = state.persisted[projectPath]?.session[sessionId] || {}
    setState('persisted', projectPath, 'session', sessionId, { ...prev, ...partial })
    savePersisted(projectPath)
  } else {
    const prev = state.draft[projectPath] || {}
    setState('draft', projectPath, { ...prev, ...partial })
  }

  // Remember variant preference per model
  if (partial.variant && typeof partial.variant === 'string') {
    const model = partial.model ?? resolvedModel(projectPath, sessionId)
    if (model) setModelVariant(projectPath, model, partial.variant)
  }
}

export function promote(projectPath: string, sessionId: string): void {
  const model = resolvedModel(projectPath, undefined)
  const agent = resolvedAgent(projectPath, undefined)
  const variant = resolvedVariant(projectPath, undefined)

  loadPersisted(projectPath)
  setState('persisted', projectPath, 'session', sessionId, {
    agent,
    model,
    variant: variant ?? null
  })
  setState('draft', projectPath, undefined)
  savePersisted(projectPath)

  if (model) pushRecent(projectPath, model)
  if (model && variant) setModelVariant(projectPath, model, variant)
}

export function restore(
  projectPath: string,
  sessionId: string,
  msg: { agent?: string; model?: ModelKey; variant?: string }
): void {
  loadPersisted(projectPath)
  // Only restore if no saved state for this session yet
  if (state.persisted[projectPath]?.session[sessionId]) return

  setState('persisted', projectPath, 'session', sessionId, {
    agent: msg.agent,
    model: msg.model,
    variant: msg.variant ?? null
  })
  savePersisted(projectPath)

  if (msg.model) pushRecent(projectPath, msg.model)
  if (msg.model && msg.variant) setModelVariant(projectPath, msg.model, msg.variant)
}

export function pushRecent(projectPath: string, model: ModelKey): void {
  loadPersisted(projectPath)
  const prev = state.persisted[projectPath]?.recent || []
  const deduped = [
    model,
    ...prev.filter((m) => m.providerID !== model.providerID || m.modelID !== model.modelID)
  ]
  if (deduped.length > RECENT_LIMIT) deduped.length = RECENT_LIMIT
  setState('persisted', projectPath, 'recent', deduped)
  savePersisted(projectPath)
}

export function initProject(projectPath: string): void {
  loadPersisted(projectPath)
}

// --- Resolution functions ---

function isValidModel(projectPath: string, model: ModelKey): boolean {
  const models = opcodeProject.models[projectPath] || []
  return models.some((m) => m.providerID === model.providerID && m.modelID === model.modelID)
}

export function resolvedModel(projectPath: string, sessionId?: string): ModelKey | undefined {
  const scope = getScope(projectPath, sessionId)

  // 1. Scope's explicit model
  if (scope?.model && isValidModel(projectPath, scope.model)) return scope.model

  // 2. Current agent's configured model
  const agents = opcodeProject.agents[projectPath] || []
  const agentName = scope?.agent || opcodeProject.configDefaultAgent[projectPath] || 'build'
  const agent = agents.find((a) => a.name === agentName)
  if (agent?.model && isValidModel(projectPath, agent.model)) return agent.model

  // 3. Config model (format: "provider/model")
  const configModel = opcodeProject.configModel[projectPath]
  if (configModel) {
    const idx = configModel.indexOf('/')
    if (idx !== -1) {
      const m = { providerID: configModel.slice(0, idx), modelID: configModel.slice(idx + 1) }
      if (isValidModel(projectPath, m)) return m
    }
  }

  // 4. Recent models
  const recent = state.persisted[projectPath]?.recent || []
  for (const m of recent) {
    if (isValidModel(projectPath, m)) return m
  }

  // 5. Provider defaults (iterate connected providers)
  const defaults = opcodeProject.providerDefaults[projectPath]
  const models = opcodeProject.models[projectPath] || []
  if (defaults) {
    // Use connected provider order from the models list (deduped)
    const seen = new Set<string>()
    for (const m of models) {
      if (seen.has(m.providerID)) continue
      seen.add(m.providerID)
      const defaultModelID = defaults[m.providerID]
      if (defaultModelID) {
        const candidate = { providerID: m.providerID, modelID: defaultModelID }
        if (isValidModel(projectPath, candidate)) return candidate
      }
    }
  }

  // 6. First available model
  if (models.length > 0) {
    return { providerID: models[0].providerID, modelID: models[0].modelID }
  }

  return undefined
}

export function resolvedAgent(projectPath: string, sessionId?: string): string | undefined {
  const scope = getScope(projectPath, sessionId)
  if (scope?.agent) return scope.agent

  const defaultAgent = opcodeProject.configDefaultAgent[projectPath]
  if (defaultAgent) return defaultAgent

  const agents = opcodeProject.agents[projectPath] || []
  return agents[0]?.name
}

export function resolvedVariant(projectPath: string, sessionId?: string): string | undefined {
  const scope = getScope(projectPath, sessionId)
  if (scope?.variant && scope.variant !== null) return scope.variant

  // Fall back to agent's configured variant
  const agents = opcodeProject.agents[projectPath] || []
  const agentName = scope?.agent || opcodeProject.configDefaultAgent[projectPath] || 'build'
  const agent = agents.find((a) => a.name === agentName)
  if (agent?.variant) return agent.variant

  // Fall back to per-model sticky variant preference, then first available
  const model = resolvedModel(projectPath, sessionId)
  if (model) {
    const variantKey = `${model.providerID}:${model.modelID}`
    const available = opcodeProject.variants[projectPath]?.[variantKey] || []

    const key = modelVariantKey(model)
    const saved = state.persisted[projectPath]?.modelVariant[key]
    if (saved && available.includes(saved)) return saved

    // Last resort: first variant in the list
    if (available.length > 0) return available[0]
  }

  return undefined
}
