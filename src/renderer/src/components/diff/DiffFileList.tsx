import { FileMinus, FilePen, FilePlus } from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
import type { DiffFile } from '../../../../shared/types'

interface DiffFileListProps {
  files: DiffFile[]
  selectedIdx: number
  onSelect: (idx: number) => void
}

function statusIcon(status: DiffFile['status']): JSX.Element {
  switch (status) {
    case 'added':
      return <FilePlus size={12} class="text-success flex-shrink-0" />
    case 'deleted':
      return <FileMinus size={12} class="text-error flex-shrink-0" />
    default:
      return <FilePen size={12} class="text-accent flex-shrink-0" />
  }
}

export default function DiffFileList(props: DiffFileListProps): JSX.Element {
  return (
    <div class="diff-file-list h-full overflow-y-auto bg-sidebar">
      <div class="px-2 py-1.5 text-[11px] text-muted uppercase tracking-wider font-semibold border-b border-border">
        Files ({props.files.length})
      </div>
      <For each={props.files}>
        {(file, idx) => (
          <button
            type="button"
            class="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-hover transition-colors"
            classList={{ 'bg-active': props.selectedIdx === idx() }}
            onClick={() => props.onSelect(idx())}
          >
            {statusIcon(file.status)}
            <span class="text-[11px] text-content truncate flex-1 font-mono">{file.path}</span>
            <span class="flex items-center gap-1 text-[10px] font-mono flex-shrink-0">
              <Show when={file.additions > 0}>
                <span class="text-diff-add">+{file.additions}</span>
              </Show>
              <Show when={file.deletions > 0}>
                <span class="text-diff-remove">-{file.deletions}</span>
              </Show>
            </span>
          </button>
        )}
      </For>
    </div>
  )
}
