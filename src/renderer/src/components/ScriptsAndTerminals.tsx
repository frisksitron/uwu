import { ChevronDown, Plus, Sparkles, SquareTerminal, X } from 'lucide-solid'
import { createSignal, For, type JSX, Show } from 'solid-js'
import type { OpencodeInstance, PersistentTerminal, Project, Tab } from '../types'
import ScriptItem from './ScriptItem'
import SidebarIconButton from './SidebarIconButton'

export interface ScriptsAndTerminalsProps {
  project: Project
  scripts: Record<string, string>
  cwd: string
  indent: number
  worktreePath?: string
  renamingTerminalId: string | null
  renameValue: string
  onOpenScript: (scriptName: string, cwd: string) => void
  onRunScript: (scriptName: string, cwd: string) => void
  onCreateTerminal: (worktreePath?: string) => void
  onOpenTerminal: (project: Project, pt: PersistentTerminal) => void
  onRemoveTerminal: (project: Project, ptId: string) => void
  onStartRename: (ptId: string, label: string) => void
  onConfirmRename: (project: Project, ptId: string) => void
  onRenameInput: (value: string) => void
  onCancelRename: () => void
  isScriptActive: (scriptName: string, cwd?: string) => boolean
  scriptStatus: (scriptName: string, cwd?: string) => 'idle' | 'running' | 'success' | 'error'
  getScriptTab: (scriptName: string, cwd?: string) => Tab | undefined
  isPtActive: (ptId: string) => boolean
  onCreateOpencodeInstance: (worktreePath?: string) => void
  onOpenOpencodeInstance: (project: Project, instance: OpencodeInstance) => void
  onRemoveOpencodeInstance: (project: Project, instanceId: string) => void
  isOcInstanceActive: (instanceId: string) => boolean
}

export default function ScriptsAndTerminals(props: ScriptsAndTerminalsProps): JSX.Element {
  const [dropdownOpen, setDropdownOpen] = createSignal(false)

  const visibleScripts = (): string[] =>
    Object.keys(props.scripts).filter((s) => !(props.project.hiddenScripts ?? []).includes(s))

  const terminalsForCwd = (): PersistentTerminal[] =>
    props.project.persistentTerminals.filter(
      (pt) => (pt.worktreePath || props.project.path) === props.cwd
    )

  const opencodeForCwd = (): OpencodeInstance[] =>
    (props.project.opencodeInstances ?? []).filter(
      (oc) => (oc.worktreePath || props.project.path) === props.cwd
    )

  return (
    <>
      {/* Scripts */}
      <Show when={visibleScripts().length > 0}>
        <For each={visibleScripts()}>
          {(scriptName) => (
            <ScriptItem
              project={props.project}
              scriptName={scriptName}
              cwd={props.cwd}
              indent={props.indent}
              isActive={props.isScriptActive(scriptName, props.cwd)}
              status={props.scriptStatus(scriptName, props.cwd)}
              tab={props.getScriptTab(scriptName, props.cwd)}
              onOpen={() => props.onOpenScript(scriptName, props.cwd)}
              onRun={() => props.onRunScript(scriptName, props.cwd)}
            />
          )}
        </For>
      </Show>

      {/* Terminal placeholder — lazily created */}
      <Show when={terminalsForCwd().length === 0}>
        <div
          role="menuitem"
          tabIndex={0}
          class="flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
          style={{ 'padding-left': `${props.indent}px` }}
          onClick={() => props.onCreateTerminal(props.worktreePath)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') props.onCreateTerminal(props.worktreePath)
          }}
        >
          <SquareTerminal size={11} class="flex-shrink-0 mr-[5px] text-content/70" />
          <span class="truncate">Terminal</span>
        </div>
      </Show>

      <For each={terminalsForCwd()}>
        {(pt) => (
          <div
            class="group/pt flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
            style={{ 'padding-left': `${props.indent}px` }}
            classList={{ 'bg-active': props.isPtActive(pt.id) }}
          >
            <SquareTerminal size={11} class="flex-shrink-0 mr-[5px] text-content/70" />
            <span
              role="menuitem"
              tabIndex={0}
              class="flex-1 flex items-center gap-1.5 min-w-0"
              onClick={() => props.onOpenTerminal(props.project, pt)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') props.onOpenTerminal(props.project, pt)
              }}
              onDblClick={(e) => {
                e.stopPropagation()
                props.onStartRename(pt.id, pt.label)
              }}
            >
              <Show
                when={props.renamingTerminalId === pt.id}
                fallback={<span class="truncate">{pt.label}</span>}
              >
                <input
                  autofocus
                  value={props.renameValue}
                  onInput={(e) => props.onRenameInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') props.onConfirmRename(props.project, pt.id)
                    if (e.key === 'Escape') props.onCancelRename()
                  }}
                  onBlur={() => props.onConfirmRename(props.project, pt.id)}
                  class="bg-terminal border border-input text-content py-0 px-1 text-[12px] w-full outline-none min-w-0"
                />
              </Show>
            </span>
            <span class="invisible group-hover/pt:visible">
              <SidebarIconButton
                icon={<X size={11} />}
                title="Remove terminal"
                onClick={() => props.onRemoveTerminal(props.project, pt.id)}
              />
            </span>
          </div>
        )}
      </For>

      {/* AI chat instances */}
      <For each={opencodeForCwd()}>
        {(oc) => (
          <div
            class="group/ai flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
            style={{ 'padding-left': `${props.indent}px` }}
            classList={{ 'bg-active': props.isOcInstanceActive(oc.id) }}
          >
            <Sparkles size={11} class="flex-shrink-0 mr-[5px] text-content/70" />
            <span
              role="menuitem"
              tabIndex={0}
              class="flex-1 min-w-0 truncate"
              onClick={() => props.onOpenOpencodeInstance(props.project, oc)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  props.onOpenOpencodeInstance(props.project, oc)
              }}
            >
              {oc.label}
            </span>
            <span class="invisible group-hover/ai:visible">
              <SidebarIconButton
                icon={<X size={11} />}
                title="Remove AI chat"
                onClick={() => props.onRemoveOpencodeInstance(props.project, oc.id)}
              />
            </span>
          </div>
        )}
      </For>

      {/* Split button: new terminal + dropdown */}
      <div class="flex items-center mb-1.5" style={{ 'padding-left': `${props.indent}px` }}>
        <div
          role="menuitem"
          tabIndex={0}
          onClick={() => props.onCreateTerminal(props.worktreePath)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') props.onCreateTerminal(props.worktreePath)
          }}
          class="flex items-center gap-1 py-[3px] text-content/70 text-[11px] cursor-pointer hover:text-accent"
        >
          <Plus size={10} />
          new terminal
        </div>
        <div class="relative ml-0.5">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            class="bg-transparent border-none text-content/70 hover:text-accent cursor-pointer p-0.5 rounded transition-colors flex items-center"
            title="More options"
          >
            <ChevronDown size={10} />
          </button>
          <Show when={dropdownOpen()}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: click-outside backdrop */}
            <div
              class="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDropdownOpen(false)
              }}
            />
            <div class="absolute left-0 top-full mt-0.5 z-50 bg-sidebar border border-border rounded shadow-lg py-1 min-w-[120px]">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false)
                  props.onCreateOpencodeInstance(props.worktreePath)
                }}
                class="w-full flex items-center gap-1.5 px-2.5 py-1 bg-transparent border-none text-content text-[11px] cursor-pointer hover:bg-hover text-left"
              >
                <Sparkles size={10} class="text-content/70" />
                new opencode
              </button>
            </div>
          </Show>
        </div>
      </div>
    </>
  )
}
