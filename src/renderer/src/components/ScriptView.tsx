import { Loader2, Play, RotateCcw, Square } from 'lucide-solid'
import { createSignal, For, type JSX, onCleanup, Show } from 'solid-js'
import { registerScriptActions, unregisterScriptActions } from '../scriptActions'
import Terminal from './Terminal'

interface ScriptViewProps {
  tabId: string
  visible: boolean
  cwd: string
  command: string
  onStatusChange: (status: 'idle' | 'running' | 'exited', exitCode?: number) => void
  shell?: string
  extraEnv?: Record<string, string>
}

export default function ScriptView(props: ScriptViewProps): JSX.Element {
  const [phase, setPhase] = createSignal<'idle' | 'running' | 'finished' | 'stopped'>('idle')
  const [runId, setRunId] = createSignal(0)
  let killFn: (() => void) | null = null
  let killed = false

  // eslint-disable-next-line solid/reactivity -- tabId is stable, never changes
  const { tabId } = props
  registerScriptActions(tabId, { run: () => run(), stop: () => stop() })
  onCleanup(() => unregisterScriptActions(tabId))

  function run(): void {
    killed = false
    killFn = null
    setRunId((r) => r + 1)
    setPhase('running')
    props.onStatusChange('running')
  }

  function stop(): void {
    killed = true
    killFn?.()
    killFn = null
    setPhase('stopped')
    props.onStatusChange('idle')
  }

  function handleExit(code: number): void {
    if (killed) {
      killed = false
      return
    }
    setPhase('finished')
    props.onStatusChange('exited', code)
  }

  return (
    <div
      class="w-full h-full absolute top-0 left-0 flex flex-col"
      classList={{
        invisible: !props.visible,
        'pointer-events-none': !props.visible
      }}
    >
      {/* Topbar */}
      <div class="flex items-center gap-2 px-3 h-9 border-b border-border bg-sidebar flex-shrink-0">
        <span class="flex-1 flex items-center gap-1.5 text-[12px] text-content truncate font-medium min-w-0">
          <Show when={phase() === 'running'}>
            <Loader2 size={11} class="animate-spin flex-shrink-0 text-status-running" />
          </Show>
          <span class="truncate">{props.command}</span>
        </span>
        <Show when={phase() === 'running'}>
          <button
            type="button"
            onClick={stop}
            class="bg-transparent hover:bg-hover border-none cursor-pointer px-1.5 h-7 rounded transition-colors flex items-center text-muted hover:text-content"
            title="Stop"
          >
            <Square size={14} />
            <span class="ml-1 text-[12px]">Stop</span>
          </button>
        </Show>
        <Show when={phase() !== 'running'}>
          <button
            type="button"
            onClick={run}
            class="bg-transparent hover:bg-hover border-none cursor-pointer px-1.5 h-7 rounded transition-colors flex items-center text-muted hover:text-content"
            title={phase() === 'idle' ? 'Run' : 'Rerun'}
          >
            {phase() === 'idle' ? <Play size={14} /> : <RotateCcw size={14} />}
            <span class="ml-1 text-[12px]">{phase() === 'idle' ? 'Run' : 'Rerun'}</span>
          </button>
        </Show>
      </div>

      {/* Terminal output — mounted on first run, rekeyed on rerun */}
      <div class="flex-1 relative overflow-hidden">
        <For each={runId() > 0 ? [runId()] : []}>
          {() => (
            <Terminal
              tabId={props.tabId}
              visible={props.visible}
              cwd={props.cwd}
              initialCommand={props.command}
              readOnly={phase() !== 'running'}
              onExit={handleExit}
              onKillRef={(fn) => {
                killFn = fn
              }}
              shell={props.shell}
              extraEnv={props.extraEnv}
            />
          )}
        </For>
      </div>
    </div>
  )
}
