import { createMemo, For, type JSX, Show } from 'solid-js'
import type { DiffFile, DiffRow } from '../../../../shared/types'
import { computeInlineSpans } from '../../lib/inlineDiff'
import InlineContent from './InlineContent'

interface DiffUnifiedViewProps {
  files: DiffFile[]
  fileRefs: Map<number, HTMLDivElement>
}

/** A display row that carries partner content for inline highlighting of modify pairs. */
interface DisplayRow extends DiffRow {
  partnerContent?: string | null
}

function RowContent(props: { row: DisplayRow }): JSX.Element {
  const row = props.row
  if (row.partnerContent != null) {
    const spans = createMemo(() => {
      const old = row.type === 'remove' ? (row.oldContent ?? '') : (row.partnerContent ?? '')
      const cur = row.type === 'remove' ? (row.partnerContent ?? '') : (row.newContent ?? '')
      return computeInlineSpans(old, cur)
    })
    if (row.type === 'remove') {
      return <InlineContent spans={spans().oldSpans} type="remove" />
    }
    return <InlineContent spans={spans().newSpans} type="add" />
  }
  return <>{row.type === 'add' ? (row.newContent ?? '') : (row.oldContent ?? '')}</>
}

function FileSection(props: {
  file: DiffFile
  idx: number
  fileRefs: Map<number, HTMLDivElement>
}): JSX.Element {
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
        <div class="overflow-x-auto">
          <table class="diff-table w-full border-collapse font-mono text-[11px] leading-[1.5]">
            <tbody>
              <For each={props.file.hunks}>
                {(hunk, hunkIdx) => {
                  const rows = createMemo((): DisplayRow[] => {
                    const result: DisplayRow[] = []
                    for (const row of hunk.rows) {
                      if (row.type === 'modify') {
                        result.push({
                          ...row,
                          type: 'remove',
                          newLineNo: null,
                          newContent: null,
                          partnerContent: row.newContent
                        })
                        result.push({
                          ...row,
                          type: 'add',
                          oldLineNo: null,
                          oldContent: null,
                          partnerContent: row.oldContent
                        })
                      } else {
                        result.push(row)
                      }
                    }
                    return result
                  })

                  return (
                    <>
                      <Show when={hunkIdx() > 0}>
                        <tr class="diff-hunk-sep">
                          <td
                            colspan={3}
                            class="px-2 py-0.5 text-[11px] text-muted bg-hover/50 border-y border-border/40"
                          >
                            ···
                          </td>
                        </tr>
                      </Show>
                      <For each={rows()}>
                        {(row) => (
                          <tr
                            classList={{
                              'diff-row-add': row.type === 'add',
                              'diff-row-remove': row.type === 'remove',
                              'diff-row-context': row.type === 'context'
                            }}
                          >
                            <td class="diff-gutter diff-gutter-old select-none text-right px-1.5 text-muted/60">
                              {row.oldLineNo ?? ''}
                            </td>
                            <td class="diff-gutter diff-gutter-new select-none text-right px-1.5 text-muted/60">
                              {row.newLineNo ?? ''}
                            </td>
                            <td class="diff-content px-2 whitespace-pre">
                              <RowContent row={row} />
                            </td>
                          </tr>
                        )}
                      </For>
                    </>
                  )
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  )
}

export default function DiffUnifiedView(props: DiffUnifiedViewProps): JSX.Element {
  return (
    <div class="space-y-3 p-3">
      <For each={props.files}>
        {(file, idx) => <FileSection file={file} idx={idx()} fileRefs={props.fileRefs} />}
      </For>
    </div>
  )
}
