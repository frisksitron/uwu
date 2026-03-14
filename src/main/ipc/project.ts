import * as fs from 'node:fs'
import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import Store from 'electron-store'
import { detectProject } from '../detectors'

interface ProjectEntry {
  name: string
  path: string
  scripts: Record<string, string>
  projectType: string
  packageManager?: string
  hiddenScripts?: string[]
}

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
      if (project.packageManager && !project.projectType) {
        const pm = project.packageManager
        project.projectType = pm
        const newScripts: Record<string, string> = {}
        for (const name of Object.keys(project.scripts || {})) {
          newScripts[name] = `${pm} run ${name}`
        }
        project.scripts = newScripts
        delete project.packageManager
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
          project.hiddenScripts = project.hiddenScripts.filter((s) => s in newScripts)
          if (project.hiddenScripts.length === 0) delete project.hiddenScripts
        }

        changed = true
      }
    }

    if (changed) {
      store.set('projects', projects)
    }
    return projects
  })

  ipcMain.handle('projects:save', (_event, projects: ProjectEntry[]) => {
    store.set('projects', projects)
  })
}
