import { createMemo, createRoot } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import type { ProjectEntry } from '../../shared/types'
import { isOpen } from './tabRuntime'
import type { AppState } from './types'

export const [store, setStore] = createStore<AppState>({
  projects: [],
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
          if (item.type === 'script' && item.hidden) continue
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
            if (item.type === 'script' && item.hidden) continue
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
