import { CircleDot, Loader2, Plus, Sparkles, SquareTerminal, X } from 'lucide-solid'
import { For, type JSX, Match, Show, Switch } from 'solid-js'
import { useProject } from '../context/ProjectContext'
import type { OpencodeInstance, PersistentTerminal } from '../types'
import ScriptItem from './ScriptItem'

interface ScriptsAndTerminalsProps {
  scripts: Record<string, string>
  customScriptNames?: Set<string>
  cwd: string
  indent: number
  worktreePath?: string
}

export default function ScriptsAndTerminals(props: ScriptsAndTerminalsProps): JSX.Element {
  const ctx = useProject()
  const project = ctx.project

  const customNames = (): Set<string> => props.customScriptNames ?? new Set()

  const visibleDetectedScripts = (): string[] =>
    Object.keys(props.scripts).filter(
      (s) => !customNames().has(s) && !(project().hiddenScripts ?? []).includes(s)
    )

  const visibleCustomScripts = (): string[] =>
    Object.keys(props.scripts).filter(
      (s) => customNames().has(s) && !(project().hiddenScripts ?? []).includes(s)
    )

  const terminalsForCwd = (): PersistentTerminal[] =>
    project().persistentTerminals.filter((pt) => (pt.worktreePath || project().path) === props.cwd)

  const opencodeForCwd = (): OpencodeInstance[] =>
    (project().opencodeInstances ?? []).filter(
      (oc) => (oc.worktreePath || project().path) === props.cwd
    )

  return (
    <>
      {/* Detected scripts */}
      <Show when={visibleDetectedScripts().length > 0}>
        <For each={visibleDetectedScripts()}>
          {(scriptName) => (
            <ScriptItem
              scriptName={scriptName}
              cwd={props.cwd}
              indent={props.indent}
              isActive={ctx.isScriptActive(scriptName, props.cwd)}
              status={ctx.scriptStatus(scriptName, props.cwd)}
              tab={ctx.getScriptTab(scriptName, props.cwd)}
              onOpen={() => ctx.onOpenScript(scriptName, props.cwd)}
              onRun={() => ctx.onRunScript(scriptName, props.cwd)}
            />
          )}
        </For>
      </Show>

      {/* Custom scripts */}
      <Show when={visibleCustomScripts().length > 0}>
        <For each={visibleCustomScripts()}>
          {(scriptName) => (
            <ScriptItem
              scriptName={scriptName}
              cwd={props.cwd}
              indent={props.indent}
              isCustom
              isActive={ctx.isScriptActive(scriptName, props.cwd)}
              status={ctx.scriptStatus(scriptName, props.cwd)}
              tab={ctx.getScriptTab(scriptName, props.cwd)}
              onOpen={() => ctx.onOpenScript(scriptName, props.cwd)}
              onRun={() => ctx.onRunScript(scriptName, props.cwd)}
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
            classList={{ 'bg-active': ctx.isPtActive(pt.id) }}
            onClick={() => ctx.onOpenTerminal(pt)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') ctx.onOpenTerminal(pt)
            }}
          >
            <SquareTerminal size={11} class="flex-shrink-0 mr-[5px] text-icon-terminal" />
            {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click to rename terminal label */}
            <span
              class="flex-1 flex items-center gap-1.5 min-w-0"
              onDblClick={(e) => {
                e.stopPropagation()
                ctx.onStartRename(pt.id, pt.label)
              }}
            >
              <Show
                when={ctx.renamingTerminalId() === pt.id}
                fallback={<span class="truncate">{pt.label}</span>}
              >
                <input
                  autofocus
                  value={ctx.renameValue()}
                  onInput={(e) => ctx.onRenameInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') ctx.onConfirmRename(pt.id)
                    if (e.key === 'Escape') ctx.onCancelRename()
                  }}
                  onBlur={() => ctx.onConfirmRename(pt.id)}
                  class="bg-terminal border border-input text-content py-0 px-1 text-[12px] w-full outline-none min-w-0"
                />
              </Show>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ctx.onRemoveTerminal(pt.id)
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
          const sessionId = () => ctx.getOcSessionId(oc.id)
          const generating = () => {
            const sid = sessionId()
            return sid ? ctx.isOcGenerating(sid) : false
          }
          const needsAttention = () => {
            const sid = sessionId()
            return sid ? ctx.ocNeedsAttention(sid) : false
          }

          return (
            <div
              role="menuitem"
              tabIndex={0}
              class="group/ai flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
              style={{ 'padding-left': `${props.indent}px` }}
              classList={{ 'bg-active': ctx.isOcInstanceActive(oc.id) }}
              onClick={() => ctx.onOpenOpencodeInstance(oc)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') ctx.onOpenOpencodeInstance(oc)
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
                  ctx.onRemoveOpencodeInstance(oc.id)
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
          onClick={() => ctx.onCreateTerminal(props.worktreePath)}
          class="flex items-center gap-1 py-0.5 px-1.5 text-icon-terminal text-[11px] cursor-pointer hover:bg-icon-terminal/10 bg-transparent border border-icon-terminal/30 rounded transition-colors"
        >
          <Plus size={9} />
          terminal
        </button>
        <button
          type="button"
          onClick={() => ctx.onCreateOpencodeInstance(props.worktreePath)}
          class="flex items-center gap-1 py-0.5 px-1.5 text-icon-ai text-[11px] cursor-pointer hover:bg-icon-ai/10 bg-transparent border border-icon-ai/30 rounded transition-colors"
        >
          <Plus size={9} />
          ai chat
        </button>
      </div>
    </>
  )
}
