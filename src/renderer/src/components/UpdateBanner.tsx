import { type JSX, Show } from 'solid-js'
import { useUpdater } from '../updaterStore'

export default function UpdateBanner(): JSX.Element {
  const { updateReady, dismissed, installUpdate, dismiss } = useUpdater()

  return (
    <Show when={updateReady() && !dismissed()}>
      <div class="flex items-center justify-between px-4 py-2 bg-sidebar border-b border-border text-content text-sm shrink-0">
        <span>
          Update <strong>v{updateReady()?.version}</strong> is ready to install.
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
            onClick={() => installUpdate()}
          >
            Restart
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded bg-hover text-content text-xs font-medium hover:bg-active transition-colors"
            onClick={() => dismiss()}
          >
            Later
          </button>
        </div>
      </div>
    </Show>
  )
}
