import { createStore, produce } from 'solid-js/store'
import { updateSessionTitle } from './opcodeProject'
import { setServerError } from './opcodeServer'

// --- Types ---

export interface OcTextPart {
  id: string
  messageID: string
  type: 'text'
  text: string
  synthetic?: boolean
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

// --- State ---

interface OpcodeChatState {
  messages: Record<string, OcMessage[]>
  pendingPermissions: Record<string, OcPermission[]>
  pendingQuestions: Record<string, OcQuestion[]>
  streamingContent: Record<string, string>
  smoothContent: Record<string, string>
  streamingVersion: number
  isGenerating: Record<string, boolean>
  generationStartTimes: Record<string, number>
  generationDurations: Record<string, number>
  sessionAgents: Record<string, string>
  sessionModels: Record<string, { providerID: string; modelID: string }>
  sessionVariants: Record<string, string>
  rawEvents: RawEvent[]
}

const MAX_RAW_EVENTS = 500

// --- Smooth streaming: buffer-feedback controller ---
// Instead of measuring per-chunk incoming rate (which varies wildly with chunk
// sizes), we use a feedback loop on the buffer level. The drain rate adjusts
// based on how full the buffer is: large buffer → speed up, small → slow down.
// This is chunk-size-agnostic — only the aggregate buffer level matters.

const DRAIN_INIT = 4 // initial rate (chars/frame)
const DRAIN_TARGET_BUFFER = 30 // ideal buffer size (chars) to maintain
const DRAIN_FEEDBACK = 0.005 // proportional gain: rate adjustment per char of error
const DRAIN_MAX_UP = 0.8 // max rate increase per frame (fast catch-up)
const DRAIN_MAX_DOWN = 0.5 // max rate decrease per frame (smooth tail)

interface PartDrainState {
  drainRate: number // current output rate (chars/frame)
  cursor: number // fractional position for sub-char-smooth advancement
}

let smoothingLoopRunning = false
const partDrainStates: Record<string, PartDrainState> = {}

const [state, setState] = createStore<OpcodeChatState>({
  messages: {},
  pendingPermissions: {},
  pendingQuestions: {},
  streamingContent: {},
  smoothContent: {},
  streamingVersion: 0,
  isGenerating: {},
  generationStartTimes: {},
  generationDurations: {},
  sessionAgents: {},
  sessionModels: {},
  sessionVariants: {},
  rawEvents: []
})

function smoothingTick(): void {
  let anyAdvanced = false
  setState(
    produce((s: OpcodeChatState) => {
      for (const partId of Object.keys(s.streamingContent)) {
        const target = s.streamingContent[partId]
        const current = s.smoothContent[partId] ?? ''

        let ps = partDrainStates[partId]
        if (!ps) {
          ps = { drainRate: DRAIN_INIT, cursor: current.length }
          partDrainStates[partId] = ps
        }

        // Sync cursor if externally modified (e.g. session.idle)
        if (ps.cursor < current.length) ps.cursor = current.length

        // Buffer-feedback: adjust drain rate based on buffer level
        const buffer = target.length - ps.cursor
        const error = buffer - DRAIN_TARGET_BUFFER
        const adj = Math.max(-DRAIN_MAX_DOWN, Math.min(DRAIN_MAX_UP, DRAIN_FEEDBACK * error))
        ps.drainRate = Math.max(1, ps.drainRate + adj)

        // Advance fractional cursor
        if (buffer > 0) {
          ps.cursor = Math.min(target.length, ps.cursor + ps.drainRate)
          const newLen = Math.floor(ps.cursor)
          if (newLen > current.length) {
            s.smoothContent[partId] = target.slice(0, newLen)
            anyAdvanced = true
          }
        }
      }
      if (anyAdvanced) s.streamingVersion++
    })
  )
  if (Object.keys(state.streamingContent).length > 0) {
    requestAnimationFrame(smoothingTick)
  } else {
    smoothingLoopRunning = false
  }
}

function ensureSmoothingLoop(): void {
  if (!smoothingLoopRunning) {
    smoothingLoopRunning = true
    requestAnimationFrame(smoothingTick)
  }
}

export { state as opcodeChat }

// --- Internal helpers ---

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

interface RawPart {
  id: string
  messageID: string
  type: string
  text?: string
  synthetic?: boolean
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
      parts.push({
        id: p.id,
        messageID: p.messageID,
        type: 'text',
        text: p.text,
        ...(p.synthetic && { synthetic: true })
      })
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

function upsertPart(raw: RawPart & { sessionID: string }): void {
  setState(
    produce((s: OpcodeChatState) => {
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

// --- Public API ---

export async function loadMessages(projectPath: string, sessionId: string): Promise<void> {
  const data = (await window.opencodeAPI.messages(projectPath, sessionId)) as Array<{
    info: {
      id: string
      sessionID: string
      role: 'user' | 'assistant'
      time: { created: number }
      agent?: string
      model?: { providerID: string; modelID: string }
      variant?: string
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

  const lastUser = data.findLast((m) => m.info.role === 'user')
  if (lastUser?.info.agent) {
    setState('sessionAgents', sessionId, lastUser.info.agent)
  }
  if (lastUser?.info.model) {
    setState('sessionModels', sessionId, lastUser.info.model)
  }
  if (lastUser?.info.variant) {
    setState('sessionVariants', sessionId, lastUser.info.variant)
  }
}

export async function sendMessage(
  projectPath: string,
  sessionId: string,
  text: string,
  model?: { providerID: string; modelID: string },
  agent?: string,
  images?: ImageAttachment[],
  variant?: string
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
      model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
      agent,
      variant
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

export async function executeCommand(
  projectPath: string,
  sessionId: string,
  command: string,
  args: string,
  model?: { providerID: string; modelID: string },
  agent?: string,
  variant?: string
): Promise<void> {
  setState('isGenerating', sessionId, true)
  setState('generationStartTimes', sessionId, Date.now())
  try {
    await window.opencodeAPI.sessionCommand(
      projectPath,
      sessionId,
      command,
      args,
      model ? `${model.providerID}/${model.modelID}` : undefined,
      agent,
      variant
    )
  } catch (err) {
    console.error('[opencode] executeCommand failed:', err)
    setState('isGenerating', sessionId, false)
  }
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
  setState(
    produce((s: OpcodeChatState) => {
      for (const key of Object.keys(s.pendingQuestions)) {
        s.pendingQuestions[key] = s.pendingQuestions[key].filter((q) => q.id !== requestId)
      }
    })
  )
}

export async function rejectQuestion(projectPath: string, requestId: string): Promise<void> {
  await window.opencodeAPI.questionReject(projectPath, requestId)
  setState(
    produce((s: OpcodeChatState) => {
      for (const key of Object.keys(s.pendingQuestions)) {
        s.pendingQuestions[key] = s.pendingQuestions[key].filter((q) => q.id !== requestId)
      }
    })
  )
}

export function getOcActivity(sessionId: string): string {
  void state.streamingVersion

  const perms = state.pendingPermissions[sessionId]
  if (perms && perms.length > 0) {
    return `Approve: ${perms[0].title}`
  }

  const questions = state.pendingQuestions[sessionId]
  if (questions && questions.length > 0) {
    return questions[0].questions[0]?.header || 'Question'
  }

  if (state.isGenerating[sessionId]) {
    const msgs = state.messages[sessionId]
    if (msgs) {
      const lastAssistant = msgs.findLast((m) => m.role === 'assistant')
      if (lastAssistant) {
        const runningTool = lastAssistant.parts.findLast(
          (p) => p.type === 'tool' && p.state.status === 'running'
        )
        if (runningTool && runningTool.type === 'tool') {
          return `Running ${runningTool.tool}`
        }

        const pendingTool = lastAssistant.parts.findLast(
          (p) => p.type === 'tool' && p.state.status === 'pending'
        )
        if (pendingTool && pendingTool.type === 'tool') {
          return `Pending ${pendingTool.tool}`
        }

        const reasoning = lastAssistant.parts.findLast((p) => p.type === 'reasoning' && !p.endTime)
        if (reasoning) {
          return 'Thinking'
        }

        const hasStreaming = lastAssistant.parts.some(
          (p) => (p.type === 'text' || p.type === 'reasoning') && state.streamingContent[p.id]
        )
        if (hasStreaming) {
          return 'Responding'
        }
      }
    }
    return 'Thinking'
  }

  return 'Ready'
}

// --- Event listener ---

export function initEventListener(): () => void {
  const cleanupError = window.opencodeAPI.onEventError((_projectPath: string, _error: string) => {
    setServerError()
  })
  const cleanupEvent = window.opencodeAPI.onEvent((_projectPath: string, rawEvent: unknown) => {
    const event = rawEvent as { type: string; properties: Record<string, unknown> }
    if (!event?.type) return

    setState(
      produce((s: OpcodeChatState) => {
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
            synthetic?: boolean
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
          if (!(props.partID in state.smoothContent)) {
            setState('smoothContent', props.partID, '')
          }
          ensureSmoothingLoop()
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
            variant?: string
            error?: RawError
          }
        }
        const msg = props.info

        if (msg.role === 'user') {
          if (msg.agent) setState('sessionAgents', msg.sessionID, msg.agent)
          if (msg.model) setState('sessionModels', msg.sessionID, msg.model)
          if (msg.variant) setState('sessionVariants', msg.sessionID, msg.variant)
        }
        const error: OcMessageError | undefined = msg.error ? parseError(msg.error) : undefined

        setState(
          produce((s: OpcodeChatState) => {
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
        const startTime = state.generationStartTimes[props.sessionID]
        if (startTime) {
          setState('generationDurations', props.sessionID, Date.now() - startTime)
        }
        setState(
          produce((s: OpcodeChatState) => {
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
                  delete s.smoothContent[part.id]
                  delete partDrainStates[part.id]
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
        updateSessionTitle(props.info.id, props.info.title, props.info.time.updated)
        break
      }
    }
  })
  return () => {
    cleanupError()
    cleanupEvent()
  }
}
