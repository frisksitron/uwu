import { createMemo } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import type { ProjectEntry } from '../../shared/types'
import type { AppState } from './types'

export const [store, setStore] = createStore<AppState>({
  projects: [],
  tabs: [],
  activeTabId: null
})

export async function loadProjects(): Promise<void> {
  const projects = await window.projectAPI.loadProjects()
  setStore('projects', projects)
}

export async function saveProjects(): Promise<void> {
  const projects = structuredClone(unwrap(store.projects)).map(
    ({ isGit, worktrees, ...rest }) => rest
  )
  await window.projectAPI.saveProjects(projects as ProjectEntry[])
}

/**
 * Derives tab order matching sidebar visual layout for the active tab's cwd.
 * Used by Ctrl+Tab to cycle in sidebar order instead of insertion order.
 */
export const visualTabOrder = createMemo((): string[] => {
  const activeTab = store.tabs.find((t) => t.tabId === store.activeTabId)
  if (!activeTab) return store.tabs.map((t) => t.tabId)

  const project = store.projects.find((p) => p.id === activeTab.projectId)
  if (!project) return []

  const cwd = activeTab.cwd
  const cwdTabs = store.tabs.filter((t) => t.projectId === project.id && t.cwd === cwd)
  const ordered: string[] = []

  // Scripts for this cwd: from worktree or project-level
  const wt = project.worktrees?.find((w) => w.path === cwd)
  const scripts = wt?.scripts ?? { ...project.scripts, ...(project.customScripts ?? {}) }
  const customNames = new Set(Object.keys(project.customScripts ?? {}))
  const hidden = project.hiddenScripts ?? []

  // 1. Detected scripts (non-custom, non-hidden)
  for (const name of Object.keys(scripts)) {
    if (customNames.has(name) || hidden.includes(name)) continue
    const tab = cwdTabs.find((t) => t.type === 'script' && t.initialCommand === scripts[name])
    if (tab) ordered.push(tab.tabId)
  }
  // 2. Custom scripts (non-hidden)
  for (const name of Object.keys(scripts)) {
    if (!customNames.has(name) || hidden.includes(name)) continue
    const tab = cwdTabs.find((t) => t.type === 'script' && t.initialCommand === scripts[name])
    if (tab) ordered.push(tab.tabId)
  }
  // 3. Persistent terminals
  for (const pt of project.persistentTerminals) {
    if ((pt.worktreePath || project.path) !== cwd) continue
    const tab = cwdTabs.find((t) => t.type === 'persistent' && t.persistentTerminalId === pt.id)
    if (tab) ordered.push(tab.tabId)
  }
  // 4. Opencode instances
  for (const oc of project.opencodeInstances ?? []) {
    if ((oc.worktreePath || project.path) !== cwd) continue
    const tab = cwdTabs.find((t) => t.type === 'opencode' && t.opencodeInstanceId === oc.id)
    if (tab) ordered.push(tab.tabId)
  }

  return ordered
})
