import { ChevronDown, ChevronRight, RefreshCw, Sparkles, SquareTerminal, X } from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
import { useProject } from '../../context/ProjectContext'
import type { Project, WorktreeInfo } from '../../types'
import ScriptsAndTerminals from '../ScriptsAndTerminals'

interface WorktreeListProps {
  project: Project
  worktrees: WorktreeInfo[]
  onToggleExpanded: (wtPath: string) => void
  onRemoveWorktree: (wt: WorktreeInfo) => void
  onSyncFiles: (wt: WorktreeInfo) => void
}

export default function WorktreeList(props: WorktreeListProps): JSX.Element {
  const ctx = useProject()

  return (
    <For each={props.worktrees}>
      {(wt) => {
        const isExpanded = (): boolean => props.project.expandedWorktrees?.[wt.path] ?? false

        return (
          <div>
            {/* Worktree header */}
            <div class="group/wt flex items-center gap-1 py-[3px] px-2 pl-4 cursor-pointer hover:bg-hover">
              <span
                role="menuitem"
                tabIndex={0}
                class="flex-1 flex items-center gap-1.5 min-w-0"
                onClick={() => props.onToggleExpanded(wt.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') props.onToggleExpanded(wt.path)
                }}
                title={wt.path}
              >
                <span class="text-muted flex-shrink-0 flex items-center">
                  {isExpanded() ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </span>
                <span
                  class="text-[12px] truncate"
                  classList={{
                    'text-content': isExpanded(),
                    'text-muted': !isExpanded()
                  }}
                >
                  {wt.branch}
                </span>
                <Show when={wt.isMain}>
                  <span class="text-[10px] flex-shrink-0 text-status-running">★</span>
                </Show>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  ctx.onCreateTerminal(wt.path)
                }}
                class="invisible group-hover/wt:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                title="New terminal"
              >
                <SquareTerminal size={10} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  ctx.onCreateOpencodeInstance(wt.path)
                }}
                class="invisible group-hover/wt:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                title="New AI chat"
              >
                <Sparkles size={10} />
              </button>
              <Show when={!wt.isMain}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onSyncFiles(wt)
                  }}
                  class="invisible group-hover/wt:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                  title="Sync configured files"
                >
                  <RefreshCw size={10} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onRemoveWorktree(wt)
                  }}
                  class="invisible group-hover/wt:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                  title="Remove worktree"
                >
                  <X size={10} />
                </button>
              </Show>
            </div>

            <Show when={isExpanded()}>
              <ScriptsAndTerminals
                items={props.project.workspaces?.[wt.path] ?? []}
                cwd={wt.path}
                indent={24}
              />
            </Show>
          </div>
        )
      }}
    </For>
  )
}
