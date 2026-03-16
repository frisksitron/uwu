import { Sparkles, SquareTerminal, X } from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
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
              command={props.scripts[scriptName]}
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
              command={props.scripts[scriptName]}
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

      {/* Persistent terminals */}
      <For each={terminalsForCwd()}>
        {(pt) => (
          <div
            role="menuitem"
            tabIndex={0}
            class="group/pt relative cursor-pointer text-content text-[13px] hover:bg-hover"
            classList={{ 'bg-active': ctx.isPtActive(pt.id) }}
            onClick={() => ctx.onOpenTerminal(pt)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') ctx.onOpenTerminal(pt)
            }}
          >
            <div
              class="flex items-center py-1 pr-2"
              style={{ 'padding-left': `${props.indent}px` }}
            >
              <SquareTerminal size={11} class="flex-shrink-0 mr-2 text-icon-terminal" />
              <div class="flex flex-col flex-1 min-w-0">
                {/* Line 1: label/rename + close */}
                <div class="flex items-center h-[18px]">
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
                    class="invisible group-hover/pt:visible flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors"
                    title="Remove terminal"
                  >
                    <X size={9} />
                    Close
                  </button>
                </div>
                {/* Line 2: subtitle */}
                <div class="h-[14px] text-[10px] text-muted truncate">Terminal</div>
              </div>
            </div>
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
                'bg-active': ctx.isOcInstanceActive(oc.id),
                'sidebar-pulse-attention': needsAttention(),
                'sidebar-shimmer shimmer-ai': generating() && !needsAttention()
              }}
              onClick={() => ctx.onOpenOpencodeInstance(oc)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') ctx.onOpenOpencodeInstance(oc)
              }}
            >
              <div
                class="flex items-center py-1 pr-2"
                style={{ 'padding-left': `${props.indent}px` }}
              >
                <Sparkles size={11} class="flex-shrink-0 mr-2 text-icon-ai" />
                <div class="flex flex-col flex-1 min-w-0">
                  {/* Line 1: label + close */}
                  <div class="flex items-center h-[18px]">
                    <span class="flex-1 min-w-0 truncate">{oc.label}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        ctx.onRemoveOpencodeInstance(oc.id)
                      }}
                      class="invisible group-hover/ai:visible flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors"
                      title="Remove AI chat"
                    >
                      <X size={9} />
                      Close
                    </button>
                  </div>
                  {/* Line 2: activity text */}
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
        }}
      </For>
    </>
  )
}
