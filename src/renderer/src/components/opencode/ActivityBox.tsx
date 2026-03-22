import {
  Bot,
  Brain,
  FileDiff,
  FilePen,
  FileText,
  FolderSearch,
  Globe,
  ListChecks,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Terminal
} from 'lucide-solid'
import type { Component } from 'solid-js'
import { createEffect, createSignal, For, type JSX, onCleanup, Show } from 'solid-js'
import {
  getRunningToolParts,
  type OcQuestion,
  type OcReasoningPart,
  type OcToolPart,
  opcodeChat
} from '../../opcodeChat'
import QuestionBanner from './QuestionBanner'

interface ActivityBoxProps {
  sessionId?: string
  isGenerating: boolean
  questions?: OcQuestion[]
  onQuestionRespond?: (requestId: string, answers: Array<Array<string>>) => void
  onQuestionReject?: (requestId: string) => void
}

const MAX_VISIBLE = 3
const LINGER_MS = 3000
const THINKING_ID = '__thinking__'

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

function getInputStr(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (typeof input[k] === 'string' && input[k]) return input[k] as string
  }
  return undefined
}

function formatToolLabel(part: OcToolPart): string {
  const input = part.state.input
  const tool = part.tool

  if (input) {
    const path = getInputStr(input, 'filePath', 'file_path', 'path', 'fileName')
    const command = getInputStr(input, 'command', 'cmd')
    const pattern = getInputStr(input, 'pattern', 'query', 'regex')
    const description = getInputStr(input, 'description', 'prompt')

    switch (tool) {
      case 'read':
      case 'read_file':
      case 'Read':
        return path ? `Reading ${basename(path)}` : 'Reading file'
      case 'write':
      case 'write_file':
      case 'Write':
        return path ? `Writing ${basename(path)}` : 'Writing file'
      case 'edit':
      case 'Edit':
        return path ? `Editing ${basename(path)}` : 'Editing file'
      case 'apply_patch':
        return 'Applying patch'
      case 'bash':
      case 'Bash':
      case 'execute':
        return description || (command ? `Running ${command.slice(0, 40)}` : 'Running command')
      case 'glob':
      case 'Glob':
      case 'list_files':
      case 'list':
        return pattern ? `Finding ${pattern}` : 'Listing files'
      case 'grep':
      case 'Grep':
      case 'search':
        return pattern ? `Searching "${pattern.slice(0, 30)}"` : 'Searching'
      case 'task':
      case 'Task':
      case 'agent':
      case 'Agent':
        return description ? description.slice(0, 50) : 'Running task'
      case 'todowrite':
      case 'TodoWrite':
      case 'todo':
        return 'Updating todos'
      case 'webfetch':
      case 'WebFetch':
      case 'web_fetch': {
        const url = getInputStr(input, 'url')
        if (url) {
          try {
            return `Fetching ${new URL(url).hostname}`
          } catch {
            return 'Fetching web'
          }
        }
        return 'Fetching web'
      }
      case 'websearch':
      case 'WebSearch':
      case 'web_search': {
        const query = getInputStr(input, 'query', 'search')
        return query ? `Searching "${query.slice(0, 30)}"` : 'Searching web'
      }
      case 'skill':
      case 'Skill':
        return description ? `Loading ${description.slice(0, 40)}` : 'Loading skill'
    }

    if (path) return `${humanize(tool)} ${basename(path)}`
  }

  if (part.state.title) return part.state.title
  return humanize(tool)
}

function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function getToolDescription(part: OcToolPart): string | undefined {
  const input = part.state.input
  if (!input) return undefined
  const tool = part.tool

  if (tool === 'task' || tool === 'Task' || tool === 'agent' || tool === 'Agent') return undefined

  if (tool === 'bash' || tool === 'Bash' || tool === 'execute') {
    const command = getInputStr(input, 'command', 'cmd')
    return command ? command.slice(0, 50) : undefined
  }

  const desc = getInputStr(input, 'description')
  if (desc) return desc.slice(0, 60)

  switch (tool) {
    case 'grep':
    case 'Grep':
    case 'search': {
      const glob = getInputStr(input, 'glob')
      if (glob) return `in ${glob}`
      const path = getInputStr(input, 'path')
      if (path) return `in ${basename(path)}`
      return undefined
    }
    case 'glob':
    case 'Glob':
    case 'list_files':
    case 'list': {
      const path = getInputStr(input, 'path')
      if (path) return `in ${basename(path)}`
      return undefined
    }
    case 'webfetch':
    case 'WebFetch':
    case 'web_fetch': {
      const url = getInputStr(input, 'url')
      if (url) return url.slice(0, 50)
      return undefined
    }
    case 'websearch':
    case 'WebSearch':
    case 'web_search': {
      const query = getInputStr(input, 'query', 'search')
      if (query) return query.slice(0, 50)
      return undefined
    }
    case 'skill':
    case 'Skill': {
      const name = getInputStr(input, 'skill', 'name')
      if (name) return name
      return undefined
    }
    default:
      return undefined
  }
}

