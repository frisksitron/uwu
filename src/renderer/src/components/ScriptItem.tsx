import { Circle, CircleDot, Play, RotateCcw, Square, X } from 'lucide-solid'
import { type JSX, Match, Show, Switch } from 'solid-js'
import { getLastLine } from '../outputStore'
import { runScript, stopScript } from '../scriptActions'
import { isOpen } from '../tabRuntime'
import type { ScriptTab } from '../types'

interface ScriptItemProps {
  item: ScriptTab
  cwd: string
  indent: number
  isActive: boolean
  status: 'idle' | 'running' | 'success' | 'error'
  onOpen: () => void
  onRun: () => void
  onRemove?: () => void
}

export default function ScriptItem(props: ScriptItemProps): JSX.Element {
  const tabId = () => props.item.id
  const name = () => props.item.name
  const command = () => props.item.command

  function handleRun(): void {
    if (isOpen(tabId())) {
      runScript(tabId())
    } else {
      props.onRun()
    }
  }

  function handleStop(): void {
    if (isOpen(tabId())) stopScript(tabId())
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: complex container with nested interactive children
    <div
      role="button"
      tabIndex={0}
      onClick={() => props.onOpen()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') props.onOpen()
      }}
      class="group/script relative cursor-pointer text-content text-[13px] hover:bg-hover"
      classList={{
        'bg-active': props.isActive,
        'sidebar-shimmer shimmer-pink': props.status === 'running'
      }}
    >
      <div class="flex items-center py-1 pr-2" style={{ 'padding-left': `${props.indent}px` }}>
        <div class="flex-shrink-0 w-[11px] mr-2 flex items-center justify-center">
          <Switch>
            <Match when={props.status === 'running'}>
              <CircleDot size={8} class="text-status-running" />
            </Match>
            <Match when={props.status === 'success'}>
              <Circle size={8} class="text-success" />
            </Match>
            <Match when={props.status === 'error'}>
              <Circle size={8} class="text-error" />
            </Match>
            <Match when={true}>
              <Circle size={8} class="text-muted" />
            </Match>
          </Switch>
        </div>
        <div class="flex flex-col flex-1 min-w-0">
          {/* Line 1: name + action buttons */}
          <div class="flex items-center h-[18px]">
            <span class="truncate flex-1 min-w-0">{name()}</span>
            <div class="flex items-center gap-0.5">
              <div class="invisible group-hover/script:visible flex items-center gap-0.5">
                <Show when={props.onRemove}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onRemove?.()
                    }}
                    class="flex items-center px-1 py-0.5 text-[11px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors"
                    title="Remove script"
                  >
                    <X size={9} />
                  </button>
                </Show>
              </div>
              <Switch>
                <Match when={props.status === 'idle'}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRun()
                    }}
                    class="invisible group-hover/script:visible flex items-center gap-0.5 px-1 py-0.5 text-[11px] bg-transparent hover:bg-border border-none text-success hover:text-success cursor-pointer rounded transition-colors"
                  >
                    <Play size={9} />
                    Run
                  </button>
                </Match>
                <Match when={props.status === 'running'}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStop()
                    }}
                    class="invisible group-hover/script:visible flex items-center gap-0.5 px-1 py-0.5 text-[11px] bg-transparent hover:bg-border border-none text-error hover:text-error cursor-pointer rounded transition-colors"
                  >
                    <Square size={9} />
                    Stop
                  </button>
                </Match>
                <Match when={props.status === 'success' || props.status === 'error'}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRun()
                    }}
                    class="invisible group-hover/script:visible flex items-center gap-0.5 px-1 py-0.5 text-[11px] bg-transparent hover:bg-border border-none text-success hover:text-success cursor-pointer rounded transition-colors"
                  >
                    <RotateCcw size={9} />
                    Rerun
                  </button>
                </Match>
              </Switch>
            </div>
          </div>
          {/* Line 2: status/command text */}
          <div class="h-[14px] text-[11px] truncate">
            <Switch>
              <Match when={props.status === 'running'}>
                <span class="text-status-running font-mono">
                  {getLastLine(tabId()) || 'Running'}
                </span>
              </Match>
              <Match when={props.status === 'success'}>
                <span class="text-success">Completed</span>
              </Match>
              <Match when={props.status === 'error'}>
                <span class="text-error">Failed</span>
              </Match>
              <Match when={props.status === 'idle'}>
                <span class="text-muted">{command()}</span>
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </div>
  )
}
