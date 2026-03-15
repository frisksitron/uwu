import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Terminal, XCircle } from 'lucide-solid'
import { createEffect, createSignal, For, type JSX, Match, Show, Switch } from 'solid-js'
import type {
  OcMessage,
  OcPart,
  OcPermission,
  OcQuestion,
  OcTextPart,
  OcToolPart
} from '../../opencodeStore'
import MessageContent from './MessageContent'
import PermissionBanner from './PermissionBanner'
import QuestionBanner from './QuestionBanner'

interface MessageListProps {
  messages: OcMessage[]
  streamingContent: Record<string, string>
  generationDuration?: number
  permissions?: OcPermission[]
  questions?: OcQuestion[]
  onPermissionRespond?: (permissionId: string, response: 'once' | 'always' | 'reject') => void
  onQuestionRespond?: (requestId: string, answers: Array<Array<string>>) => void
  onQuestionReject?: (requestId: string) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

type GroupedItem = { type: 'part'; part: OcPart } | { type: 'tools'; parts: OcToolPart[] }

function groupParts(parts: OcPart[]): GroupedItem[] {
  const groups: GroupedItem[] = []
  let toolBatch: OcToolPart[] = []

  for (const part of parts) {
    if (part.type === 'tool') {
      toolBatch.push(part)
    } else {
      if (toolBatch.length > 0) {
        groups.push({ type: 'tools', parts: [...toolBatch] })
        toolBatch = []
      }
      groups.push({ type: 'part', part })
    }
  }
  if (toolBatch.length > 0) {
    groups.push({ type: 'tools', parts: toolBatch })
  }
  return groups
}

function ToolCard(props: { part: OcToolPart }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false)

  // Auto-expand when running
  createEffect(() => {
    if (props.part.state.status === 'running') {
      setExpanded(true)
    }
  })

  const statusIcon = (): JSX.Element => {
    switch (props.part.state.status) {
      case 'pending':
      case 'running':
        return <Loader2 size={12} class="animate-spin text-accent" />
      case 'completed':
        return <CheckCircle2 size={12} class="text-success" />
      case 'error':
        return <XCircle size={12} class="text-error" />
      default:
        return null
    }
  }