interface TrackedItem {
  id: string
  kind: 'thinking' | 'tool'
  toolName?: string
  label: string
  description?: string
  firstSeen: number
}

function getToolIcon(toolName?: string): {
  icon: Component<{ size: number; class: string }>
  class: string
} {
  switch (toolName) {
    case 'read':
    case 'Read':
    case 'read_file':
      return { icon: FileText, class: 'text-icon-terminal' }
    case 'write':
    case 'Write':
    case 'write_file':
      return { icon: FilePen, class: 'text-icon-script' }
    case 'edit':
    case 'Edit':
      return { icon: Pencil, class: 'text-icon-script' }
    case 'apply_patch':
      return { icon: FileDiff, class: 'text-icon-diff' }
    case 'bash':
    case 'Bash':
    case 'execute':
      return { icon: Terminal, class: 'text-icon-terminal' }
    case 'glob':
    case 'Glob':
    case 'list_files':
    case 'list':
      return { icon: FolderSearch, class: 'text-muted' }
    case 'grep':
    case 'Grep':
    case 'search':
      return { icon: Search, class: 'text-muted' }
    case 'task':
    case 'Task':
    case 'agent':
    case 'Agent':
      return { icon: Bot, class: 'text-icon-ai' }
    case 'todowrite':
    case 'TodoWrite':
    case 'todo':
      return { icon: ListChecks, class: 'text-icon-custom' }
    case 'webfetch':
    case 'WebFetch':
    case 'web_fetch':
      return { icon: Globe, class: 'text-icon-terminal' }
    case 'websearch':
    case 'WebSearch':
    case 'web_search':
      return { icon: Search, class: 'text-accent' }
    case 'skill':
    case 'Skill':
      return { icon: Sparkles, class: 'text-icon-ai' }
    default:
      return { icon: Loader2, class: 'text-accent animate-spin' }
  }
}

