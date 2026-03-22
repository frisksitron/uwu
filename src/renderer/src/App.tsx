import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show
} from 'solid-js'
import { produce, unwrap } from 'solid-js/store'
import DiffView from './components/DiffView'
import OpencodeView from './components/OpencodeView'
import ScriptView from './components/ScriptView'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import { initEventListener } from './opcodeChat'
import { clearOutput } from './outputStore'
import {
  dismissCorrupted,
  loadSettings,
  matchesBinding,
  resetSettings,
  settings,
  settingsCorrupted
} from './settingsStore'
import { loadProjects, saveProjects, setStore, store, visualTabOrder } from './store'
import { closeTab as closeTabRuntime, isOpen, setTabStatus, tabRuntime } from './tabRuntime'
import type { TerminalCacheEntry, WorkspaceTab } from './types'

const IDLE_RESET_DELAY_MS = 5 * 60_000
const terminalSnapshots = new Map<string, { lastOutput: string; title: string }>()

export default function App(): JSX.Element {
  let initialLoadDone = false
  onMount(async () => {
    await loadSettings()
    await loadProjects()
    initialLoadDone = true
  })

  // Auto-save projects whenever they change (debounced)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(
    on(
      () => JSON.stringify(unwrap(store.projects)),
      () => {
        if (!initialLoadDone) return
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => saveProjects(), 300)
      }
    )
  )
  onCleanup(() => clearTimeout(saveTimer))

  let cleanupEvents: (() => void) | undefined
  onMount(() => {
    cleanupEvents = initEventListener()
  })
  onCleanup(() => cleanupEvents?.())

  const saveTerminalCache = async (): Promise<void> => {
    if (terminalSnapshots.size === 0) return
    const cache: Record<string, TerminalCacheEntry> = {}
    for (const [ptId, snap] of terminalSnapshots) {
      if (snap.lastOutput) {
        cache[ptId] = {
          lastOutput: snap.lastOutput,
          title: snap.title,
          savedAt: Date.now()
        }
      }
    }
    if (Object.keys(cache).length > 0) {
      await window.terminalAPI.saveCache(cache)
    }
  }

  const handleBeforeUnload = (): void => {
    saveTerminalCache().catch(() => {})
  }

  onMount(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onCleanup(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  // Graceful close: save state before window closes
  let cleanupCloseRequested: (() => void) | undefined
  onMount(() => {
    cleanupCloseRequested = window.windowAPI.onCloseRequested(async () => {
      await saveProjects()
      await saveTerminalCache().catch(() => {})
      window.windowAPI.confirmClose()
    })
  })
  onCleanup(() => cleanupCloseRequested?.())

  const [showSettings, setShowSettings] = createSignal(false)

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (
      matchesBinding(e, settings.shortcuts.cycleTabForward) ||
      matchesBinding(e, settings.shortcuts.cycleTabBackward)
    ) {
      e.preventDefault()
      const order = visualTabOrder()
      if (order.length === 0 || !store.activeTabId) return
      const currentIndex = order.indexOf(store.activeTabId)
      const next = matchesBinding(e, settings.shortcuts.cycleTabBackward)
        ? (currentIndex - 1 + order.length) % order.length
        : (currentIndex + 1) % order.length
      setStore('activeTabId', order[next])
    }
    if (matchesBinding(e, settings.shortcuts.toggleSidebar)) {
      e.preventDefault()
      setSidebarCollapsed((c) => !c)
    }
    if (matchesBinding(e, settings.shortcuts.closeTab)) {
      e.preventDefault()
      if (store.activeTabId) closeView(store.activeTabId)
    }
    if (matchesBinding(e, settings.shortcuts.openSettings)) {
      e.preventDefault()
      setShowSettings(true)
    }
  }

  onMount(() => window.addEventListener('keydown', handleKeyDown))
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false)
  const [sidebarWidth, setSidebarWidth] = createSignal(240)

  function startResize(e: MouseEvent): void {
    e.preventDefault()
    const onMouseMove = (e: MouseEvent): void => {
      setSidebarWidth(Math.min(Math.max(e.clientX, 150), 500))
    }
    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function handleStatusChange(
    id: string,
    status: 'idle' | 'running' | 'exited',
    exitCode?: number
  ): void {
    const prev = idleTimers.get(id)
    if (prev) {
      clearTimeout(prev)
      idleTimers.delete(id)
    }
    setTabStatus(id, status, exitCode)
    if (status === 'exited') {
      idleTimers.set(
        id,
        setTimeout(() => {
          idleTimers.delete(id)
          setTabStatus(id, 'idle')
        }, IDLE_RESET_DELAY_MS)
      )
    }
  }

  function closeView(id: string): void {
    const timer = idleTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      idleTimers.delete(id)
    }
    clearOutput(id)
    closeTabRuntime(id)
    if (store.activeTabId === id) {
      // Find next open tab
      let nextId: string | null = null
      for (const project of store.projects) {
        for (const items of Object.values(project.workspaces ?? {})) {
          for (const item of items) {
            if (item.id !== id && isOpen(item.id)) nextId = item.id
          }
        }
      }
      setStore('activeTabId', nextId)
    }
  }

  function handleProcessChange(itemId: string, projectId: string, processName: string): void {
    setStore(
      'projects',
      (p) => p.id === projectId,
      produce((project) => {
        for (const items of Object.values(project.workspaces ?? {})) {
          const item = items.find((i) => i.id === itemId)
          if (item?.type === 'terminal' && !item.customLabel && item.label !== processName) {
            item.label = processName
            return
          }
        }
      })
    )
  }

  function handleSessionChange(itemId: string, projectId: string, sessionId: string): void {
    setStore(
      'projects',
      (p) => p.id === projectId,
      produce((project) => {
        for (const items of Object.values(project.workspaces ?? {})) {
          const item = items.find((i) => i.id === itemId)
          if (item?.type === 'opencode') {
            item.sessionId = sessionId
            return
          }
        }
      })
    )
  }

  function handleTitleChange(itemId: string, projectId: string, title: string): void {
    setStore(
      'projects',
      (p) => p.id === projectId,
      produce((project) => {
        for (const items of Object.values(project.workspaces ?? {})) {
          const item = items.find((i) => i.id === itemId)
          if (item?.type === 'opencode' && item.label !== title) {
            item.label = title
            return
          }
        }
      })
    )
  }

  function getItemCommand(item: WorkspaceTab): string {
    if (item.type === 'script') return item.command
    return ''
  }

  /**
   * Renders view for a workspace item. Called once per item by <For>;
   * item type is stable so branching in the function body is fine.
   */
  function renderItemView(item: WorkspaceTab, projectId: string, cwd: string): JSX.Element | null {
    const proj = () => store.projects.find((p) => p.id === projectId)

    if (item.type === 'opencode') {
      return (
        <OpencodeView
          tabId={item.id}
          visible={store.activeTabId === item.id}
          projectPath={cwd}
          sessionId={item.sessionId}
          label={item.label}
          onSessionChange={(sid) => handleSessionChange(item.id, projectId, sid)}
          onTitleChange={(title) => handleTitleChange(item.id, projectId, title)}
        />
      )
    }
    if (item.type === 'script') {
      return (
        <ScriptView
          tabId={item.id}
          visible={store.activeTabId === item.id}
          cwd={cwd}
          command={getItemCommand(item)}
          onStatusChange={(status, exitCode) => handleStatusChange(item.id, status, exitCode)}
          shell={proj()?.shellOverride || settings.terminal.defaultShell || undefined}
          extraEnv={proj()?.envVars}
        />
      )
    }
    if (item.type === 'terminal') {
      return (
        <Terminal
          tabId={item.id}
          visible={store.activeTabId === item.id}
          cwd={cwd}
          onExit={() => closeView(item.id)}
          onProcessChange={(name) => handleProcessChange(item.id, projectId, name)}
          shell={proj()?.shellOverride || settings.terminal.defaultShell || undefined}
          extraEnv={proj()?.envVars}
          persistentTerminalId={item.id}
          onCacheSnapshot={(snap) => terminalSnapshots.set(item.id, snap)}
        />
      )
    }
    return null
  }

  return (
    <div class="flex flex-col w-full h-full">
      <TitleBar
        collapsed={sidebarCollapsed()}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        onOpenSettings={() => setShowSettings(true)}
      />
      <UpdateBanner />
      <Show when={settingsCorrupted()}>
        <div class="flex items-center justify-between px-4 py-2 bg-sidebar border-b border-border text-content text-[13px] shrink-0">
          <span>Settings file is corrupted and could not be loaded.</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1 rounded bg-accent text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
              onClick={() => resetSettings()}
            >
              Reset settings
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded bg-hover text-content text-[11px] font-medium hover:bg-active transition-colors"
              onClick={() => dismissCorrupted()}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>
      <div class="flex flex-1 overflow-hidden">
        <div classList={{ hidden: sidebarCollapsed() }} class="flex">
          <Sidebar
            store={store}
            setStore={setStore}
            onCloseView={closeView}
            width={sidebarWidth()}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: drag resize handle, not a thematic break */}
          <div
            tabIndex={0}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth()}
            aria-valuemin={150}
            aria-valuemax={500}
            class="w-1 flex-shrink-0 bg-border hover:bg-accent cursor-col-resize transition-colors"
            onMouseDown={startResize}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                setSidebarWidth((w) => Math.max(w - 10, 150))
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                setSidebarWidth((w) => Math.min(w + 10, 500))
              }
            }}
          />
        </div>
        {/*
         * Render views directly from store arrays (not a derived memo) so that
         * Solid's <For> tracks items by store proxy identity. This way reordering
         * workspace items via produce().sort() moves DOM nodes instead of
         * recreating components (which would reset terminals/scripts).
         */}
        <div class="flex-1 relative overflow-hidden shadow-[inset_1px_1px_3px_0_rgba(0,0,0,0.04)]">
          <For each={store.projects}>
            {(project) => {
              const cwds = createMemo(() => Object.keys(project.workspaces ?? {}))
              return (
                <For each={cwds()}>
                  {(cwd) => {
                    const diffId = `diff:${project.id}:${cwd}`
                    return (
                      <>
                        <For each={project.workspaces?.[cwd] ?? []}>
                          {(item) => (
                            <Show when={tabRuntime[item.id]?.open}>
                              {renderItemView(item, project.id, cwd)}
                            </Show>
                          )}
                        </For>
                        <Show when={tabRuntime[diffId]?.open}>
                          <DiffView
                            tabId={diffId}
                            visible={store.activeTabId === diffId}
                            cwd={cwd}
                            projectId={project.id}
                          />
                        </Show>
                      </>
                    )
                  }}
                </For>
              )
            }}
          </For>
        </div>
      </div>
      <Show when={showSettings()}>
        <SettingsModal onClose={() => setShowSettings(false)} />
      </Show>
    </div>
  )
}
