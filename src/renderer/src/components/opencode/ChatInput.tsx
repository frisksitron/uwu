import { Send, Square } from 'lucide-solid'
import { createEffect, createSignal, type JSX, onCleanup, Show } from 'solid-js'

interface ChatInputProps {
  isGenerating: boolean
  generationStartTime?: number
  onSend: (text: string) => void
  onAbort: () => void
}

export default function ChatInput(props: ChatInputProps): JSX.Element {
  const [text, setText] = createSignal('')
  const [elapsed, setElapsed] = createSignal(0)
  let textareaRef: HTMLTextAreaElement | undefined

  // Live elapsed counter during generation
  createEffect(() => {
    if (props.isGenerating && props.generationStartTime) {
      const start = props.generationStartTime
      setElapsed(Math.floor((Date.now() - start) / 1000))
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 1000)
      onCleanup(() => clearInterval(interval))
    } else {
      setElapsed(0)
    }
  })

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit(): void {
    const value = text().trim()
    if (!value || props.isGenerating) return
    props.onSend(value)
    setText('')
    if (textareaRef) textareaRef.style.height = 'auto'
  }

  function handleInput(e: InputEvent): void {
    const target = e.target as HTMLTextAreaElement
    setText(target.value)
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`
  }

  return (
    <div class="border-t border-border bg-sidebar p-2 flex-shrink-0">
      <div class="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          class="flex-1 resize-none bg-app border border-border rounded-lg px-3 py-2 text-[12px] text-content placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
          style={{ 'min-height': '36px', 'max-height': '200px' }}
        />
        <Show
          when={props.isGenerating}
          fallback={
            <button
              type="button"
              onClick={submit}
              disabled={!text().trim()}
              class="bg-accent hover:bg-accent/80 disabled:opacity-30 text-white border-none cursor-pointer p-2 rounded-lg transition-colors flex items-center justify-center disabled:cursor-default h-9"
              title="Send"
            >
              <Send size={14} />
            </button>
          }
        >
          <button
            type="button"
            onClick={() => props.onAbort()}
            class="bg-status-stop hover:bg-status-stop/80 text-white border-none cursor-pointer p-2 rounded-lg transition-colors flex items-center justify-center h-9"
            title="Stop generating"
          >
            <Square size={14} />
          </button>
        </Show>
      </div>
      <div class="flex items-center gap-2 mt-1 px-1">
        <Show
          when={props.isGenerating}
          fallback={
            <span class="text-[10px] text-muted/50 select-none">
              Enter to send &middot; Shift+Enter for new line
            </span>
          }
        >
          <span class="pulse-dots text-accent text-[10px]" />
          <span class="text-[10px] text-muted">Working for {elapsed()}s...</span>
        </Show>
      </div>
    </div>
  )
}
