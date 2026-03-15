import { createEffect, createSignal, For, type JSX, Show } from 'solid-js'
import type { SlashCommand } from '../../opencodeStore'

export interface SlashMenuHandle {
  handleKeyDown: (e: KeyboardEvent) => boolean
}

interface SlashMenuProps {
  commands: SlashCommand[]
  filter: string
  onSelect: (command: string) => void
  onClose: () => void
  ref?: (handle: SlashMenuHandle) => void
}

export default function SlashMenu(props: SlashMenuProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const filtered = () => {
    const f = props.filter.toLowerCase()
    return props.commands.filter((c) => c.name.toLowerCase().includes(f))
  }

  // Reset selection when filter changes
  createEffect(() => {
    filtered()
    setSelectedIndex(0)
  })

  function handleKeyDown(e: KeyboardEvent): boolean {
    const items = filtered()
    if (items.length === 0) return false

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1))
      return true
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0))
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      props.onSelect(items[selectedIndex()].name)
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      props.onClose()
      return true
    }
    return false
  }

  // Expose handle to parent
  props.ref?.({ handleKeyDown })

  return (
    <Show when={filtered().length > 0}>
      <div class="absolute bottom-full left-0 right-0 mb-1 bg-sidebar border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto z-50">
        <div class="py-1">
          <For each={filtered()}>
            {(cmd, index) => (
              <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors cursor-pointer border-none"
                classList={{
                  'bg-accent/15 text-content': index() === selectedIndex(),
                  'bg-transparent text-content hover:bg-hover': index() !== selectedIndex()
                }}
                onMouseEnter={() => setSelectedIndex(index())}
                onClick={() => props.onSelect(cmd.name)}
              >
                <div class="flex flex-col min-w-0">
                  <span class="font-medium text-accent">/{cmd.name}</span>
                  <Show when={cmd.description}>
                    <span class="text-muted truncate text-[11px]">{cmd.description}</span>
                  </Show>
                </div>
                <span
                  class="ml-auto text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                  classList={{
                    'bg-accent/20 text-accent': cmd.source === 'skill',
                    'bg-muted/20 text-muted': cmd.source === 'command',
                    'bg-blue-500/20 text-blue-400': cmd.source === 'mcp'
                  }}
                >
                  {cmd.source}
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
