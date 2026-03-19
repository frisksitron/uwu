import { Sparkles, SquareTerminal, X } from 'lucide-solid'
import { createSignal, type JSX, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { useProject } from '../context/ProjectContext'

import type { DiffShortStat, WorkspaceTab } from '../types'
import DiffItem from './DiffItem'
import ScriptItem from './ScriptItem'
import DraggableList from './sidebar/DraggableList'

interface ScriptsAndTerminalsProps {
  items: WorkspaceTab[]
  cwd: string
  indent: number
}

export default function ScriptsAndTerminals(props: ScriptsAndTerminalsProps): JSX.Element {
  const ctx = useProject()
  const project = ctx.project

  const [diffStat, setDiffStat] = createSignal<DiffShortStat | null>(null)

  if (project().isGit) {
    const fetchStat = (): void => {
      window.diffAPI.shortstat(props.cwd).then(setDiffStat)
    }
    onMount(() => {
      fetchStat()
      const id = setInterval(fetchStat, 5000)
      onCleanup(() => clearInterval(id))
    })
  }

  const visibleItems = (): WorkspaceTab[] =>
    props.items.filter((item) => !(item.type === 'script' && item.hidden))

  return (
    <>
      {/* Diff changes — floating above draggable list */}
      <Show when={diffStat()}>
        {(stat) => <DiffItem stat={stat()} cwd={props.cwd} indent={props.indent} />}
      </Show>

      {/* Flat ordered list of workspace items */}
      <DraggableList
        items={visibleItems()}
        keyFn={(item) => item.id}
        onReorder={(newItems) => {
          // Re-insert hidden items at their original positions
          const hiddenItems = props.items.filter((item) => item.type === 'script' && item.hidden)
          // Merge: put hidden items back, preserving relative order
          const result: WorkspaceTab[] = [...newItems]
          for (const hidden of hiddenItems) {
            const oldIndex = props.items.indexOf(hidden)
            const insertAt = Math.min(oldIndex, result.length)
            result.splice(insertAt, 0, hidden)
          }
          ctx.onReorderItems(props.cwd, result)
        }}
      >
        {(item) => (
          <Switch>
            <Match when={item.type === 'script' && item}>
              {(scriptItem) => (
                <ScriptItem
                  item={scriptItem() as WorkspaceTab & { type: 'script' }}
                  cwd={props.cwd}
                  indent={props.indent}
                  isActive={ctx.isItemActive(scriptItem().id)}
                  status={ctx.getItemStatus(scriptItem().id)}
                  onOpen={() => ctx.onOpenItem(scriptItem(), props.cwd)}
                  onRun={() => ctx.onRunScript(scriptItem(), props.cwd)}
                  onHide={() => ctx.onHideScript(scriptItem().id, props.cwd)}
                />
              )}
            </Match>
            <Match when={item.type === 'custom-script' && item}>
              {(csItem) => (
                <ScriptItem
                  item={csItem() as WorkspaceTab & { type: 'custom-script' }}
                  cwd={props.cwd}
                  indent={props.indent}
                  isActive={ctx.isItemActive(csItem().id)}
                  status={ctx.getItemStatus(csItem().id)}
                  onOpen={() => ctx.onOpenItem(csItem(), props.cwd)}
                  onRun={() => ctx.onRunScript(csItem(), props.cwd)}
                  onRemove={() => ctx.onRemoveItem(csItem().id, props.cwd)}
                />
              )}
            </Match>
            <Match when={item.type === 'terminal' && item}>
              {(termItem) => {
                const ti = () => termItem() as WorkspaceTab & { type: 'terminal' }
                return <TerminalSidebarItem item={ti()} cwd={props.cwd} indent={props.indent} />
              }}
            </Match>
            <Match when={item.type === 'opencode' && item}>
              {(ocItem) => {
                const oi = () => ocItem() as WorkspaceTab & { type: 'opencode' }
                return <OpencodeSidebarItem item={oi()} cwd={props.cwd} indent={props.indent} />
              }}
            </Match>
          </Switch>
        )}
      </DraggableList>
    </>
  )
}

// --- Terminal sidebar item ---

function TerminalSidebarItem(props: {
  item: WorkspaceTab & { type: 'terminal' }
  cwd: string
  indent: number
}): JSX.Element {
  const ctx = useProject()

  return (
    <div
      role="menuitem"
      tabIndex={0}
      class="group/pt relative cursor-pointer text-content text-[13px] hover:bg-hover"
      classList={{ 'bg-active': ctx.isItemActive(props.item.id) }}
      onClick={() => ctx.onOpenItem(props.item, props.cwd)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') ctx.onOpenItem(props.item, props.cwd)
      }}
    >
      <div class="flex items-center py-1 pr-2" style={{ 'padding-left': `${props.indent}px` }}>
        <SquareTerminal size={11} class="flex-shrink-0 mr-2 text-icon-terminal" />
        <div class="flex flex-col flex-1 min-w-0">
          <div class="flex items-center h-[18px]">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click to rename */}
            <span
              class="flex-1 flex items-center gap-1.5 min-w-0"
              onDblClick={(e) => {
                e.stopPropagation()
                ctx.onStartRename(props.item.id, props.item.label)
              }}
            >
              <Show
                when={ctx.renamingTerminalId() === props.item.id}
                fallback={<span class="truncate">{props.item.label}</span>}
              >
                <input
                  autofocus
                  value={ctx.renameValue()}
                  onInput={(e) => ctx.onRenameInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') ctx.onConfirmRename(props.item.id, props.cwd)
                    if (e.key === 'Escape') ctx.onCancelRename()
                  }}
                  onBlur={() => ctx.onConfirmRename(props.item.id, props.cwd)}
                  class="bg-terminal border border-input text-content py-0 px-1 text-[12px] w-full outline-none min-w-0"
                />
              </Show>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ctx.onRemoveItem(props.item.id, props.cwd)
              }}
              class="invisible group-hover/pt:visible flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors"
              title="Remove terminal"
            >
              <X size={9} />
              Close
            </button>
          </div>
          <div class="h-[14px] text-[10px] text-muted truncate">Terminal</div>
        </div>
      </div>
    </div>
  )
}

