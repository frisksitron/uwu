import { Heart, HeartCrack, Loader2, Play, RotateCcw, Scroll, Square } from 'lucide-solid'
import { createSignal, type JSX, Match, Show, Switch } from 'solid-js'
import { getLastLine } from '../outputStore'
import { runScript, stopScript } from '../scriptActions'
import type { ScriptTab } from '../types'

interface ScriptItemProps {
  scriptName: string
  cwd: string
  indent: number
  isActive: boolean
  isCustom?: boolean
  status: 'idle' | 'running' | 'success' | 'error'
  tab?: ScriptTab
  onOpen: () => void
  onRun: () => void
}

export default function ScriptItem(props: ScriptItemProps): JSX.Element {
  const [hovered, setHovered] = createSignal(false)

  function handleRun(): void {
    if (props.tab) {
      runScript(props.tab.tabId)
    } else {
      props.onRun()
    }
  }

  function handleStop(): void {
    if (props.tab) stopScript(props.tab.tabId)
  }

  return (
    <div
      role="menuitem"
      tabIndex={0}
      onClick={() => props.onOpen()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') props.onOpen()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      class="flex items-baseline py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
      style={{ 'padding-left': `${props.indent}px` }}
      classList={{ 'bg-active': props.isActive }}
    >
      <Switch>
        <Match when={props.status === 'running'}>
          <Loader2
            size={11}
            class="flex-shrink-0 mr-[5px] text-status-running animate-spin self-center"
          />
        </Match>
        <Match when={props.status === 'success'}>
          <Heart size={11} class="flex-shrink-0 mr-[5px] text-status-success self-center" />
        </Match>
        <Match when={props.status === 'error'}>
          <HeartCrack size={11} class="flex-shrink-0 mr-[5px] text-status-error self-center" />
        </Match>
        <Match when={props.status === 'idle'}>
          <Scroll
            size={11}
            class="flex-shrink-0 mr-[5px] self-center"
            classList={{
              'text-icon-custom': props.isCustom,
              'text-icon-script': !props.isCustom
            }}
          />
        </Match>
      </Switch>
      <span class="truncate flex-shrink-0">{props.scriptName}</span>
      <Show when={props.status === 'running' && props.tab}>
        <span class="text-[10px] text-muted opacity-70 truncate ml-1 font-mono flex-1 min-w-0">
          {props.tab && getLastLine(props.tab.tabId)}
        </span>
      </Show>
      <Show when={props.status !== 'running'}>
        <span class="flex-1" />
      </Show>

      <Switch>
        <Match when={props.status === 'idle'}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRun()
            }}
            class="flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors self-center"
            classList={{ invisible: !hovered() }}
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
            class="flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors self-center"
            classList={{ invisible: !hovered() }}
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
            class="flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer rounded transition-colors self-center"
            classList={{ invisible: !hovered() }}
          >
            <RotateCcw size={9} />
            Rerun
          </button>
        </Match>
      </Switch>
    </div>
  )
}
