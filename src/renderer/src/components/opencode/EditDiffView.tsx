import { type JSX, Show } from 'solid-js'
import type { OcToolPart } from '../../opcodeChat'
import DiffBlock from './DiffBlock'

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

export default function EditDiffView(props: { part: OcToolPart }): JSX.Element {
  const input = () => props.part.state.input
  const filePath = () => {
    const i = input()
    return (i?.filePath as string) || (i?.file_path as string) || 'unknown'
  }
  const oldStr = () => ((input()?.oldString ?? input()?.old_string) as string) ?? ''
  const newStr = () => ((input()?.newString ?? input()?.new_string) as string) ?? ''

  const diffText = () => {
    const o = oldStr()
    const n = newStr()
    if (!o && !n) return null
    return buildEditDiff(filePath(), o, n)
  }

  return (
    <Show when={diffText()}>
      {(diff) => (
        <DiffBlock
          filePath={filePath()}
          diff={diff()}
          additions={newStr() ? newStr().split('\n').length : 0}
          deletions={oldStr() ? oldStr().split('\n').length : 0}
        />
      )}
    </Show>
  )
}
