import { GitCompareArrows } from 'lucide-solid'
import type { JSX } from 'solid-js'
import { useProject } from '../context/ProjectContext'
import type { DiffShortStat } from '../types'

interface DiffItemProps {
  stat: DiffShortStat
  cwd: string
  indent: number
}

export default function DiffItem(props: DiffItemProps): JSX.Element {
  const ctx = useProject()

  return (
    // biome-ignore lint/a11y/useSemanticElements: complex interactive container with nested content
    <div
      role="button"
      tabIndex={0}
      class="group/diff relative cursor-pointer text-content text-[13px] hover:bg-hover"
      classList={{
        'bg-active': ctx.isDiffActive(props.cwd)
      }}
      onClick={() => ctx.onOpenDiff(props.cwd)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') ctx.onOpenDiff(props.cwd)
      }}
    >
      <div class="flex items-center py-1.5 pr-2" style={{ 'padding-left': `${props.indent}px` }}>
        <GitCompareArrows size={11} class="flex-shrink-0 mr-2 text-icon-diff" />
        <span class="text-[11px] truncate">
          <span class="text-diff-add">+{props.stat.additions}</span>{' '}
          <span class="text-diff-remove">&minus;{props.stat.deletions}</span>
          <span class="text-muted">
            {' '}
            &middot; {props.stat.filesChanged} {props.stat.filesChanged === 1 ? 'file' : 'files'}
          </span>
        </span>
      </div>
    </div>
  )
}