  return (
    <div class="border border-accent/40 rounded-md bg-app/30 shadow-sm text-[12px]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="w-full flex items-center gap-2 px-2.5 py-1.5 bg-transparent border-none cursor-pointer text-left text-content hover:bg-accent/5 rounded-md transition-colors"
      >
        <span class="text-muted flex-shrink-0">
          {expanded() ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        {statusIcon()}
        <span class="font-mono font-medium text-accent truncate">
          {props.part.state.title || props.part.tool}
        </span>
      </button>
      <Show when={expanded()}>
        <div class="px-2.5 pb-2.5 space-y-2 border-t border-border/60">
          <Show when={props.part.state.input}>
            <div class="pt-2">
              <span class="text-muted text-[10px] font-semibold uppercase tracking-wider">
                Input
              </span>
              <pre class="bg-app border border-border/60 rounded-md p-2 mt-1 overflow-x-auto text-[11px] text-content whitespace-pre-wrap">
                {JSON.stringify(props.part.state.input, null, 2)}
              </pre>
            </div>
          </Show>
          <Show when={props.part.state.output}>
            <div class="pt-2">
              <span class="text-muted text-[10px] font-semibold uppercase tracking-wider">
                Output
              </span>
              <pre class="bg-app border border-border/60 rounded-md p-2 mt-1 overflow-x-auto text-[11px] text-content whitespace-pre-wrap max-h-40 overflow-y-auto">
                {props.part.state.output}
              </pre>
            </div>
          </Show>
          <Show when={props.part.state.error}>
            <div class="pt-2">
              <span class="text-error text-[10px] font-semibold uppercase tracking-wider">
                Error
              </span>
              <pre class="bg-error/10 border border-error/30 rounded-md p-2 mt-1 text-[10px] text-error whitespace-pre-wrap">
                {props.part.state.error}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function ToolCallGroup(props: { parts: OcToolPart[] }): JSX.Element {
  const [showAll, setShowAll] = createSignal(false)
  const maxVisible = 6

  const visibleTools = () => (showAll() ? props.parts : props.parts.slice(0, maxVisible))
  const hiddenCount = () => Math.max(0, props.parts.length - maxVisible)

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-1.5">
        <Terminal size={12} class="text-heading" />
        <span class="text-heading text-[10px] font-semibold tracking-wider uppercase select-none">
          Tool calls ({props.parts.length})
        </span>
      </div>
      <For each={visibleTools()}>{(part) => <ToolCard part={part} />}</For>
      <Show when={!showAll() && hiddenCount() > 0}>
        <button
          type="button"
          onClick={() => setShowAll(true)}
          class="text-[10px] text-accent hover:text-accent/80 bg-transparent border border-border hover:border-accent/40 cursor-pointer px-2.5 py-1 rounded-md font-medium transition-colors"
        >
          Show {hiddenCount()} more...
        </button>
      </Show>
    </div>
  )
}

function MessagePart(props: {
  part: OcPart
  streamingContent: Record<string, string>
}): JSX.Element {
  return (
    <Switch>
      <Match when={props.part.type === 'text' && props.part}>
        {(part) => {
          const text = (): string =>
            props.streamingContent[part().id] || (part() as OcTextPart).text
          return <MessageContent text={text()} />
        }}
      </Match>
      <Match when={props.part.type === 'tool' && props.part}>
        {(part) => <ToolCard part={part() as OcToolPart} />}
      </Match>
    </Switch>
  )
}

export default function MessageList(props: MessageListProps): JSX.Element {
  const lastAssistantMsg = () => {
    for (let i = props.messages.length - 1; i >= 0; i--) {
      if (props.messages[i].role === 'assistant') return props.messages[i]
    }
    return undefined
  }

  return (
    <div class="flex flex-col gap-3 p-3">
      <For each={props.messages}>
        {(msg, idx) => {
          const showTurnSeparator = () => {
            if (idx() === 0) return false
            const prev = props.messages[idx() - 1]
            return msg.role === 'user' && prev.role === 'assistant'
          }

          const isLastAssistant = () => msg === lastAssistantMsg()
          const grouped = () => groupParts(msg.parts)

          return (
            <>
              <Show when={showTurnSeparator()}>
                <div class="border-t border-border/50 my-1" />
              </Show>
              <div
                class="flex flex-col gap-1"
                classList={{
                  'items-end': msg.role === 'user',
                  'items-start': msg.role === 'assistant'
                }}
              >
                <div class="flex items-center gap-2 px-1">
                  <span class="text-[11px] text-muted select-none">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <Show when={msg.createdAt}>
                    <span class="text-[10px] text-muted/60 select-none">
                      {formatTime(msg.createdAt)}
                    </span>
                  </Show>
                  <Show
                    when={
                      isLastAssistant() && props.generationDuration && props.generationDuration > 0
                    }
                  >
                    <span class="text-[10px] text-muted/60 select-none">
                      &middot; {formatDuration(props.generationDuration || 0)}
                    </span>
                  </Show>
                </div>
                <div
                  class="max-w-[90%] rounded-lg px-3 py-2 space-y-2"
                  classList={{
                    'bg-accent/15 border border-accent/30': msg.role === 'user',
                    'bg-sidebar border border-border': msg.role === 'assistant'
                  }}
                >
                  <For each={grouped()}>
                    {(item) => (
                      <Show
                        when={item.type === 'tools' && item}
                        fallback={
                          <MessagePart
                            part={(item as { type: 'part'; part: OcPart }).part}
                            streamingContent={props.streamingContent}
                          />
                        }
                      >
                        {(toolGroup) => (
                          <ToolCallGroup
                            parts={
                              (
                                toolGroup() as {
                                  type: 'tools'
                                  parts: OcToolPart[]
                                }
                              ).parts
                            }
                          />
                        )}
                      </Show>
                    )}
                  </For>
                  <Show when={!msg.error && msg.parts.length === 0}>
                    <span class="text-muted text-[11px] italic">...</span>
                  </Show>
                  <Show when={msg.error}>
                    <div class="bg-error/10 border border-error/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
                      <div class="flex items-center gap-1.5">
                        <XCircle size={12} class="text-error flex-shrink-0" />
                        <span class="text-error font-semibold">{msg.error?.name}</span>
                      </div>
                      <p class="text-error/80 text-[11px] mt-1 leading-relaxed">
                        {msg.error?.message}
                      </p>
                    </div>
                  </Show>
                </div>
              </div>
            </>
          )
        }}
      </For>

      {/* Inline permission/question banners at the bottom of messages */}
      <Show
        when={
          (props.permissions && props.permissions.length > 0) ||
          (props.questions && props.questions.length > 0)
        }
      >
        <div class="flex flex-col gap-2">
          <Show
            when={props.permissions && props.permissions.length > 0 && props.onPermissionRespond}
          >
            <div class="border border-accent/40 border-l-2 border-l-accent rounded-lg bg-sidebar px-3 py-2.5 shadow-sm">
              <PermissionBanner
                permissions={props.permissions || []}
                onRespond={props.onPermissionRespond || (() => {})}
              />
            </div>
          </Show>
          <Show
            when={
              props.questions &&
              props.questions.length > 0 &&
              props.onQuestionRespond &&
              props.onQuestionReject
            }
          >
            <div class="border border-accent/40 border-l-2 border-l-accent rounded-lg bg-sidebar px-3 py-2.5 shadow-sm">
              <QuestionBanner
                questions={props.questions || []}
                onRespond={props.onQuestionRespond || (() => {})}
                onReject={props.onQuestionReject || (() => {})}
              />
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
