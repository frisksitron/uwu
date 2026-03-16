import { createEffect, createSignal, For, type JSX, on, onCleanup, onMount } from 'solid-js'
import { produce, unwrap } from 'solid-js/store'
import OpencodeView from './components/OpencodeView'
import ScriptView from './components/ScriptView'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import { initEventListener } from './opencodeStore'
import { clearOutput } from './outputStore'
import { loadProjects, saveProjects, setStore, store } from './store'
import type { OpencodeTab, PersistentTab, Project, Tab, TerminalCacheEntry } from './types'

const terminalSnapshots = new Map<string, { lastOutput: string; title: string }>()

export default function App(): JSX.Element {
  let initialLoadDone = false
  onMount(async () => {
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
    cleanupCloseRequested = window.windowAPI.onCloseRequested(() => {
      saveProjects()
      handleBeforeUnload()
      window.windowAPI.confirmClose()
    })
  })
  onCleanup(() => cleanupCloseRequested?.())

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault()
      const activeTab = store.tabs.find((t) => t.tabId === store.activeTabId)
      if (!activeTab) return
      const scopedTabs = store.tabs.filter((t) => t.cwd === activeTab.cwd)
      if (scopedTabs.length === 0) return
      const currentIndex = scopedTabs.findIndex((t) => t.tabId === store.activeTabId)
      const next = e.shiftKey
        ? (currentIndex - 1 + scopedTabs.length) % scopedTabs.length
        : (currentIndex + 1) % scopedTabs.length
      setStore('activeTabId', scopedTabs[next].tabId)
    }
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault()
      setSidebarCollapsed((c) => !c)
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault()
      if (store.activeTabId) closeTab(store.activeTabId)
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
    clearOutput(tabId)
    const remaining = store.tabs.filter((t) => t.tabId !== tabId)
    setStore('tabs', remaining)
    if (store.activeTabId === tabId) setStore('activeTabId', remaining.at(-1)?.tabId ?? null)
  }

  function setTabStatus(
    tabId: string,
    status: 'idle' | 'running' | 'exited',
    exitCode?: number
  ): void {
    setStore(
      produce((s) => {
        const tab = s.tabs.find((t) => t.tabId === tabId)
        if (tab && (tab.type === 'script' || tab.type === 'persistent')) {
          tab.status = status
          tab.exitCode = exitCode
        }
      })
    )
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
      />
      <UpdateBanner />
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
                    shell={project()?.shellOverride}
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
                  shell={project()?.shellOverride}
                  extraEnv={project()?.envVars}
                  persistentTerminalId={tab.persistentTerminalId}
                  onCacheSnapshot={(snap) => terminalSnapshots.set(tab.persistentTerminalId, snap)}
                />
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
