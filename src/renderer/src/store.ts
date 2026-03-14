import { createStore, unwrap } from 'solid-js/store'
import type { AppState, Project } from './types'

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
  await window.projectAPI.saveProjects(structuredClone(unwrap(store.projects)) as Project[])
}
