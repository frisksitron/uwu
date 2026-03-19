import {
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Sparkles,
  SquareTerminal,
  X
} from 'lucide-solid'
import { createSignal, type JSX, Show } from 'solid-js'
import { useProject } from '../../context/ProjectContext'
import type { Project } from '../../types'
import ConfirmDialog from '../ConfirmDialog'
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
  const ctx = useProject()
  const [pendingRemove, setPendingRemove] = createSignal(false)

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: complex container with nested interactive children */}
      <div
        role="button"
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
            class="font-semibold text-[13px] truncate"
            classList={{
              'text-content': !props.project.collapsed,
              'text-muted': props.project.collapsed
            }}
          >
            {props.project.name}
          </span>
        </span>
        <Show when={!props.isGit}>
          <IconButton onClick={() => ctx.onCreateTerminal()} title="New terminal">
            <SquareTerminal size={11} />
          </IconButton>
          <IconButton onClick={() => ctx.onCreateOpencodeInstance()} title="New AI chat">
            <Sparkles size={11} />
          </IconButton>
        </Show>
        <Show when={props.isGit}>
          <IconButton onClick={() => props.onNewWorktree()} title="New worktree">
            <Plus size={11} />
          </IconButton>
        </Show>
        <IconButton onClick={() => props.onSettings()} title="Project settings">
          <Settings size={11} />
        </IconButton>
        <IconButton onClick={() => setPendingRemove(true)} title="Remove project">
          <X size={11} />
        </IconButton>
      </div>
      <Show when={pendingRemove()}>
        <ConfirmDialog
          title="Remove project"
          message={`Remove "${props.project.name}" from the sidebar? This won't delete any files.`}
          confirmLabel="Remove project"
          onConfirm={() => {
            setPendingRemove(false)
            props.onRemove()
          }}
          onCancel={() => setPendingRemove(false)}
        />
      </Show>
    </>
  )
}
