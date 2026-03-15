import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  Terminal,
  XCircle
} from 'lucide-solid'
import { createSignal, For, type JSX, Match, Show, Switch } from 'solid-js'
import type {
  OcMessage,
  OcMessageError,
  OcPart,
  OcPermission,
  OcQuestion,
  OcReasoningPart,
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

function ReasoningBlock(props: {
  part: OcReasoningPart
  streamingContent: Record<string, string>
}): JSX.Element {
  const [expanded, setExpanded] = createSignal(false)

  const text = (): string => props.streamingContent[props.part.id] || props.part.text
  const isStreaming = () => !props.part.endTime
  const duration = (): string | undefined => {
    if (!props.part.startTime || !props.part.endTime) return undefined
    const ms = props.part.endTime - props.part.startTime
    return formatDuration(ms)
  }

  return (
    <div class="rounded-md text-[12px]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="flex items-center gap-1.5 px-0 py-0.5 bg-transparent border-none cursor-pointer text-left text-muted hover:text-content transition-colors"
      >
        <span class="flex-shrink-0">
          {expanded() ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <Show
          when={!isStreaming()}
          fallback={
            <>
              <Loader2 size={11} class="animate-spin text-accent" />
              <span class="text-[11px] italic">Thinking...</span>
            </>
          }
        >
          <Brain size={11} />
          <span class="text-[11px] italic">Thought{duration() ? ` for ${duration()}` : ''}</span>
        </Show>
      </button>
      <Show when={expanded() && text()}>
        <div class="mt-1 pl-5 border-l-2 border-border/50 text-muted">
          <MessageContent text={text()} />
        </div>
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
      <Match when={props.part.type === 'reasoning' && props.part}>
        {(part) => (
          <ReasoningBlock
            part={part() as OcReasoningPart}
            streamingContent={props.streamingContent}
          />
        )}
      </Match>
      <Match when={props.part.type === 'tool' && props.part}>
        {(part) => <ToolCard part={part() as OcToolPart} />}
      </Match>
    </Switch>
  )
}

function MessageError(props: { error: OcMessageError }): JSX.Element {
  return (
    <Switch
      fallback={
        <div class="bg-error/10 border border-error/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <XCircle size={12} class="text-error flex-shrink-0" />
            <span class="text-error font-semibold">{props.error.name}</span>
          </div>
          <p class="text-error/80 text-[11px] mt-1 leading-relaxed">{props.error.message}</p>
        </div>
      }
    >
      <Match when={props.error.name === 'MessageAbortedError'}>
        <span class="text-muted text-[11px] italic select-none">Generation stopped</span>
      </Match>

      <Match when={props.error.name === 'ProviderAuthError'}>
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <KeyRound size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">Authentication failed</span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            {props.error.providerID
              ? `Could not authenticate with provider "${props.error.providerID}". Check your API key.`
              : props.error.message}
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'ContextOverflowError'}>
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <AlertTriangle size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">Context limit reached</span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            The conversation is too long for the model's context window. Try starting a new session
            or compacting this one.
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'MessageOutputLengthError'}>
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <AlertTriangle size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">Output truncated</span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            The response exceeded the maximum output length and was cut short.
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'StructuredOutputError'}>
        <div class="bg-error/10 border border-error/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <XCircle size={12} class="text-error flex-shrink-0" />
            <span class="text-error font-semibold">Output parsing failed</span>
          </div>
          <p class="text-error/80 text-[11px] mt-1 leading-relaxed">
            {props.error.message}
            <Show when={props.error.retries}>
              {' '}
              ({props.error.retries} {props.error.retries === 1 ? 'retry' : 'retries'} attempted)
            </Show>
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'APIError' && props.error.isRetryable}>
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[12px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <AlertTriangle size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">
              API error{props.error.statusCode ? ` (${props.error.statusCode})` : ''}
            </span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            {props.error.message} — this error is retryable, try sending your message again.
          </p>
        </div>
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
                    <span class="text-muted text-[11px] italic flex items-center gap-1.5">
                      <Show when={msg.role === 'assistant'} fallback={<span>...</span>}>
                        <Loader2 size={11} class="animate-spin" />
                        Thinking...
                      </Show>
                    </span>
                  </Show>
                  <Show when={msg.error}>{(error) => <MessageError error={error()} />}</Show>
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
