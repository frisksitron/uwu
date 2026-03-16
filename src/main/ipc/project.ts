import * as fs from 'node:fs'
import { join } from 'node:path'
import { type } from 'arktype'
import { app, dialog, ipcMain } from 'electron'
import Store from 'electron-store'
import { type ProjectEntry, ProjectEntrySchema } from '../../shared/schemas'
import { detectProject } from '../detectors'

interface ProjectSchema {
  projects: ProjectEntry[]
}

const store = new Store<ProjectSchema>({
  name: 'projects',
  defaults: { projects: [] }
})

// One-time migration: old format stored a bare array, electron-store expects { projects: [...] }
function migrateFromBareArray(): void {
  const filePath = join(app.getPath('userData'), 'projects.json')
  if (!fs.existsSync(filePath)) return
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (Array.isArray(raw)) {
      store.set('projects', raw)
    }
  } catch {
    /* ignore */
  }
}

export function setupProjectIpc(): void {
  migrateFromBareArray()

  ipcMain.handle('project:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('project:read-metadata', async (_event, folderPath: string) => {
    const result = await detectProject(folderPath)
    if (!result) return null
    return {
      name: result.name,
      scripts: result.scripts,
      projectType: result.projectType
    }
  })

  ipcMain.handle('projects:load', async () => {
    const projects = store.get('projects')
    // Migrate old projects: packageManager → projectType, script values → full commands
    let changed = false
    for (const project of projects) {
      // biome-ignore lint/suspicious/noExplicitAny: migration from old schema
      const legacy = project as any
      if (legacy.packageManager && !project.projectType) {
        const pm = legacy.packageManager
        project.projectType = pm
        const newScripts: Record<string, string> = {}
        for (const name of Object.keys(project.scripts || {})) {
          newScripts[name] = `${pm} run ${name}`
        }
        project.scripts = newScripts
        delete legacy.packageManager
        changed = true
      }
    }

    // Re-detect scripts from project files and sync with stored scripts
    for (const project of projects) {
      if (!fs.existsSync(project.path)) continue
      const detected = await detectProject(project.path)
      if (!detected) continue

      const oldScripts = project.scripts || {}
      const newScripts = detected.scripts

      // Check if scripts changed
      const oldKeys = Object.keys(oldScripts).sort()
      const newKeys = Object.keys(newScripts).sort()
      const scriptsMatch =
        oldKeys.length === newKeys.length &&
        oldKeys.every((k, i) => k === newKeys[i] && oldScripts[k] === newScripts[k])

      if (!scriptsMatch) {
        project.scripts = newScripts
        project.projectType = detected.projectType

        // Clean up hiddenScripts that no longer exist
        if (project.hiddenScripts) {
          project.hiddenScripts = project.hiddenScripts.filter(
            (s) => s in newScripts || s in (project.customScripts ?? {})
          )
          if (project.hiddenScripts.length === 0) delete project.hiddenScripts
        }

        changed = true
      }
    }

    // Validate each project, skip invalid entries
    const valid: ProjectEntry[] = []
    for (const project of projects) {
      const result = ProjectEntrySchema(project)
      if (result instanceof type.errors) {
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
      if (result instanceof type.errors) return
      validated.push(result)
    }
    store.set('projects', validated)
  })
}
