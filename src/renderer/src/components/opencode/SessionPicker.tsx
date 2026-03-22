import { X } from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
import type { OcSession } from '../../opcodeProject'

interface SessionPickerProps {
  sessions: OcSession[]
  currentSessionId: string
  onSelect: (sessionId: string) => void
  onDelete?: (sessionId: string) => void
}

function formatRelativeTime(timestamp: number): string {
  // Handle both seconds and milliseconds timestamps
  const ts = timestamp < 1e12 ? timestamp * 1000 : timestamp
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export default function SessionPicker(props: SessionPickerProps): JSX.Element {
  const sorted = () => [...props.sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <Show
      when={sorted().length > 0}
      fallback={
        <p class="text-muted text-[11px] opacity-60 text-center py-2 select-none">
          No previous sessions
        </p>
      }
    >
      <div class="flex flex-col">
        <For each={sorted()}>
          {(session) => (
            <div
              class="group flex items-center rounded transition-colors hover:bg-hover"
              classList={{
                'bg-active': session.id === props.currentSessionId
              }}
            >
              <button
                type="button"
                onClick={() => props.onSelect(session.id)}
                class="flex-1 flex items-center gap-2 px-3 py-1.5 text-left bg-transparent border-none cursor-pointer min-w-0"
              >
                <span class="flex-1 text-content text-[13px] truncate">{session.title}</span>
                <span class="text-muted text-[11px] flex-shrink-0 group-hover:hidden">
                  {formatRelativeTime(session.updatedAt)}
                </span>
              </button>
              <Show when={props.onDelete}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onDelete?.(session.id)
                  }}
                  class="hidden group-hover:flex items-center justify-center w-6 h-6 mr-1 rounded bg-transparent border-none cursor-pointer text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
                  title="Delete session"
                >
                  <X size={12} />
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
