import { ArrowUp, ImagePlus, Square, X } from 'lucide-solid'
import { createEffect, createSignal, For, type JSX, onCleanup, Show } from 'solid-js'
import type { ImageAttachment } from '../../opcodeChat'
import type { SlashCommand } from '../../opcodeProject'
import { getAgents } from '../../opcodeProject'
import { matchesBinding, settings } from '../../settingsStore'
import AgentSelector from './AgentSelector'
import ModelSelector from './ModelSelector'
import SlashMenu from './SlashMenu'
import VariantSelector from './VariantSelector'

const MAX_IMAGES = 10
const MAX_SIZE_BYTES = 20 * 1024 * 1024

interface ChatInputProps {
  isGenerating: boolean
  generationStartTime?: number
  history: string[]
  slashCommands: SlashCommand[]
  onSend: (text: string, images: ImageAttachment[]) => void
  onAbort: () => void
  visible: boolean
  projectPath: string
  model?: { providerID: string; modelID: string }
  onModelChange: (model: { providerID: string; modelID: string } | undefined) => void
  agent?: string
  onAgentChange: (agent: string | undefined) => void
  variant?: string
  onVariantChange: (variant: string | undefined) => void
}

export default function ChatInput(props: ChatInputProps): JSX.Element {
  const [text, setText] = createSignal('')
  const [images, setImages] = createSignal<ImageAttachment[]>([])
  const [dragOver, setDragOver] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [showSlashMenu, setShowSlashMenu] = createSignal(false)
  const [slashFilter, setSlashFilter] = createSignal('')
  let savedDraft = ''
  let textareaRef: HTMLTextAreaElement | undefined
  let fileInputRef: HTMLInputElement | undefined
  let slashMenuRef: { handleKeyDown: (e: KeyboardEvent) => boolean } | undefined

  // Focus textarea when this tab becomes visible
  createEffect(() => {
    if (props.visible && textareaRef) {
      textareaRef.focus()
    }
  })

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

  function handleSlashSelect(command: string): void {
    setTextAndResize(`/${command} `)
    setShowSlashMenu(false)
    textareaRef?.focus()
  }

  function handleKeyDown(e: KeyboardEvent): void {
    // Forward to slash menu when visible
    if (showSlashMenu() && slashMenuRef) {
      const handled = slashMenuRef.handleKeyDown(e)
      if (handled) return
    }

    // Cycle agent hotkey
    if (matchesBinding(e, settings.shortcuts.cycleAgent)) {
      e.preventDefault()
      const agents = getAgents(props.projectPath)
      if (agents.length === 0) return
      const options: Array<string | undefined> = [undefined, ...agents.map((a) => a.name)]
      const currentIdx = options.indexOf(props.agent)
      const nextIdx = (currentIdx + 1) % options.length
      props.onAgentChange(options[nextIdx])
      return
    }

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
    setShowSlashMenu(false)
    savedDraft = ''
    if (textareaRef) textareaRef.style.height = 'auto'
  }

  function handleInput(e: InputEvent): void {
    const target = e.target as HTMLTextAreaElement
    const value = target.value
    setText(value)
    setHistoryIndex(-1)
    resizeTextarea()

    // Slash menu logic: show when text starts with / and has no space yet (typing command name)
    if (value.startsWith('/') && !value.includes(' ') && value.length > 0) {
      setSlashFilter(value.slice(1))
      setShowSlashMenu(true)
    } else {
      setShowSlashMenu(false)
    }
  }

  const canSend = () => text().trim() || images().length > 0

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone for image attachments
    <div
      class="mx-3 mb-3 rounded-xl border border-border bg-app shadow-sm flex-shrink-0 transition-colors"
      classList={{ 'border-accent/50 bg-accent/5 shadow-md': dragOver() }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Image preview strip */}
      <Show when={images().length > 0}>
        <div class="flex items-center gap-1.5 px-3 pt-3 overflow-x-auto">
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
                  class="absolute -top-1.5 -right-1.5 bg-app border border-border rounded-full p-0.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-error"
                  title="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Slash menu — floats above the card */}
      <div class="relative">
        <Show when={showSlashMenu() && props.slashCommands.length > 0}>
          <SlashMenu
            ref={(el) => {
              slashMenuRef = el
            }}
            commands={props.slashCommands}
            filter={slashFilter()}
            onSelect={handleSlashSelect}
            onClose={() => setShowSlashMenu(false)}
          />
        </Show>
      </div>

      {/* Textarea — borderless inside card */}
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
        class="w-full resize-none bg-transparent border-none px-3 pt-3 pb-2 text-[13px] text-content placeholder:text-muted/60 focus:outline-none transition-colors"
        style={{ 'min-height': '36px', 'max-height': '200px' }}
      />

      {/* Bottom toolbar — everything unified in one row */}
      <div class="flex items-center gap-1 px-2 py-1.5 border-t border-border/50">
        <button
          type="button"
          onClick={() => fileInputRef?.click()}
          class="bg-transparent hover:bg-hover border-none cursor-pointer p-1.5 rounded-lg transition-colors flex items-center justify-center text-muted hover:text-content active:scale-95"
          title="Attach images"
        >
          <ImagePlus size={14} />
        </button>
        <div class="flex items-center gap-1 min-w-0">
          <AgentSelector
            projectPath={props.projectPath}
            value={props.agent}
            onChange={props.onAgentChange}
          />
          <ModelSelector
            projectPath={props.projectPath}
            value={props.model}
            onChange={props.onModelChange}
          />
          <VariantSelector
            projectPath={props.projectPath}
            model={props.model}
            value={props.variant}
            onChange={props.onVariantChange}
          />
        </div>
        <div class="flex-1" />
        <div class="hidden sm:flex items-center gap-2 min-w-0 overflow-hidden">
          <Show when={props.isGenerating}>
            <span class="pulse-dots text-accent text-[11px] flex-shrink-0" />
            <span class="text-[11px] text-muted whitespace-nowrap">
              Working for {elapsed()}s...
            </span>
          </Show>
        </div>
        <Show
          when={props.isGenerating}
          fallback={
            <button
              type="button"
              onClick={submit}
              disabled={!canSend()}
              class="bg-accent hover:bg-accent/80 disabled:opacity-40 text-white border-none cursor-pointer p-1.5 rounded-lg transition-colors flex items-center justify-center disabled:cursor-default h-7 w-7 active:scale-95"
              title="Send"
            >
              <ArrowUp size={14} />
            </button>
          }
        >
          <button
            type="button"
            onClick={() => props.onAbort()}
            class="bg-status-stop hover:bg-status-stop/80 text-white border-none cursor-pointer p-1.5 rounded-lg transition-colors flex items-center justify-center h-7 w-7 active:scale-95"
            title="Stop generating"
          >
            <Square size={14} />
          </button>
        </Show>
      </div>
    </div>
  )
}
