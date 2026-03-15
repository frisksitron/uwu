import { For, type JSX, Show } from 'solid-js'
import type { OcSession } from '../../opencodeStore'

interface SessionPickerProps {
  sessions: OcSession[]
  currentSessionId: string
  onSelect: (sessionId: string) => void
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
            <button
              type="button"
              onClick={() => props.onSelect(session.id)}
              class="flex items-center gap-2 px-3 py-1.5 text-left bg-transparent border-none cursor-pointer rounded transition-colors hover:bg-hover"
              classList={{
                'bg-active': session.id === props.currentSessionId
              }}
            >
              <span class="flex-1 text-content text-[12px] truncate">{session.title}</span>
              <span class="text-muted text-[10px] flex-shrink-0">
                {formatRelativeTime(session.updatedAt)}
              </span>
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}
