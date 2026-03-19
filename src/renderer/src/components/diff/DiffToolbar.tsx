import { PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-solid'
import { For, type JSX } from 'solid-js'

export type DiffMode = 'unstaged' | 'staged' | 'all'
interface DiffToolbarProps {
  diffMode: DiffMode
  totalAdditions: number
  totalDeletions: number
  loading: boolean
  fileListCollapsed: boolean
  onDiffModeChange: (mode: DiffMode) => void
  onRefresh: () => void
  onToggleFileList: () => void
}

function ToggleGroup(props: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <div class="flex rounded overflow-hidden border border-border">
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            class="px-2 py-0.5 text-[11px] font-medium transition-colors"
            classList={{
              'bg-accent text-white': props.value === opt.value,
              'bg-sidebar text-muted hover:bg-hover': props.value !== opt.value
            }}
            onClick={() => props.onChange(opt.value)}
          >
            {opt.label}
          </button>
        )}
      </For>
    </div>
  )
}

export default function DiffToolbar(props: DiffToolbarProps): JSX.Element {
  return (
    <div class="flex items-center gap-3 px-3 py-1.5 bg-sidebar border-b border-border shrink-0">
      <button
        type="button"
        class="p-1 rounded text-muted hover:text-content hover:bg-hover transition-colors"
        onClick={() => props.onToggleFileList()}
        title={props.fileListCollapsed ? 'Show file list' : 'Hide file list'}
      >
        {props.fileListCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
      </button>

      <ToggleGroup
        options={[
          { value: 'unstaged', label: 'Unstaged' },
          { value: 'staged', label: 'Staged' },
          { value: 'all', label: 'All' }
        ]}
        value={props.diffMode}
        onChange={(v) => props.onDiffModeChange(v as DiffMode)}
      />

      <button
        type="button"
        class="p-1 rounded text-muted hover:text-content hover:bg-hover transition-colors"
        onClick={() => props.onRefresh()}
        title="Refresh diff"
      >
        <RefreshCw size={13} classList={{ 'animate-spin': props.loading }} />
      </button>

      <div class="ml-auto flex items-center gap-2 text-[11px] font-mono">
        {props.totalAdditions > 0 && <span class="text-diff-add">+{props.totalAdditions}</span>}
        {props.totalDeletions > 0 && <span class="text-diff-remove">-{props.totalDeletions}</span>}
      </div>
    </div>
  )
}