export default function ActivityBox(props: ActivityBoxProps): JSX.Element {
  const [shouldRender, setShouldRender] = createSignal(false)
  const [isVisible, setIsVisible] = createSignal(false)
  const [items, setItems] = createSignal<TrackedItem[]>([])
  let unmountTimer: number | undefined

  // Stable item tracking — non-reactive Map preserves object references
  // so <For> reuses DOM nodes instead of recreating + re-animating them
  const tracked = new Map<string, TrackedItem>()
  const removalTimers = new Map<string, number>()

  const runningTools = () => getRunningToolParts(props.sessionId)
  const hasQuestions = () => (props.questions?.length ?? 0) > 0

  const isThinking = () => {
    if (!props.isGenerating || !props.sessionId) return false
    const msgs = opcodeChat.messages[props.sessionId]
    if (!msgs) return false
    const lastAssistant = msgs.findLast((m) => m.role === 'assistant')
    if (!lastAssistant) return false
    const hasContent = lastAssistant.parts.some(
      (p) => p.type === 'text' || (p.type === 'reasoning' && (p as OcReasoningPart).endTime)
    )
    const hasActiveReasoning = lastAssistant.parts.some(
      (p) => p.type === 'reasoning' && !(p as OcReasoningPart).endTime
    )
    return hasActiveReasoning || !hasContent
  }

  function sync(): void {
    setItems([...tracked.values()].sort((a, b) => a.firstSeen - b.firstSeen))
  }

  function scheduleRemove(id: string, delay: number): void {
    if (removalTimers.has(id)) return
    removalTimers.set(
      id,
      window.setTimeout(() => {
        removalTimers.delete(id)
        tracked.delete(id)
        sync()
      }, delay)
    )
  }

  function cancelRemove(id: string): void {
    const t = removalTimers.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      removalTimers.delete(id)
    }
  }

  // Unified tracking — thinking and tools use the same system
  createEffect(() => {
    const thinking = isThinking()
    const tools = runningTools()
    const now = Date.now()

    const activeIds = new Set(tools.map((t) => t.id))
    if (thinking) activeIds.add(THINKING_ID)

    // Upsert thinking
    if (thinking) {
      cancelRemove(THINKING_ID)
      if (!tracked.has(THINKING_ID)) {
        tracked.set(THINKING_ID, {
          id: THINKING_ID,
          kind: 'thinking',
          label: 'Thinking...',
          firstSeen: now
        })
      }
    }

    // Upsert tools — only create new objects when label/description changed,
    // so <For> keeps existing DOM nodes for unchanged items
    for (const tool of tools) {
      cancelRemove(tool.id)
      const label = formatToolLabel(tool)
      const desc = getToolDescription(tool)
      const existing = tracked.get(tool.id)
      if (!existing) {
        tracked.set(tool.id, {
          id: tool.id,
          kind: 'tool',
          toolName: tool.tool,
          label,
          description: desc,
          firstSeen: now
        })
      } else if (existing.label !== label || existing.description !== desc) {
        tracked.set(tool.id, { ...existing, label, description: desc })
      }
    }

    // Schedule removal for items no longer active
    for (const [id, item] of tracked) {
      if (!activeIds.has(id) && !removalTimers.has(id)) {
        const elapsed = now - item.firstSeen
        scheduleRemove(id, Math.max(0, LINGER_MS - elapsed))
      }
    }

    sync()
  })

  const hasActivity = () => items().length > 0

  // isActive reads reactive signals directly — Solid tracks these inside classList
  const isActive = (id: string): boolean => {
    if (id === THINKING_ID) return isThinking()
    return runningTools().some((t) => t.id === id)
  }

  // Show/hide with mount/unmount
  createEffect(() => {
    const show = hasActivity() || hasQuestions()
    if (show) {
      clearTimeout(unmountTimer)
      if (shouldRender()) {
        // Already mounted — set visible immediately to avoid a 1-frame gap
        // where the hidden class flashes before RAF restores it
        setIsVisible(true)
      } else {
        // First mount — need RAF so browser paints the hidden state first,
        // then we transition to visible
        setShouldRender(true)
        requestAnimationFrame(() => setIsVisible(true))
      }
    } else {
      setIsVisible(false)
      unmountTimer = window.setTimeout(() => setShouldRender(false), 300)
    }
  })

  onCleanup(() => {
    clearTimeout(unmountTimer)
    for (const t of removalTimers.values()) clearTimeout(t)
    removalTimers.clear()
  })

  const visibleItems = () => items().slice(0, MAX_VISIBLE)
  const overflowCount = () => Math.max(0, items().length - MAX_VISIBLE)

  return (
    <Show when={shouldRender()}>
      <div
        class="activity-box mx-auto bg-sidebar border border-icon-ai/25 rounded-xl overflow-hidden mb-1.5 shadow-md"
        style={{ 'max-width': hasQuestions() ? '28rem' : '20rem' }}
        classList={{
          'activity-box-visible': isVisible() && !hasQuestions(),
          'activity-box-expanded': isVisible() && hasQuestions(),
          'activity-box-hidden': !isVisible()
        }}
      >
        {/* Activity lines — no conditional wrapper so content stays in DOM
             during the box's exit transition instead of disappearing instantly */}
        <div class="space-y-1" classList={{ 'px-3 py-2': hasActivity() }}>
          <For each={visibleItems()}>
            {(item) => (
              <div
                class="flex items-center gap-2 text-[11px] transition-opacity duration-200"
                style={{ opacity: isActive(item.id) ? 1 : 0.5 }}
              >
                {item.kind === 'thinking' ? (
                  <>
                    <Brain size={11} class="text-icon-ai flex-shrink-0 animate-pulse" />
                    <span class="text-muted italic">Thinking...</span>
                  </>
                ) : (
                  <>
                    {(() => {
                      const { icon: Icon, class: cls } = getToolIcon(item.toolName)
                      return <Icon size={11} class={`flex-shrink-0 ${cls}`} />
                    })()}
                    <span class="text-muted truncate">
                      <span class="font-mono">{item.label}</span>
                      <Show when={item.description}>
                        <span class="text-muted/50"> {item.description}</span>
                      </Show>
                    </span>
                  </>
                )}
              </div>
            )}
          </For>
          <Show when={overflowCount() > 0}>
            <div class="text-[11px] text-muted/60 italic pl-[19px]">+{overflowCount()} more...</div>
          </Show>
        </div>

        {/* Question UI */}
        <Show
          when={
            hasQuestions() && props.questions && props.onQuestionRespond && props.onQuestionReject
          }
        >
          <div
            class="px-3 py-2.5"
            classList={{
              'border-t border-border/60': hasActivity()
            }}
          >
            <QuestionBanner
              questions={props.questions || []}
              onRespond={props.onQuestionRespond || (() => {})}
              onReject={props.onQuestionReject || (() => {})}
            />
          </div>
        </Show>
      </div>
    </Show>
  )
}
