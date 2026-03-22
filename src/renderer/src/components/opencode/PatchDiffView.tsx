import { FileMinus, FilePen, FilePlus } from 'lucide-solid'
import type { BundledLanguage, ShikiTransformer } from 'shiki'
import { createMemo, For, type JSX, Show } from 'solid-js'
import { getHighlighter } from '../../lib/highlighter'
import type { OcPatchFileInfo, OcToolPart } from '../../opcodeChat'

const diffLineTransformer: ShikiTransformer = {
  name: 'diff-line-highlight',
  line(node, line) {
    // Get the text content of the line
    const text = node.children
      .map((c) => (c.type === 'text' ? c.value : c.type === 'element' ? '' : ''))
      .join('')
    // Also check raw source lines
    const src = this.source.split('\n')[line - 1] || ''
    if (src.startsWith('+') && !src.startsWith('+++')) {
      this.addClassToHast(node, 'diff-add')
    } else if (src.startsWith('-') && !src.startsWith('---')) {
      this.addClassToHast(node, 'diff-remove')
    }
    void text
  }
}

function fileIcon(type: OcPatchFileInfo['type']): JSX.Element {
  switch (type) {
    case 'create':
      return <FilePlus size={12} class="text-success" />
    case 'delete':
      return <FileMinus size={12} class="text-error" />
    default:
      return <FilePen size={12} class="text-accent" />
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

function FileDiffSection(props: { file: OcPatchFileInfo }): JSX.Element {
  const html = createMemo(() => highlightDiff(props.file.diff))

  return (
    <div class="border border-border/60 rounded-md overflow-hidden">
      <div class="flex items-center gap-2 px-2.5 py-1.5 bg-sidebar/50 border-b border-border/60">
        {fileIcon(props.file.type)}
        <span class="font-mono text-[11px] text-content truncate">
          {props.file.relativePath || props.file.filePath}
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
      <div class="diff-view">
        <Show
          when={html()}
          fallback={
            <pre class="bg-app p-2 overflow-x-auto text-[11px] text-content whitespace-pre-wrap leading-relaxed">
              {props.file.diff}
            </pre>
          }
        >
          {(h) => <div innerHTML={h()} />}
        </Show>
      </div>
    </div>
  )
}

function RunningPatchView(props: { input: Record<string, unknown> }): JSX.Element {
  const patchText = () => (props.input.patchText as string) || ''
  const html = createMemo(() => {
    const text = patchText()
    if (!text) return null
    return highlightDiff(text)
  })

  return (
    <Show when={patchText()}>
      <div class="diff-view">
        <Show
          when={html()}
          fallback={
            <pre class="bg-app border border-border/60 rounded-md p-2 overflow-x-auto text-[11px] text-content whitespace-pre-wrap leading-relaxed">
              {patchText()}
            </pre>
          }
        >
          {(h) => (
            <div class="border border-border/60 rounded-md overflow-hidden" innerHTML={h()} />
          )}
        </Show>
      </div>
    </Show>
  )
}

export default function PatchDiffView(props: { part: OcToolPart }): JSX.Element {
  const metadata = () => props.part.state.metadata
  const files = () => metadata()?.files
  const hasFiles = () => {
    const f = files()
    return f && f.length > 0
  }

  return (
    <Show
      when={hasFiles()}
      fallback={
        <Show when={props.part.state.input}>{(input) => <RunningPatchView input={input()} />}</Show>
      }
    >
      <div class="space-y-2 pt-2">
        <For each={files()}>{(file) => <FileDiffSection file={file} />}</For>
      </div>
    </Show>
  )
}
