import { Heart, HeartCrack, Loader2, Play, RotateCcw, Scroll, Square } from 'lucide-solid'
import { createSignal, type JSX, Match, Show, Switch } from 'solid-js'
import { getLastLine } from '../outputStore'
import { runScript, stopScript } from '../scriptActions'
import type { Project, Tab } from '../types'
import SidebarIconButton from './SidebarIconButton'

interface ScriptItemProps {
  project: Project
  scriptName: string
  cwd: string
  indent: number
  isActive: boolean
  status: 'idle' | 'running' | 'success' | 'error'
  tab?: Tab
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
      class="flex items-center py-[3px] pr-2 cursor-pointer text-content text-[13px] hover:bg-hover"
      style={{ 'padding-left': `${props.indent}px` }}
      classList={{ 'bg-active': props.isActive }}
    >
      <Scroll size={11} class="flex-shrink-0 mr-[5px] text-content/70" />
      <span class="truncate flex-shrink-0">{props.scriptName}</span>
      <Show when={props.status === 'running'}>
        <Show when={props.tab}>
          <span class="text-[10px] text-muted opacity-70 truncate ml-1 font-mono flex-1 min-w-0">
            {props.tab && getLastLine(props.tab.tabId)}
          </span>
        </Show>
      </Show>
      <Show when={props.status !== 'running'}>
        <span class="flex-1" />
      </Show>

      <Switch>
        <Match when={props.status === 'idle'}>
          <SidebarIconButton
            icon={<Play size={11} />}
            title="Run"
            onClick={handleRun}
            visible={hovered()}
          />
        </Match>
        <Match when={props.status === 'running'}>
          <Show
            when={hovered()}
            fallback={
              <span class="flex-shrink-0 p-1 flex items-center text-status-running">
                <Loader2 size={11} class="animate-spin" />
              </span>
            }
          >
            <SidebarIconButton icon={<Square size={11} />} title="Stop" onClick={handleStop} />
          </Show>
        </Match>
        <Match when={props.status === 'success'}>
          <Show
            when={hovered()}
            fallback={
              <span class="flex-shrink-0 p-1 flex items-center text-status-success">
                <Heart size={11} />
              </span>
            }
          >
            <SidebarIconButton icon={<RotateCcw size={11} />} title="Rerun" onClick={handleRun} />
          </Show>
        </Match>
        <Match when={props.status === 'error'}>
          <Show
            when={hovered()}
            fallback={
              <span class="flex-shrink-0 p-1 flex items-center text-status-error">
                <HeartCrack size={11} />
              </span>
            }
          >
            <SidebarIconButton icon={<RotateCcw size={11} />} title="Rerun" onClick={handleRun} />
          </Show>
        </Match>
      </Switch>
    </div>
  )
}
