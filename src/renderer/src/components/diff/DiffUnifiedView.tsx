import { createMemo, For, type JSX, Show } from 'solid-js'
import type { DiffFile, DiffInlineSpan, DiffRow } from '../../../../shared/types'

interface DiffUnifiedViewProps {
  files: DiffFile[]
  fileRefs: Map<number, HTMLDivElement>
}

function HighlightedLine(props: {
  content: string
  highlights: DiffInlineSpan[]
  type: 'add' | 'remove'
}): JSX.Element {
  const segments = createMemo(() => {
    const segs: { text: string; highlighted: boolean }[] = []
    let pos = 0
    const sorted = [...props.highlights].sort((a, b) => a.start - b.start)
    for (const h of sorted) {
      if (h.start > pos) {
        segs.push({ text: props.content.slice(pos, h.start), highlighted: false })
      }
      segs.push({ text: props.content.slice(h.start, h.end), highlighted: true })
      pos = h.end
    }
    if (pos < props.content.length) {
      segs.push({ text: props.content.slice(pos), highlighted: false })
    }
    return segs
  })

  return (
    <For each={segments()}>
      {(seg) => (
        <span
          classList={{
            'diff-inline-add': seg.highlighted && props.type === 'add',
            'diff-inline-remove': seg.highlighted && props.type === 'remove'
          }}
        >
          {seg.text}
        </span>
      )}
    </For>
  )
}

function RowContent(props: { row: DiffRow }): JSX.Element {
  const highlights = () => props.row.highlights
  return (
    <Show when={highlights()} fallback={<>{props.row.content}</>}>
      {(hl) => (
        <HighlightedLine
          content={props.row.content}
          highlights={hl()}
          type={props.row.type as 'add' | 'remove'}
        />
      )}
    </Show>
  )
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
                {(hunk, hunkIdx) => (
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
                    <For each={hunk.rows}>
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
                )}
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
