import { AlertTriangle, KeyRound, XCircle } from 'lucide-solid'
import { For, type JSX, Match, Show, Switch } from 'solid-js'
import type {
  OcFilePart,
  OcMessage,
  OcMessageError,
  OcPart,
  OcTextPart,
  OcToolPart
} from '../../opcodeChat'
import EditDiffView from './EditDiffView'
import MessageContent from './MessageContent'
import PatchDiffView from './PatchDiffView'

interface MessageListProps {
  messages: OcMessage[]
  streamingContent: Record<string, string>
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
        {(part) => {
          const toolPart = () => part() as OcToolPart
          return (
            <Show
              when={
                toolPart().tool === 'apply_patch' &&
                toolPart().state.status === 'completed' &&
                toolPart().state.metadata
              }
            >
              <PatchDiffView part={toolPart()} />
            </Show>
          )
        }}
      </Match>
      <Match when={props.part.type === 'file' && props.part}>
        {(part) => {
          const filePart = () => part() as OcFilePart
          return (
            <Show
              when={filePart().mime.startsWith('image/')}
              fallback={
                <span class="text-[11px] text-muted italic">
                  {filePart().filename || 'file attachment'}
                </span>
              }
            >
              <img
                src={filePart().url}
                alt={filePart().filename || 'image'}
                class="max-w-[300px] max-h-[200px] rounded border border-border"
              />
            </Show>
          )
        }}
      </Match>
    </Switch>
  )
}

function MessageError(props: { error: OcMessageError }): JSX.Element {
  return (
    <Switch
      fallback={
        <div class="bg-error/10 border border-error/30 rounded-md px-2.5 py-2 text-[13px] shadow-sm">
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
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[13px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <KeyRound size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">Authentication failed</span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            {props.error.providerID
              ? `Couldn't authenticate with ${props.error.providerID} — double-check your API key is set.`
              : props.error.message}
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'ContextOverflowError'}>
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[13px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <AlertTriangle size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">Context limit reached</span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            This conversation got too long for the model to handle. Start a new session, or type
            /compact to summarize and continue.
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'MessageOutputLengthError'}>
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[13px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <AlertTriangle size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">Output truncated</span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            The response hit the output limit and was cut short. You can ask the AI to continue.
          </p>
        </div>
      </Match>

      <Match when={props.error.name === 'StructuredOutputError'}>
        <div class="bg-error/10 border border-error/30 rounded-md px-2.5 py-2 text-[13px] shadow-sm">
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
        <div class="bg-warning/10 border border-warning/30 rounded-md px-2.5 py-2 text-[13px] shadow-sm">
          <div class="flex items-center gap-1.5">
            <AlertTriangle size={12} class="text-warning flex-shrink-0" />
            <span class="text-warning font-semibold">
              API error{props.error.statusCode ? ` (${props.error.statusCode})` : ''}
            </span>
          </div>
          <p class="text-content/70 text-[11px] mt-1 leading-relaxed">
            {props.error.message} — you can retry by sending your message again.
          </p>
        </div>
      </Match>
    </Switch>
  )
}

export default function MessageList(props: MessageListProps): JSX.Element {
  return (
    <div class="flex flex-col gap-3 px-7 pt-3 pb-12 max-w-3xl mx-auto w-full">
      <For each={props.messages}>
        {(msg) => {
          const isEditTool = (p: OcPart) => {
            if (p.type !== 'tool') return false
            const tool = p as OcToolPart
            return (
              (tool.tool === 'edit' || tool.tool === 'Edit') &&
              tool.state.status === 'completed' &&
              tool.state.input
            )
          }

          const visibleParts = () => {
            if (msg.role === 'user') {
              return msg.parts.filter((p) => !(p.type === 'text' && (p as OcTextPart).synthetic))
            }
            return msg.parts.filter((p) => {
              if (p.type === 'tool') {
                const tool = p as OcToolPart
                if (
                  tool.tool === 'apply_patch' &&
                  tool.state.status === 'completed' &&
                  tool.state.metadata
                ) {
                  return true
                }
                if (isEditTool(p)) return true
                return false
              }
              if (p.type === 'reasoning') return false
              return true
            })
          }

          const bubbleParts = () => visibleParts().filter((p) => !isEditTool(p))
          const editParts = () => visibleParts().filter(isEditTool) as OcToolPart[]

          const shouldHide = () =>
            msg.role === 'assistant' && visibleParts().length === 0 && !msg.error

          return (
            <Show when={!shouldHide()}>
              <div class="flex flex-col gap-1.5" classList={{ 'items-end': msg.role === 'user' }}>
                <Show when={bubbleParts().length > 0 || msg.error || msg.role === 'user'}>
                  <div
                    class="max-w-3xl py-2 space-y-2"
                    classList={{
                      'bg-accent/15 border border-accent/30 rounded-lg w-fit px-3':
                        msg.role === 'user'
                    }}
                  >
                    <For each={bubbleParts()}>
                      {(part) => (
                        <MessagePart part={part} streamingContent={props.streamingContent} />
                      )}
                    </For>
                    <Show when={!msg.error && visibleParts().length === 0 && msg.role === 'user'}>
                      <span class="text-muted text-[11px] italic">(empty message)</span>
                    </Show>
                    <Show when={msg.error}>{(error) => <MessageError error={error()} />}</Show>
                  </div>
                </Show>
                <For each={editParts()}>{(part) => <EditDiffView part={part} />}</For>
              </div>
            </Show>
          )
        }}
      </For>
    </div>
  )
}
