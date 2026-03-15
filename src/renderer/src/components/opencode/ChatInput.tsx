import { ImagePlus, Send, Square, X } from 'lucide-solid'
import { createEffect, createSignal, For, type JSX, onCleanup, Show } from 'solid-js'
import type { ImageAttachment } from '../../opencodeStore'

const MAX_IMAGES = 10
const MAX_SIZE_BYTES = 20 * 1024 * 1024

interface ChatInputProps {
  isGenerating: boolean
  generationStartTime?: number
  history: string[]
  onSend: (text: string, images: ImageAttachment[]) => void
  onAbort: () => void
}

export default function ChatInput(props: ChatInputProps): JSX.Element {
  const [text, setText] = createSignal('')
  const [images, setImages] = createSignal<ImageAttachment[]>([])
  const [dragOver, setDragOver] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  let savedDraft = ''
  let textareaRef: HTMLTextAreaElement | undefined
  let fileInputRef: HTMLInputElement | undefined

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

  function resizeTextarea(): void {
    if (!textareaRef) return
    textareaRef.style.height = 'auto'
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`
  }

  function setTextAndResize(value: string): void {
    setText(value)
    if (textareaRef) textareaRef.value = value
    resizeTextarea()
  }

  function addImageFile(file: File): void {
    if (!file.type.startsWith('image/')) return
    if (file.size > MAX_SIZE_BYTES) return
    if (images().length >= MAX_IMAGES) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
          mime: file.type,
          filename: file.name
        }
      ])
    }
    reader.readAsDataURL(file)
  }

  function removeImage(id: string): void {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  function handlePaste(e: ClipboardEvent): void {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) addImageFile(file)
      }
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer?.files
    if (!files) return
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        addImageFile(file)
      }
    }
  }

  function handleFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement
    const files = input.files
    if (!files) return
    for (const file of files) {
      addImageFile(file)
    }
    input.value = ''
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }

    // History navigation with up/down arrows
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const history = props.history
      if (history.length === 0) return

      // Only navigate history when cursor is at the start/end of text
      const textarea = e.target as HTMLTextAreaElement
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
      const atEnd =
        textarea.selectionStart === textarea.value.length &&
        textarea.selectionEnd === textarea.value.length

      if (e.key === 'ArrowUp' && atStart) {
        e.preventDefault()
        const idx = historyIndex()
        if (idx === -1) {
          savedDraft = text()
          setHistoryIndex(history.length - 1)
          setTextAndResize(history[history.length - 1])
        } else if (idx > 0) {
          setHistoryIndex(idx - 1)
          setTextAndResize(history[idx - 1])
        }
      } else if (e.key === 'ArrowDown' && atEnd) {
        e.preventDefault()
        const idx = historyIndex()
        if (idx === -1) return
        if (idx < history.length - 1) {
          setHistoryIndex(idx + 1)
          setTextAndResize(history[idx + 1])
        } else {
          setHistoryIndex(-1)
          setTextAndResize(savedDraft)
        }
      }
    }
  }

  function submit(): void {
    const value = text().trim()
    const imgs = images()
    if ((!value && imgs.length === 0) || props.isGenerating) return
    props.onSend(value, imgs)
    setText('')
    setImages([])
    setHistoryIndex(-1)
    savedDraft = ''
    if (textareaRef) textareaRef.style.height = 'auto'
  }

  function handleInput(e: InputEvent): void {
    const target = e.target as HTMLTextAreaElement
    setText(target.value)
    setHistoryIndex(-1)
    resizeTextarea()
  }

  const canSend = () => text().trim() || images().length > 0

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone for image attachments
    <div
      class="border-t border-border bg-sidebar p-2 flex-shrink-0 transition-colors"
      classList={{ 'border-accent/50 bg-accent/5': dragOver() }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Image preview strip */}
      <Show when={images().length > 0}>
        <div class="flex items-center gap-1.5 mb-1.5 px-1 overflow-x-auto">
          <For each={images()}>
            {(img) => (
              <div class="relative flex-shrink-0 group">
                <img
                  src={img.dataUrl}
                  alt={img.filename}
                  class="w-14 h-14 object-cover rounded border border-border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  class="absolute -top-1.5 -right-1.5 bg-sidebar border border-border rounded-full p-0.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-error"
                  title="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          onChange={handleFileSelect}
        />
        <textarea
          ref={textareaRef}
          value={text()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Send a message..."
          rows={1}
          class="flex-1 resize-none bg-app border border-border rounded-lg px-3 py-2 text-[12px] text-content placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
          style={{ 'min-height': '36px', 'max-height': '200px' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef?.click()}
          class="bg-transparent hover:bg-hover border-none cursor-pointer p-2 rounded-lg transition-colors flex items-center justify-center h-9 text-muted hover:text-content"
          title="Attach images"
        >
          <ImagePlus size={14} />
        </button>
        <Show
          when={props.isGenerating}
          fallback={
            <button
              type="button"
              onClick={submit}
              disabled={!canSend()}
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
            <span class="text-[10px] text-muted/80 select-none">
              Enter to send &middot; Shift+Enter for new line &middot; &uarr;&darr; for history
              &middot; Paste or drop images
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
