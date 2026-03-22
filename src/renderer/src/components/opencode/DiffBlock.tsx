import { FileMinus, FilePen, FilePlus } from 'lucide-solid'
import type { BundledLanguage, ShikiTransformer } from 'shiki'
import { createMemo, type JSX, Show } from 'solid-js'
import { getHighlighter } from '../../lib/highlighter'

export interface DiffBlockProps {
  filePath: string
  diff: string
  additions?: number
  deletions?: number
  type?: 'update' | 'create' | 'delete'
}

const diffLineTransformer: ShikiTransformer = {
  name: 'diff-line-highlight',
  line(_node, line) {
    const src = this.source.split('\n')[line - 1] || ''
    if (src.startsWith('+') && !src.startsWith('+++')) {
      this.addClassToHast(_node, 'diff-add')
    } else if (src.startsWith('-') && !src.startsWith('---')) {
      this.addClassToHast(_node, 'diff-remove')
    }
  }
}

export function highlightDiff(code: string): string | null {
  const hl = getHighlighter()
  if (!hl) return null
  try {
    return hl.codeToHtml(code, {
      lang: 'diff' as BundledLanguage,
      theme: 'vitesse-light',
      transformers: [diffLineTransformer]
    })
  } catch {
    return null
  }
}

function fileIcon(type?: string): JSX.Element {
  switch (type) {
    case 'create':
      return <FilePlus size={12} class="text-success" />
    case 'delete':
      return <FileMinus size={12} class="text-error" />
    default:
      return <FilePen size={12} class="text-accent" />
  }
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

export default function DiffBlock(props: DiffBlockProps): JSX.Element {
  const html = createMemo(() => highlightDiff(props.diff))

  return (
    <div class="max-w-3xl rounded-lg overflow-hidden bg-sidebar border border-border">
      <div class="flex items-center gap-2 px-3 py-1.5">
        {fileIcon(props.type)}
        <span class="font-mono text-[11px] text-content truncate">{basename(props.filePath)}</span>
        <span class="ml-auto flex items-center gap-1.5 text-[10px] font-mono flex-shrink-0">
          <Show when={(props.additions ?? 0) > 0}>
            <span class="text-success">+{props.additions}</span>
          </Show>
          <Show when={(props.deletions ?? 0) > 0}>
            <span class="text-error">-{props.deletions}</span>
          </Show>
        </span>
      </div>
      <div class="diff-view border-t border-border/60">
        <Show
          when={html()}
          fallback={
            <pre class="bg-app p-2 overflow-x-auto text-[11px] text-content whitespace-pre-wrap leading-relaxed">
              {props.diff}
            </pre>
          }
        >
          {(h) => <div innerHTML={h()} />}
        </Show>
      </div>
    </div>
  )
}
