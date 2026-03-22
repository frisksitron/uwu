import { FilePen } from 'lucide-solid'
import { createMemo, type JSX, Show } from 'solid-js'
import type { OcToolPart } from '../../opcodeChat'
import { highlightDiff } from './PatchDiffView'

function buildEditDiff(filePath: string, oldStr: string, newStr: string): string {
  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`, '@@ edit @@']
  if (oldStr) {
    for (const line of oldStr.split('\n')) {
      lines.push(`-${line}`)
    }
  }
  if (newStr) {
    for (const line of newStr.split('\n')) {
      lines.push(`+${line}`)
    }
  }
  return lines.join('\n')
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

export default function EditDiffView(props: { part: OcToolPart }): JSX.Element {
  const input = () => props.part.state.input
  const filePath = () => {
    const i = input()
    return (i?.filePath as string) || (i?.file_path as string) || 'unknown'
  }
  const oldStr = () => ((input()?.oldString ?? input()?.old_string) as string) ?? ''
  const newStr = () => ((input()?.newString ?? input()?.new_string) as string) ?? ''
  const additions = () => {
    const s = newStr()
    return s ? s.split('\n').length : 0
  }
  const deletions = () => {
    const s = oldStr()
    return s ? s.split('\n').length : 0
  }
  const diffText = () => {
    const o = oldStr()
    const n = newStr()
    if (!o && !n) return null
    return buildEditDiff(filePath(), o, n)
  }
  const html = createMemo(() => {
    const text = diffText()
    if (!text) return null
    return highlightDiff(text)
  })

  return (
    <Show when={diffText()}>
      <div class="max-w-3xl rounded-lg overflow-hidden bg-sidebar border border-border">
        <div class="flex items-center gap-2 px-3 py-1.5">
          <FilePen size={12} class="text-icon-script flex-shrink-0" />
          <span class="font-mono text-[11px] text-content truncate">{basename(filePath())}</span>
          <span class="ml-auto flex items-center gap-1.5 text-[10px] font-mono flex-shrink-0">
            <Show when={additions() > 0}>
              <span class="text-success">+{additions()}</span>
            </Show>
            <Show when={deletions() > 0}>
              <span class="text-error">-{deletions()}</span>
            </Show>
          </span>
        </div>
        <div class="diff-view border-t border-border/60">
          <Show
            when={html()}
            fallback={
              <pre class="bg-app p-2 overflow-x-auto text-[11px] text-content whitespace-pre-wrap leading-relaxed">
                {diffText()}
              </pre>
            }
          >
            {(h) => <div innerHTML={h()} />}
          </Show>
        </div>
      </div>
    </Show>
  )
}
