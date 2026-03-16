import { createEffect, createSignal, For, type JSX, on, onCleanup, onMount, Show } from 'solid-js'
import { produce, unwrap } from 'solid-js/store'
import OpencodeView from './components/OpencodeView'
import ScriptView from './components/ScriptView'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import { initEventListener } from './opencodeStore'
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
import type { OpencodeTab, PersistentTab, Project, Tab, TerminalCacheEntry } from './types'

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

  const handleBeforeUnload = (): void => {
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
      // Use sendBeacon-style: invoke is async but we fire-and-forget
      window.terminalAPI.saveCache(cache).catch(() => {})
    }
  }

  onMount(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onCleanup(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  // Graceful close: save state before window closes
  let cleanupCloseRequested: (() => void) | undefined
  onMount(() => {
    cleanupCloseRequested = window.windowAPI.onCloseRequested(async () => {
      await saveProjects()
      handleBeforeUnload()
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
      if (store.activeTabId) closeTab(store.activeTabId)
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

  function addTab(tab: Tab, activate = true): void {
    setStore('tabs', (t) => [...t, tab])
    if (activate) setStore('activeTabId', tab.tabId)
  }

  function closeTab(tabId: string): void {
    const timer = idleTimers.get(tabId)
    if (timer) {
      clearTimeout(timer)
      idleTimers.delete(tabId)
    }
    clearOutput(tabId)
    const remaining = store.tabs.filter((t) => t.tabId !== tabId)
    setStore('tabs', remaining)
    if (store.activeTabId === tabId) setStore('activeTabId', remaining.at(-1)?.tabId ?? null)
  }

  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function setTabStatus(
    tabId: string,
    status: 'idle' | 'running' | 'exited',
    exitCode?: number
  ): void {
    const prev = idleTimers.get(tabId)
    if (prev) {
      clearTimeout(prev)
      idleTimers.delete(tabId)
    }
    setStore(
      produce((s) => {
        const tab = s.tabs.find((t) => t.tabId === tabId)
        if (tab && (tab.type === 'script' || tab.type === 'persistent')) {
          tab.status = status
          tab.exitCode = exitCode
        }
      })
    )
    if (status === 'exited') {
      idleTimers.set(
        tabId,
        setTimeout(() => {
          idleTimers.delete(tabId)
          setTabStatus(tabId, 'idle')
        }, 5 * 60_000)
      )
    }
  }

  function handleProcessChange(tab: PersistentTab, processName: string): void {
    const project = store.projects.find((p) => p.id === tab.projectId)
    if (!project) return
    const pt = project.persistentTerminals.find((t) => t.id === tab.persistentTerminalId)
    if (!pt || pt.customLabel) return
    // Skip no-op updates (this fires on every OSC title change)
    if (processName === pt.label) return
    setStore('tabs', (t) => t.tabId === tab.tabId, 'label', processName)
    setStore(
      'projects',
      (p) => p.id === tab.projectId,
      'persistentTerminals',
      (pts) =>
        pts.map((p) => (p.id === tab.persistentTerminalId ? { ...p, label: processName } : p))
    )
  }

  function handleSessionChange(tab: OpencodeTab, sessionId: string): void {
    setStore(
      produce((s) => {
        const t = s.tabs.find((t) => t.tabId === tab.tabId)
        if (t && t.type === 'opencode') t.sessionId = sessionId
      })
    )
    setStore(
      'projects',
      (p) => p.id === tab.projectId,
      'opencodeInstances',
      (instances) =>
        (instances ?? []).map((i) => (i.id === tab.opencodeInstanceId ? { ...i, sessionId } : i))
    )
  }

  function handleTitleChange(tab: OpencodeTab, title: string): void {
    setStore('tabs', (t) => t.tabId === tab.tabId, 'label', title)
    const project = store.projects.find((p) => p.id === tab.projectId)
    const instance = project?.opencodeInstances?.find((i) => i.id === tab.opencodeInstanceId)
    if (instance && title !== instance.label) {
      setStore(
        'projects',
        (p) => p.id === tab.projectId,
        'opencodeInstances',
        (instances) =>
          (instances ?? []).map((i) =>
            i.id === tab.opencodeInstanceId ? { ...i, label: title } : i
          )
      )
    }
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
        <div class="flex items-center justify-between px-4 py-2 bg-sidebar border-b border-border text-content text-sm shrink-0">
          <span>Settings file is corrupted and could not be loaded.</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
              onClick={() => resetSettings()}
            >
              Reset settings
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded bg-hover text-content text-xs font-medium hover:bg-active transition-colors"
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
            onAddTab={addTab}
            onCloseTab={closeTab}
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
          />
        </div>
        <div class="flex-1 relative overflow-hidden">
          <For each={store.tabs}>
            {(tab) => {
              const project = (): Project | undefined =>
                store.projects.find((p) => p.id === tab.projectId)
              if (tab.type === 'opencode') {
                return (
                  <OpencodeView
                    tabId={tab.tabId}
                    visible={store.activeTabId === tab.tabId}
                    projectPath={tab.cwd}
                    sessionId={tab.sessionId}
                    onSessionChange={(sessionId) => handleSessionChange(tab, sessionId)}
                    onTitleChange={(title) => handleTitleChange(tab, title)}
                  />
                )
              }
              if (tab.type === 'script') {
                return (
                  <ScriptView
                    tabId={tab.tabId}
                    visible={store.activeTabId === tab.tabId}
                    cwd={tab.cwd}
                    command={tab.initialCommand}
                    onStatusChange={(status, exitCode) => setTabStatus(tab.tabId, status, exitCode)}
                    shell={project()?.shellOverride || settings.terminal.defaultShell || undefined}
                    extraEnv={project()?.envVars}
                  />
                )
              }
              return (
                <Terminal
                  tabId={tab.tabId}
                  visible={store.activeTabId === tab.tabId}
                  cwd={tab.cwd}
                  onExit={(code) => setTabStatus(tab.tabId, 'exited', code)}
                  onProcessChange={(name) => handleProcessChange(tab, name)}
                  shell={project()?.shellOverride || settings.terminal.defaultShell || undefined}
                  extraEnv={project()?.envVars}
                  persistentTerminalId={tab.persistentTerminalId}
                  onCacheSnapshot={(snap) => terminalSnapshots.set(tab.persistentTerminalId, snap)}
                />
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
