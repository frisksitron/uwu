import { createMemo, createRoot } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import type { ProjectEntry } from '../../shared/types'
import { isOpen } from './tabRuntime'
import type { AppState, Project } from './types'

export const [store, setStore] = createStore<AppState>({
  projects: [],
  activeTabId: null
})

export async function loadProjects(): Promise<void> {
  const projects = (await window.persistAPI.load('projects')) as Project[]
  setStore('projects', projects)
}

export async function loadUiState(): Promise<{
  sidebarCollapsed: boolean
  sidebarWidth: number
}> {
  const ui = (await window.persistAPI.load('ui')) as {
    activeTabId?: string | null
    sidebarCollapsed?: boolean
    sidebarWidth?: number
  } | null
  if (!ui) return { sidebarCollapsed: false, sidebarWidth: 240 }

  // Validate activeTabId exists in loaded projects before restoring
  if (ui.activeTabId) {
    let found = false
    for (const project of store.projects) {
      for (const items of Object.values(project.workspaces ?? {})) {
        if (items.some((item) => item.id === ui.activeTabId)) {
          found = true
          break
        }
      }
      if (found) break
    }
    if (found) setStore('activeTabId', ui.activeTabId)
  }

  return {
    sidebarCollapsed: ui.sidebarCollapsed ?? false,
    sidebarWidth: ui.sidebarWidth ?? 240
  }
}

export function saveProjects(): void {
  const projects = structuredClone(unwrap(store.projects)).map(
    ({ isGit, worktrees, ...rest }) => rest
  )
  window.persistAPI.update('projects', projects as ProjectEntry[])
}

/**
 * Derives tab order matching sidebar visual layout for the active tab's cwd.
 * Used by Ctrl+Tab to cycle in sidebar order instead of insertion order.
 * With the unified model, workspace items ARE the order.
 */
export const visualTabOrder = createRoot(() =>
  createMemo((): string[] => {
    if (!store.activeTabId) return []

    // Find which project/cwd the active tab belongs to
    for (const project of store.projects) {
      for (const [cwd, items] of Object.entries(project.workspaces ?? {})) {
        const found = items.find((item) => item.id === store.activeTabId)
        if (!found) continue

        // Return all open items in this workspace, in workspace order
        const ordered: string[] = []
        for (const item of items) {
          if (isOpen(item.id)) ordered.push(item.id)
        }
        // Also include diff views for this cwd
        const diffId = `diff:${project.id}:${cwd}`
        if (isOpen(diffId)) ordered.push(diffId)
        return ordered
      }
      // Check if active tab is a diff view for this project
      for (const [cwd] of Object.entries(project.workspaces ?? {})) {
        const diffId = `diff:${project.id}:${cwd}`
        if (store.activeTabId === diffId) {
          const items = project.workspaces?.[cwd] ?? []
          const ordered: string[] = []
          for (const item of items) {
            if (isOpen(item.id)) ordered.push(item.id)
          }
          ordered.push(diffId)
          return ordered
        }
      }
    }
    return []
  })
)
