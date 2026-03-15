import { createSignal, For, type JSX, onCleanup, onMount } from 'solid-js'
import OpencodeView from './components/OpencodeView'
import ScriptView from './components/ScriptView'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import { initEventListener } from './opencodeStore'
import { loadProjects, saveProjects, setStore, store } from './store'
import type { Project, Tab, TerminalCacheEntry } from './types'

const terminalSnapshots = new Map<string, { lastOutput: string; title: string }>()

export default function App(): JSX.Element {
  onMount(() => loadProjects())

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

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault()
      const tabs = store.tabs
      if (tabs.length === 0) return
      const currentIndex = tabs.findIndex((t) => t.tabId === store.activeTabId)
      const next = e.shiftKey
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : (currentIndex + 1) % tabs.length
      setStore('activeTabId', tabs[next].tabId)
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault()
      if (store.activeTabId) closeTab(store.activeTabId)
    }
  }

  onMount(() => window.addEventListener('keydown', handleKeyDown))
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

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
    const remaining = store.tabs.filter((t) => t.tabId !== tabId)
    setStore('tabs', remaining)
    if (store.activeTabId === tabId) setStore('activeTabId', remaining.at(-1)?.tabId ?? null)
  }

  function setTabStatus(
    tabId: string,
    status: 'idle' | 'running' | 'exited',
    exitCode?: number
  ): void {
    setStore('tabs', (t) => t.tabId === tabId, 'status', status)
    setStore('tabs', (t) => t.tabId === tabId, 'exitCode', exitCode)
  }

  function handleProcessChange(tab: Tab, processName: string): void {
    if (!tab.persistentTerminalId) return
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
    saveProjects()
  }

  function handleSessionChange(tab: Tab, sessionId: string): void {
    setStore('tabs', (t) => t.tabId === tab.tabId, 'sessionId', sessionId)
    if (tab.opencodeInstanceId) {
      setStore(
        'projects',
        (p) => p.id === tab.projectId,
        'opencodeInstances',
        (instances) =>
          (instances ?? []).map((i) => (i.id === tab.opencodeInstanceId ? { ...i, sessionId } : i))
      )
      saveProjects()
    }
  }

  function handleTitleChange(tab: Tab, title: string): void {
    setStore('tabs', (t) => t.tabId === tab.tabId, 'label', title)
    if (tab.opencodeInstanceId) {
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
        saveProjects()
      }
    }
  }

  return (
    <div class="flex flex-col w-full h-full">
      <TitleBar />
      <UpdateBanner />
      <div class="flex flex-1 overflow-hidden">
        <Sidebar
          store={store}
          setStore={setStore}
          onAddTab={addTab}
          onCloseTab={closeTab}
          onSaveProjects={saveProjects}
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
        <div class="flex-1 relative overflow-hidden">
          <For each={store.tabs}>
            {(tab) => {
              const project = (): Project | undefined =>
                store.projects.find((p) => p.id === tab.projectId)
              return tab.type === 'opencode' ? (
                <OpencodeView
                  tabId={tab.tabId}
                  visible={store.activeTabId === tab.tabId}
                  projectPath={tab.cwd}
                  sessionId={tab.sessionId as string}
                  onSessionChange={(sessionId) => handleSessionChange(tab, sessionId)}
                  onTitleChange={(title) => handleTitleChange(tab, title)}
                />
              ) : tab.type === 'script' ? (
                <ScriptView
                  tabId={tab.tabId}
                  visible={store.activeTabId === tab.tabId}
                  cwd={tab.cwd}
                  command={tab.initialCommand as string}
                  onStatusChange={(status, exitCode) => setTabStatus(tab.tabId, status, exitCode)}
                  shell={project()?.shellOverride}
                  extraEnv={project()?.envVars}
                />
              ) : (
                <Terminal
                  tabId={tab.tabId}
                  visible={store.activeTabId === tab.tabId}
                  cwd={tab.cwd}
                  onExit={(code) => setTabStatus(tab.tabId, 'exited', code)}
                  onProcessChange={(name) => handleProcessChange(tab, name)}
                  shell={project()?.shellOverride}
                  extraEnv={project()?.envVars}
                  persistentTerminalId={tab.persistentTerminalId}
                  onCacheSnapshot={
                    tab.persistentTerminalId
                      ? (snap) => terminalSnapshots.set(tab.persistentTerminalId as string, snap)
                      : undefined
                  }
                />
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
