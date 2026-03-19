import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { join, relative } from 'node:path'
import { type } from 'arktype'
import { app, dialog, ipcMain } from 'electron'
import Store from 'electron-store'
import { type ProjectEntry, ProjectEntrySchema } from '../../shared/schemas'
import type { CustomScriptTab, ScriptTab, WorkspaceTab } from '../../shared/types'
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

/**
 * Migrate old project format (persistentTerminals, opencodeInstances, customScripts, hiddenScripts)
 * into the unified workspaces model.
 */
// biome-ignore lint/suspicious/noExplicitAny: migration from old schema
function migrateToWorkspaces(project: any): boolean {
  // Already migrated
  if (project.workspaces) return false

  const workspaces: Record<string, WorkspaceTab[]> = {}

  function getOrCreateWorkspace(cwd: string): WorkspaceTab[] {
    if (!workspaces[cwd]) workspaces[cwd] = []
    return workspaces[cwd]
  }

  const projectPath: string = project.path
  const scripts: Record<string, string> = project.scripts || {}
  const customScripts: Record<string, string> = project.customScripts || {}
  const hiddenScripts: string[] = project.hiddenScripts || []

  // Build script tabs for the main workspace
  const mainItems = getOrCreateWorkspace(projectPath)
  for (const name of Object.keys(scripts)) {
    const tab: ScriptTab = {
      id: randomUUID(),
      type: 'script',
      name,
      hidden: hiddenScripts.includes(name) || undefined
    }
    mainItems.push(tab)
  }

  // Custom scripts
  for (const [name, command] of Object.entries(customScripts)) {
    if (name in scripts) continue // Skip if already a detected script
    const tab: CustomScriptTab = {
      id: randomUUID(),
      type: 'custom-script',
      name,
      command
    }
    mainItems.push(tab)
  }

  // Persistent terminals
  if (Array.isArray(project.persistentTerminals)) {
    for (const pt of project.persistentTerminals) {
      const cwd = pt.worktreePath || projectPath
      const items = getOrCreateWorkspace(cwd)
      items.push({
        id: pt.id,
        type: 'terminal' as const,
        label: pt.label,
        customLabel: pt.customLabel || undefined
      })
    }
  }

  // Opencode instances
  if (Array.isArray(project.opencodeInstances)) {
    for (const oc of project.opencodeInstances) {
      const cwd = oc.worktreePath || projectPath
      const items = getOrCreateWorkspace(cwd)
      items.push({
        id: oc.id,
        type: 'opencode' as const,
        label: oc.label,
        sessionId: oc.sessionId || undefined
      })
    }
  }

  project.workspaces = workspaces

  // Clean up old fields
  delete project.persistentTerminals
  delete project.opencodeInstances
  delete project.customScripts
  delete project.hiddenScripts

  return true
}

/**
 * Reconcile detected scripts with workspace items.
 * - New scripts → append ScriptTab at end
 * - Stale scripts → remove from workspace
 * - Existing items keep their position and hidden state
 * - Custom scripts in workspace are preserved
 */
function reconcileScripts(
  items: WorkspaceTab[],
  detectedScripts: Record<string, string>
): WorkspaceTab[] {
  const detectedNames = new Set(Object.keys(detectedScripts))
  const existingScriptNames = new Set(items.filter((i) => i.type === 'script').map((i) => i.name))

  // Remove stale script tabs (not in detected and not custom-script)
  const filtered = items.filter((item) => {
    if (item.type === 'script') return detectedNames.has(item.name)
    return true
  })

  // Append new detected scripts
  for (const name of detectedNames) {
    if (!existingScriptNames.has(name)) {
      filtered.push({
        id: randomUUID(),
        type: 'script',
        name
      })
    }
  }

  return filtered
}

export function setupProjectIpc(): void {
  migrateFromBareArray()

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
    let changed = false

    for (const project of projects) {
      // biome-ignore lint/suspicious/noExplicitAny: migration from old schema
      const legacy = project as any

      // Migrate old packageManager → projectType
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

      // Migrate to unified workspaces model
      if (migrateToWorkspaces(legacy)) {
        changed = true
      }
    }

    // Re-detect scripts from project files and reconcile with workspace items
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

        // Reconcile script items in all workspaces
        // biome-ignore lint/suspicious/noExplicitAny: accessing workspaces on ProjectEntry
        const workspaces: Record<string, any[]> = (project as any).workspaces ?? {}
        for (const cwd of Object.keys(workspaces)) {
          // For the main path workspace, use detected scripts
          // For worktree workspaces, scripts come from worktree detection (handled at runtime)
          if (cwd === project.path) {
            workspaces[cwd] = reconcileScripts(workspaces[cwd], newScripts)
          }
        }
        // biome-ignore lint/suspicious/noExplicitAny: setting workspaces on ProjectEntry
        ;(project as any).workspaces = workspaces

        changed = true
      }
    }

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