// --- Opencode sidebar item ---

function OpencodeSidebarItem(props: {
  item: WorkspaceTab & { type: 'opencode' }
  cwd: string
  indent: number
}): JSX.Element {
  const ctx = useProject()

  const sessionId = () => ctx.getOcSessionId(props.item.id)
  const generating = () => {
    const sid = sessionId()
    return sid ? ctx.isOcGenerating(sid) : false
  }
  const needsAttention = () => {
    const sid = sessionId()
    return sid ? ctx.ocNeedsAttention(sid) : false
  }
  const activity = () => {
    const sid = sessionId()
    return sid ? ctx.ocActivity(sid) : 'Ready'
  }

  return (
    <div
      role="menuitem"
      tabIndex={0}
      class="group/ai relative cursor-pointer text-content text-[13px] hover:bg-hover"
      classList={{
        'bg-active': ctx.isItemActive(props.item.id),
        'sidebar-pulse-attention': needsAttention(),
        'sidebar-shimmer shimmer-ai': generating() && !needsAttention()
      }}
      onClick={() => ctx.onOpenItem(props.item, props.cwd)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') ctx.onOpenItem(props.item, props.cwd)
      }}
    >
      <div class="flex items-center py-1 pr-2" style={{ 'padding-left': `${props.indent}px` }}>
        <Sparkles size={11} class="flex-shrink-0 mr-2 text-icon-ai" />
        <div class="flex flex-col flex-1 min-w-0">
          <div class="flex items-center h-[18px]">
            <span class="flex-1 min-w-0 truncate">{props.item.label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ctx.onRemoveItem(props.item.id, props.cwd)
              }}
              class="invisible group-hover/ai:visible flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors"
              title="Remove AI chat"
            >
              <X size={9} />
              Close
            </button>
          </div>
          <div class="h-[14px] text-[10px] truncate">
            <span
              classList={{
                'text-muted': !generating() && !needsAttention(),
                'text-icon-ai': generating() && !needsAttention(),
                'text-accent': needsAttention()
              }}
            >
              {activity()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
