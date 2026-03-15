import { createStore, produce } from 'solid-js/store'

export interface OcSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface OcTextPart {
  id: string
  messageID: string
  type: 'text'
  text: string
}

export interface OcPatchFileInfo {
  filePath: string
  relativePath: string
  type: 'update' | 'create' | 'delete'
  diff: string
  additions: number
  deletions: number
}

export interface OcPatchMetadata {
  diff: string
  files: OcPatchFileInfo[]
}

export interface OcToolPart {
  id: string
  messageID: string
  type: 'tool'
  tool: string
  state: {
    status: 'pending' | 'running' | 'completed' | 'error'
    input?: Record<string, unknown>
    output?: string
    error?: string
    title?: string
    metadata?: OcPatchMetadata
  }
}

export interface OcReasoningPart {
  id: string
  messageID: string
  type: 'reasoning'
  text: string
  startTime?: number
  endTime?: number
}

export interface OcFilePart {
  id: string
  messageID: string
  type: 'file'
  mime: string
  filename?: string
  url: string
}

export type OcPart = OcTextPart | OcToolPart | OcReasoningPart | OcFilePart

export interface ImageAttachment {
  id: string
  dataUrl: string
  mime: string
  filename: string
}

export interface OcMessageError {
  name: string
  message: string
  statusCode?: number
  isRetryable?: boolean
  providerID?: string
  retries?: number
}

export interface OcMessage {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  createdAt: number
  parts: OcPart[]
  error?: OcMessageError
}

export interface OcPermission {
  id: string
  sessionID: string
  title: string
  metadata: Record<string, unknown>
}

export interface OcQuestionOption {
  label: string
  description: string
}

