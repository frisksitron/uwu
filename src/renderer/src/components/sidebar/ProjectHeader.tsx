import { ChevronDown, ChevronRight, Plus, Settings, X } from 'lucide-solid'
import type { JSX } from 'solid-js'
import { Show } from 'solid-js'
import type { Project } from '../../types'
import IconButton from '../ui/IconButton'

interface ProjectHeaderProps {
  project: Project
  isGit: boolean
  onToggleCollapse: () => void
  onSettings: () => void
  onRemove: () => void
  onNewWorktree: () => void
}

export default function ProjectHeader(props: ProjectHeaderProps): JSX.Element {
  return (
    <div
      role="menuitem"
      tabIndex={0}
      class="group flex items-center gap-1 px-2 h-9 border-b border-border cursor-pointer hover:bg-hover"
      onClick={() => props.onToggleCollapse()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') props.onToggleCollapse()
      }}
    >
      <span class="flex-1 flex items-center gap-1.5 min-w-0" title={props.project.path}>
        <span class="text-muted flex-shrink-0 flex items-center">
          {props.project.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        </span>
        <span
          class="font-medium text-[12px] truncate"
          classList={{
            'text-content': !props.project.collapsed,
            'text-muted': props.project.collapsed
          }}
        >
          {props.project.name}
        </span>
        <Show when={props.project.projectType !== 'unknown'}>
          <span class="text-[9px] text-muted border border-border px-1 rounded font-mono flex-shrink-0 leading-[14px]">
            {props.project.projectType}
          </span>
        </Show>
      </span>
      <Show when={props.isGit}>
        <IconButton onClick={() => props.onNewWorktree()} title="New worktree">
          <Plus size={11} />
        </IconButton>
      </Show>
      <IconButton onClick={() => props.onSettings()} title="Project settings">
        <Settings size={11} />
      </IconButton>
      <IconButton onClick={() => props.onRemove()} title="Remove project">
        <X size={11} />
      </IconButton>
    </div>
  )
}
