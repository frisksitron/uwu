import { createMemo, For, type JSX, Show } from 'solid-js'
import type { DiffFile, DiffHunk } from '../../../../shared/types'
import { computeInlineSpans } from '../../lib/inlineDiff'
import InlineContent from './InlineContent'

interface DiffSplitViewProps {
  files: DiffFile[]
  fileRefs: Map<number, HTMLDivElement>
}

interface SplitRow {
  type: 'context' | 'add' | 'remove' | 'modify'
  oldLineNo: number | null
  newLineNo: number | null
  oldContent: string | null
  newContent: string | null
}

const expandHunksToSplitRows = (hunks: DiffHunk[]): SplitRow[] => hunks.flatMap((h) => h.rows)

function OldCellContent(props: { row: SplitRow }): JSX.Element {
  if (props.row.type === 'modify' && props.row.oldContent != null && props.row.newContent != null) {
    const spans = createMemo(() =>
      computeInlineSpans(props.row.oldContent ?? '', props.row.newContent ?? '')
    )
    return <InlineContent spans={spans().oldSpans} type="remove" />
  }
  return <>{props.row.type !== 'add' ? (props.row.oldContent ?? '') : ''}</>
}

function NewCellContent(props: { row: SplitRow }): JSX.Element {
  if (props.row.type === 'modify' && props.row.oldContent != null && props.row.newContent != null) {
    const spans = createMemo(() =>
      computeInlineSpans(props.row.oldContent ?? '', props.row.newContent ?? '')
    )
    return <InlineContent spans={spans().newSpans} type="add" />
  }
  return <>{props.row.type !== 'remove' ? (props.row.newContent ?? '') : ''}</>
}

function FileSection(props: {
  file: DiffFile
  idx: number
  fileRefs: Map<number, HTMLDivElement>
}): JSX.Element {
  const splitRows = () => expandHunksToSplitRows(props.file.hunks)
  let leftPane: HTMLDivElement | undefined
  let rightPane: HTMLDivElement | undefined
  let syncing = false

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | undefined): void {
    if (syncing || !target) return
    syncing = true
    const maxSource = source.scrollWidth - source.clientWidth
    const maxTarget = target.scrollWidth - target.clientWidth
    const ratio = maxSource > 0 ? source.scrollLeft / maxSource : 0
    target.scrollLeft = ratio * maxTarget
    syncing = false
  }

  return (
    <div
      ref={(el) => props.fileRefs.set(props.idx, el)}
      class="border border-border/60 rounded-md overflow-hidden"
    >
      {/* File header */}
      <div class="flex items-center gap-2 px-2.5 py-1.5 bg-sidebar/50 border-b border-border/60 sticky top-0 z-10">
        <span class="font-mono text-[11px] text-content truncate">
          {props.file.oldPath ? `${props.file.oldPath} → ${props.file.path}` : props.file.path}
        </span>
        <span class="ml-auto flex items-center gap-1.5 text-[10px] font-mono flex-shrink-0">
          <Show when={props.file.additions > 0}>
            <span class="text-success">+{props.file.additions}</span>
          </Show>
          <Show when={props.file.deletions > 0}>
            <span class="text-error">-{props.file.deletions}</span>
          </Show>
        </span>
      </div>

      <Show
        when={!props.file.binary && props.file.hunks.length > 0}
        fallback={
          <div class="px-3 py-2 text-[11px] text-muted italic">
            {props.file.binary ? 'Binary file' : 'No changes'}
          </div>
        }
      >
        <div class="flex">
          {/* Left pane (old) */}
          <div
            ref={(el) => {
              leftPane = el
            }}
            class="flex-1 min-w-0 overflow-x-auto border-r border-border/40"
            onScroll={(e) => syncScroll(e.currentTarget, rightPane)}
          >
            <div class="diff-half-grid font-mono text-[11px] leading-[1.5]">
              <For each={splitRows()}>
                {(row) => (
                  <>
                    <div
                      class="diff-gutter select-none text-right px-1.5 text-muted/60"
                      classList={{
                        'diff-gutter-remove': row.type === 'remove' || row.type === 'modify',
                        'diff-gutter-context': row.type === 'context',
                        'diff-gutter-filler': row.type === 'add'
                      }}
                    >
                      {row.type !== 'add' ? (row.oldLineNo ?? '') : ''}
                    </div>
                    <div
                      class="diff-content px-2 whitespace-pre"
                      classList={{
                        'diff-row-remove': row.type === 'remove' || row.type === 'modify',
                        'diff-row-context': row.type === 'context',
                        'diff-filler': row.type === 'add'
                      }}
                    >
                      <OldCellContent row={row} />
                    </div>
                  </>
                )}
              </For>
            </div>
          </div>
          {/* Right pane (new) */}
          <div
            ref={(el) => {
              rightPane = el
            }}
            class="flex-1 min-w-0 overflow-x-auto"
            onScroll={(e) => syncScroll(e.currentTarget, leftPane)}
          >
            <div class="diff-half-grid font-mono text-[11px] leading-[1.5]">
              <For each={splitRows()}>
                {(row) => (
                  <>
                    <div
                      class="diff-gutter select-none text-right px-1.5 text-muted/60"
                      classList={{
                        'diff-gutter-add': row.type === 'add' || row.type === 'modify',
                        'diff-gutter-context': row.type === 'context',
                        'diff-gutter-filler': row.type === 'remove'
                      }}
                    >
                      {row.type !== 'remove' ? (row.newLineNo ?? '') : ''}
                    </div>
                    <div
                      class="diff-content px-2 whitespace-pre"
                      classList={{
                        'diff-row-add': row.type === 'add' || row.type === 'modify',
                        'diff-row-context': row.type === 'context',
                        'diff-filler': row.type === 'remove'
                      }}
                    >
                      <NewCellContent row={row} />
                    </div>
                  </>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default function DiffSplitView(props: DiffSplitViewProps): JSX.Element {
  return (
    <div class="space-y-3 p-3">
      <For each={props.files}>
        {(file, idx) => <FileSection file={file} idx={idx()} fileRefs={props.fileRefs} />}
      </For>
    </div>
  )
}