export interface OcQuestionInfo {
  question: string
  header: string
  options: OcQuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface OcQuestion {
  id: string
  sessionID: string
  questions: OcQuestionInfo[]
  tool?: { messageID: string; callID: string }
}

export interface RawEvent {
  timestamp: number
  type: string
  data: unknown
}

interface OpencodeState {
  servers: Record<string, 'starting' | 'ready' | 'error' | 'stopped'>
  sessions: Record<string, OcSession[]>
  messages: Record<string, OcMessage[]>
  pendingPermissions: Record<string, OcPermission[]>
  pendingQuestions: Record<string, OcQuestion[]>
  streamingContent: Record<string, string>
  streamingVersion: number
  isGenerating: Record<string, boolean>
  generationStartTimes: Record<string, number>
  generationDurations: Record<string, number>
  sessionAgents: Record<string, string>
  sessionModels: Record<string, { providerID: string; modelID: string }>
  rawEvents: RawEvent[]
}

const MAX_RAW_EVENTS = 500

let streamingRafPending = false

const [state, setState] = createStore<OpencodeState>({
  servers: {},
  sessions: {},
  messages: {},
  pendingPermissions: {},
  pendingQuestions: {},
  streamingContent: {},
  streamingVersion: 0,
  isGenerating: {},
  generationStartTimes: {},
  generationDurations: {},
  sessionAgents: {},
  sessionModels: {},
  rawEvents: []
})

export { state as opencodeState }

export async function startServer(projectPath: string): Promise<boolean> {
  if (state.servers[projectPath] === 'ready' || state.servers[projectPath] === 'starting') {
    return state.servers[projectPath] === 'ready'
  }
  setState('servers', projectPath, 'starting')
  const result = await window.opencodeAPI.start(projectPath)
  if (result.status === 'ready') {
    setState('servers', projectPath, 'ready')
    return true
  }
  setState('servers', projectPath, 'error')
  return false
}

export async function stopServer(projectPath: string): Promise<void> {
  await window.opencodeAPI.stop(projectPath)
  setState('servers', projectPath, 'stopped')
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

type RawError = {
  name: string
  data?: {
    message?: string
    statusCode?: number
    isRetryable?: boolean
    providerID?: string
    retries?: number
  }
}

function parseError(raw: RawError): OcMessageError {
  return {
    name: raw.name,
    message: raw.data?.message || raw.name,
    statusCode: raw.data?.statusCode,
    isRetryable: raw.data?.isRetryable,
    providerID: raw.data?.providerID,
    retries: raw.data?.retries
  }
}

export async function loadMessages(projectPath: string, sessionId: string): Promise<void> {
  const data = (await window.opencodeAPI.messages(projectPath, sessionId)) as Array<{
    info: {
      id: string
      sessionID: string
      role: 'user' | 'assistant'
      time: { created: number }
      agent?: string
      model?: { providerID: string; modelID: string }
      error?: RawError
    }
    parts: Array<{
      id: string
      messageID: string
      type: string
      text?: string
      tool?: string
      state?: {
        status: string
        input?: Record<string, unknown>
        output?: string
        error?: string
        title?: string
        metadata?: Record<string, unknown>
      }
      mime?: string
      filename?: string
      url?: string
    }>
  }> | null
  if (!data) return
  const messages: OcMessage[] = data.map((m) => ({
    id: m.info.id,
    sessionID: m.info.sessionID,
    role: m.info.role,
    createdAt: m.info.time.created,
    parts: parseParts(m.parts),
    error: m.info.error ? parseError(m.info.error) : undefined
  }))
  setState('messages', sessionId, messages)

  // Extract agent/model from last user message as the session's active values
  const lastUser = [...data].reverse().find((m) => m.info.role === 'user')
  if (lastUser?.info.agent) {
    setState('sessionAgents', sessionId, lastUser.info.agent)
  }
  if (lastUser?.info.model) {
    setState('sessionModels', sessionId, lastUser.info.model)
  }
}

interface RawPart {
  id: string
  messageID: string
  type: string
  text?: string
  tool?: string
  state?: {
    status: string
    input?: Record<string, unknown>
    output?: string
    error?: string
    title?: string
    metadata?: Record<string, unknown>
  }
  time?: { start?: number; end?: number }
  mime?: string
  filename?: string
  url?: string
}

function parseParts(raw: RawPart[]): OcPart[] {
  const parts: OcPart[] = []
  for (const p of raw) {
    if (p.type === 'text' && p.text !== undefined) {
      parts.push({ id: p.id, messageID: p.messageID, type: 'text', text: p.text })
    } else if (p.type === 'reasoning') {
      parts.push({
        id: p.id,
        messageID: p.messageID,
        type: 'reasoning',
        text: p.text ?? '',
        startTime: p.time?.start,
        endTime: p.time?.end
      })
    } else if (p.type === 'file' && p.url) {
      parts.push({
        id: p.id,
        messageID: p.messageID,
        type: 'file',
        mime: p.mime || 'application/octet-stream',
        filename: p.filename,
        url: p.url
      })
    } else if (p.type === 'tool') {
      let patchMeta: OcPatchMetadata | undefined
      const rawMeta = p.state?.metadata as { diff?: string; files?: OcPatchFileInfo[] } | undefined
      if (p.tool === 'apply_patch' && rawMeta?.files && Array.isArray(rawMeta.files)) {
        patchMeta = {
          diff: rawMeta.diff || '',
          files: rawMeta.files
        }
      }
      parts.push({
        id: p.id,
        messageID: p.messageID,
        type: 'tool',
        tool: p.tool || 'unknown',
        state: {
          status: (p.state?.status as OcToolPart['state']['status']) || 'pending',
          input: p.state?.input,
          output: p.state?.output,
          error: p.state?.error,
          title: p.state?.title,
          metadata: patchMeta
        }
      })
    }
  }
  return parts
}

export async function sendMessage(
  projectPath: string,
  sessionId: string,
  text: string,
  model?: { providerID: string; modelID: string },
  agent?: string,
  images?: ImageAttachment[]
): Promise<void> {
  setState('isGenerating', sessionId, true)
  setState('generationStartTimes', sessionId, Date.now())
  try {
    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'file'; mime: string; url: string; filename?: string }
    > = []
    if (text) {
      parts.push({ type: 'text', text })
    }
    if (images) {
      for (const img of images) {
        parts.push({ type: 'file', mime: img.mime, url: img.dataUrl, filename: img.filename })
      }
    }
    await window.opencodeAPI.sendMessage(projectPath, sessionId, {
      parts,
      // Unwrap potential Solid store proxies — IPC structured clone can't serialize them
      model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
      agent
    })
  } catch (err) {
    console.error('[opencode] sendMessage failed:', err)
    setState('isGenerating', sessionId, false)
  }
}

export async function abortGeneration(projectPath: string, sessionId: string): Promise<void> {
  await window.opencodeAPI.sessionAbort(projectPath, sessionId)
  setState('isGenerating', sessionId, false)
}

export async function respondPermission(
  projectPath: string,
  sessionId: string,
  permissionId: string,
  response: 'once' | 'always' | 'reject'
): Promise<void> {
  await window.opencodeAPI.permissionRespond(projectPath, sessionId, permissionId, response)
  setState('pendingPermissions', sessionId, (prev) =>
    (prev || []).filter((p) => p.id !== permissionId)
  )
}

export async function respondQuestion(
  projectPath: string,
  requestId: string,
  answers: Array<Array<string>>
): Promise<void> {
  await window.opencodeAPI.questionReply(projectPath, requestId, answers)
  // Remove from all session lists
  setState(
    produce((s: OpencodeState) => {
      for (const key of Object.keys(s.pendingQuestions)) {
        s.pendingQuestions[key] = s.pendingQuestions[key].filter((q) => q.id !== requestId)
      }
    })
  )
}

export async function rejectQuestion(projectPath: string, requestId: string): Promise<void> {
  await window.opencodeAPI.questionReject(projectPath, requestId)
  setState(
    produce((s: OpencodeState) => {
      for (const key of Object.keys(s.pendingQuestions)) {
        s.pendingQuestions[key] = s.pendingQuestions[key].filter((q) => q.id !== requestId)
      }
    })
  )
}

export function initEventListener(): () => void {
  return window.opencodeAPI.onEvent((_projectPath: string, rawEvent: unknown) => {
    const event = rawEvent as { type: string; properties: Record<string, unknown> }
    if (!event?.type) return

    // Log raw event for debug view
    setState(
      produce((s: OpencodeState) => {
        s.rawEvents.push({
          timestamp: Date.now(),
          type: event.type,
          data: event.properties
        })
        if (s.rawEvents.length > MAX_RAW_EVENTS) {
          s.rawEvents.splice(0, s.rawEvents.length - MAX_RAW_EVENTS)
        }
      })
    )

    switch (event.type) {
      case 'message.part.updated': {
        const props = event.properties as {
          part: {
            id: string
            sessionID: string
            messageID: string
            type: string
            text?: string
            tool?: string
            state?: {
              status: string
              input?: Record<string, unknown>
              output?: string
              error?: string
              title?: string
              metadata?: Record<string, unknown>
            }
            mime?: string
            filename?: string
            url?: string
          }
        }
        // Upsert part into message
        upsertPart(props.part)
        break
      }

      case 'message.part.delta': {
        const props = event.properties as {
          sessionID: string
          messageID: string
          partID: string
          field: string
          delta: string
        }
        if (props.field === 'text') {
          setState('streamingContent', props.partID, (prev) => (prev || '') + props.delta)
          if (!streamingRafPending) {
            streamingRafPending = true
            requestAnimationFrame(() => {
              streamingRafPending = false
              setState('streamingVersion', (v) => v + 1)
            })
          }
        }
        break
      }

      case 'message.updated': {
        const props = event.properties as {
          info: {
            id: string
            sessionID: string
            role: 'user' | 'assistant'
            time: { created: number }
            agent?: string
            model?: { providerID: string; modelID: string }
            error?: RawError
          }
        }
        const msg = props.info

        // Track active agent/model from user messages
        if (msg.role === 'user') {
          if (msg.agent) setState('sessionAgents', msg.sessionID, msg.agent)
          if (msg.model) setState('sessionModels', msg.sessionID, msg.model)
        }
        const error: OcMessageError | undefined = msg.error ? parseError(msg.error) : undefined

        setState(
          produce((s: OpencodeState) => {
            const msgs = s.messages[msg.sessionID]
            if (!msgs) {
              s.messages[msg.sessionID] = [
                {
                  id: msg.id,
                  sessionID: msg.sessionID,
                  role: msg.role,
                  createdAt: msg.time.created,
                  parts: [],
                  error
                }
              ]
            } else {
              const existing = msgs.find((m) => m.id === msg.id)
              if (existing) {
                if (error) existing.error = error
              } else {
                msgs.push({
                  id: msg.id,
                  sessionID: msg.sessionID,
                  role: msg.role,
                  createdAt: msg.time.created,
                  parts: [],
                  error
                })
              }
            }
          })
        )

        if (error) {
          setState('isGenerating', msg.sessionID, false)
          const startTime = state.generationStartTimes[msg.sessionID]
          if (startTime) {
            setState('generationDurations', msg.sessionID, Date.now() - startTime)
          }
        }
        break
      }

      case 'session.idle': {
        const props = event.properties as { sessionID: string }
        setState('isGenerating', props.sessionID, false)
        // Compute generation duration
        const startTime = state.generationStartTimes[props.sessionID]
        if (startTime) {
          setState('generationDurations', props.sessionID, Date.now() - startTime)
        }
        // Finalize streaming content into parts
        setState(
          produce((s: OpencodeState) => {
            const msgs = s.messages[props.sessionID]
            if (!msgs) return
            for (const msg of msgs) {
              for (const part of msg.parts) {
                if (
                  (part.type === 'text' || part.type === 'reasoning') &&
                  s.streamingContent[part.id]
                ) {
                  part.text = s.streamingContent[part.id]
                  delete s.streamingContent[part.id]
                }
              }
            }
          })
        )
        break
      }

      case 'session.status': {
        const props = event.properties as {
          sessionID: string
          status: { type: string }
        }
        setState('isGenerating', props.sessionID, props.status.type === 'busy')
        break
      }

      case 'permission.updated': {
        const perm = event.properties as {
          id: string
          sessionID: string
          title: string
          metadata: Record<string, unknown>
        }
        setState('pendingPermissions', perm.sessionID, (prev) => [
          ...(prev || []),
          {
            id: perm.id,
            sessionID: perm.sessionID,
            title: perm.title,
            metadata: perm.metadata
          }
        ])
        break
      }

      case 'permission.replied': {
        const props = event.properties as { sessionID: string; permissionID: string }
        setState('pendingPermissions', props.sessionID, (prev) =>
          (prev || []).filter((p) => p.id !== props.permissionID)
        )
        break
      }

      case 'question.asked': {
        const q = event.properties as {
          id: string
          sessionID: string
          questions: OcQuestionInfo[]
          tool?: { messageID: string; callID: string }
        }
        setState('pendingQuestions', q.sessionID, (prev) => [
          ...(prev || []),
          {
            id: q.id,
            sessionID: q.sessionID,
            questions: q.questions,
            tool: q.tool
          }
        ])
        break
      }

      case 'question.replied': {
        const props = event.properties as { sessionID: string; requestID: string }
        setState('pendingQuestions', props.sessionID, (prev) =>
          (prev || []).filter((q) => q.id !== props.requestID)
        )
        break
      }

      case 'question.rejected': {
        const props = event.properties as { sessionID: string; requestID: string }
        setState('pendingQuestions', props.sessionID, (prev) =>
          (prev || []).filter((q) => q.id !== props.requestID)
        )
        break
      }

      case 'session.updated': {
        const props = event.properties as {
          info: { id: string; title: string; time: { updated: number } }
        }
        // Update session title in all project session lists
        setState(
          produce((s: OpencodeState) => {
            for (const key of Object.keys(s.sessions)) {
              const sessions = s.sessions[key]
              const idx = sessions.findIndex((ss) => ss.id === props.info.id)
              if (idx !== -1) {
                sessions[idx].title = props.info.title || sessions[idx].title
                sessions[idx].updatedAt = props.info.time.updated
              }
            }
          })
        )
        break
      }
    }
  })
}

function upsertPart(raw: RawPart & { sessionID: string }): void {
  setState(
    produce((s: OpencodeState) => {
      const msgs = s.messages[raw.sessionID]
      if (!msgs) return
      const msg = msgs.find((m) => m.id === raw.messageID)
      if (!msg) return

      const parsed = parseParts([raw])
      if (parsed.length === 0) return
      const newPart = parsed[0]

      const existingIdx = msg.parts.findIndex((p) => p.id === raw.id)
      if (existingIdx !== -1) {
        const existing = msg.parts[existingIdx]
        if (
          (newPart.type === 'text' && existing.type === 'text') ||
          (newPart.type === 'reasoning' && existing.type === 'reasoning')
        ) {
          // Use streaming content if available, otherwise use the final text
          existing.text = s.streamingContent[raw.id] || newPart.text
          if (newPart.type === 'reasoning' && existing.type === 'reasoning') {
            existing.startTime = newPart.startTime
            existing.endTime = newPart.endTime
          }
        } else {
          msg.parts[existingIdx] = newPart
        }
      } else {
        msg.parts.push(newPart)
      }
    })
  )
}
