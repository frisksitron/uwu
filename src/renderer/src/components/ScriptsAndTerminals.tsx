import { CircleDot, Loader2, Plus, Sparkles, SquareTerminal, X } from 'lucide-solid'
import { For, type JSX, Match, Show, Switch } from 'solid-js'
import type { OpencodeInstance, PersistentTerminal, Project, Tab } from '../types'
import ScriptItem from './ScriptItem'

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
  getOcSessionId: (instanceId: string) => string | undefined
  isOcGenerating: (sessionId: string) => boolean
  ocNeedsAttention: (sessionId: string) => boolean
}

export default function ScriptsAndTerminals(props: ScriptsAndTerminalsProps): JSX.Element {
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

      <For each={terminalsForCwd()}>
        {(pt) => (
          <div
            role="menuitem"
            tabIndex={0}
            class="group/pt flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
            style={{ 'padding-left': `${props.indent}px` }}
            classList={{ 'bg-active': props.isPtActive(pt.id) }}
            onClick={() => props.onOpenTerminal(props.project, pt)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') props.onOpenTerminal(props.project, pt)
            }}
          >
            <SquareTerminal size={11} class="flex-shrink-0 mr-[5px] text-icon-terminal" />
            {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click to rename terminal label */}
            <span
              class="flex-1 flex items-center gap-1.5 min-w-0"
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                props.onRemoveTerminal(props.project, pt.id)
              }}
              class="invisible group-hover/pt:visible flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors self-center"
              title="Remove terminal"
            >
              <X size={9} />
              Close
            </button>
          </div>
        )}
      </For>

      {/* AI chat instances */}
      <For each={opencodeForCwd()}>
        {(oc) => {
          const sessionId = () => props.getOcSessionId(oc.id)
          const generating = () => {
            const sid = sessionId()
            return sid ? props.isOcGenerating(sid) : false
          }
          const needsAttention = () => {
            const sid = sessionId()
            return sid ? props.ocNeedsAttention(sid) : false
          }

          return (
            <div
              role="menuitem"
              tabIndex={0}
              class="group/ai flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
              style={{ 'padding-left': `${props.indent}px` }}
              classList={{ 'bg-active': props.isOcInstanceActive(oc.id) }}
              onClick={() => props.onOpenOpencodeInstance(props.project, oc)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  props.onOpenOpencodeInstance(props.project, oc)
              }}
            >
              <Switch>
                <Match when={needsAttention()}>
                  <CircleDot
                    size={11}
                    class="flex-shrink-0 mr-[5px] text-accent animate-pulse-attention"
                  />
                </Match>
                <Match when={generating()}>
                  <Loader2
                    size={11}
                    class="flex-shrink-0 mr-[5px] text-status-running animate-spin"
                  />
                </Match>
                <Match when={!needsAttention() && !generating()}>
                  <Sparkles size={11} class="flex-shrink-0 mr-[5px] text-icon-ai" />
                </Match>
              </Switch>
              <span class="flex-1 min-w-0 truncate">{oc.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onRemoveOpencodeInstance(props.project, oc.id)
                }}
                class="invisible group-hover/ai:visible flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors self-center"
                title="Remove AI chat"
              >
                <X size={9} />
                Close
              </button>
            </div>
          )
        }}
      </For>

      {/* New terminal / new AI chat buttons */}
      <div
        class="flex flex-wrap items-center gap-1.5 mt-1 mb-1.5 pr-2"
        style={{ 'padding-left': `${props.indent}px` }}
      >
        <button
          type="button"
          onClick={() => props.onCreateTerminal(props.worktreePath)}
          class="flex items-center gap-1 py-0.5 px-1.5 text-icon-terminal text-[11px] cursor-pointer hover:bg-icon-terminal/10 bg-transparent border border-icon-terminal/30 rounded transition-colors"
        >
          <Plus size={9} />
          terminal
        </button>
        <button
          type="button"
          onClick={() => props.onCreateOpencodeInstance(props.worktreePath)}
          class="flex items-center gap-1 py-0.5 px-1.5 text-icon-ai text-[11px] cursor-pointer hover:bg-icon-ai/10 bg-transparent border border-icon-ai/30 rounded transition-colors"
        >
          <Plus size={9} />
          ai chat
        </button>
      </div>
    </>
  )
}
