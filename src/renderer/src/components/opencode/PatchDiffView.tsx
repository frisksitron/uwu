import { For, type JSX, Show } from 'solid-js'
import type { OcToolPart } from '../../opcodeChat'
import DiffBlock, { highlightDiff } from './DiffBlock'

function RunningPatchView(props: { input: Record<string, unknown> }): JSX.Element {
  const patchText = () => (props.input.patchText as string) || ''
  const html = () => {
    const text = patchText()
    if (!text) return null
    return highlightDiff(text)
  }

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
        <For each={files()}>
          {(file) => (
            <DiffBlock
              filePath={file.relativePath || file.filePath}
              diff={file.diff}
              additions={file.additions}
              deletions={file.deletions}
              type={file.type}
            />
          )}
        </For>
      </div>
    </Show>
  )
}
