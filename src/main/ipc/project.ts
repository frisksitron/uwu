import { relative } from 'node:path'
import { type } from 'arktype'
import { dialog, ipcMain } from 'electron'
import Store from 'electron-store'
import { type ProjectEntry, ProjectEntrySchema } from '../../shared/schemas'

interface ProjectSchema {
  projects: ProjectEntry[]
}

const store = new Store<ProjectSchema>({
  name: 'projects',
  defaults: { projects: [] }
})

export function setupProjectIpc(): void {
  ipcMain.handle('project:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('project:select-files', async (_event, defaultPath: string) => {
    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
      .map((p) => relative(defaultPath, p).replace(/\\/g, '/'))
      .filter((r) => !r.startsWith('..'))
  })

  ipcMain.handle('projects:load', async () => {
    const projects = store.get('projects')
    let changed = false

    // Validate each project, skip invalid entries
    const valid: ProjectEntry[] = []
    for (const project of projects) {
      const result = ProjectEntrySchema(project)
      if (result instanceof type.errors) {
        console.warn('[projects] Dropped invalid entry:', project.name, result.summary)
        changed = true
        continue
      }
      valid.push(result)
    }

    if (changed) {
      store.set('projects', valid)
    }
    return valid
  })

  ipcMain.handle('projects:save', (_event, projects: unknown) => {
    if (!Array.isArray(projects)) return
    const validated: ProjectEntry[] = []
    for (const entry of projects) {
      const result = ProjectEntrySchema(entry)
      if (result instanceof type.errors) {
        console.warn('[projects] Skipped invalid entry on save:', result.summary)
        continue
      }
      validated.push(result)
    }
    store.set('projects', validated)
  })
}
