import { type } from 'arktype'
import { type BrowserWindow, ipcMain } from 'electron'
import Store from 'electron-store'
import {
  AppSettingsSchema,
  type ProjectEntry,
  ProjectEntrySchema,
  type TerminalCacheEntry,
  TerminalCacheSchema,
  UiStateSchema
} from '../shared/schemas'
import { type AppSettings, DEFAULT_SETTINGS, DEFAULT_UI_STATE, type UiState } from '../shared/types'

// --- Deep merge for settings upgrades ---

// biome-ignore lint/suspicious/noExplicitAny: recursive merge needs any
function deepMerge(defaults: any, saved: any): any {
  if (!saved || typeof saved !== 'object' || typeof defaults !== 'object') return defaults
  const result = { ...defaults }
  for (const key of Object.keys(defaults)) {
    const def = defaults[key]
    const val = saved[key]
    if (val === undefined) continue
    if (def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object') {
      result[key] = deepMerge(def, val)
    } else {
      result[key] = val
    }
  }
  return result
}

const PLATFORM_DEFAULT_FONT =
  process.platform === 'darwin'
    ? 'Menlo'
    : process.platform === 'win32'
      ? 'Consolas'
      : 'DejaVu Sans Mono'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// --- Section types ---

type Section = 'projects' | 'settings' | 'ui' | 'terminalCache'

interface PendingWrite {
  data: unknown
  timer: ReturnType<typeof setTimeout>
}

const DEBOUNCE: Record<Section, number> = {
  projects: 300,
  settings: 500,
  ui: 300,
  terminalCache: 5000
}

// --- Persistence Service ---

export class PersistenceService {
  // Stores use the same keys as existing files for backward compatibility
  private projectsStore = new Store<{ projects: ProjectEntry[] }>({
    name: 'projects',
    defaults: { projects: [] }
  })

  private settingsStore = new Store<{ settings: AppSettings }>({
    name: 'settings',
    defaults: { settings: DEFAULT_SETTINGS }
  })

  private uiStore = new Store<{ ui: UiState }>({
    name: 'ui',
    defaults: { ui: DEFAULT_UI_STATE }
  })

  // Terminal cache uses root-level keys (no wrapper), matching existing behavior
  private cacheStore = new Store({
    name: 'terminal-cache',
    defaults: {}
  })

  private pending = new Map<Section, PendingWrite>()
  private boundsTimer: ReturnType<typeof setTimeout> | undefined
  private boundsWindow: BrowserWindow | undefined

  // --- Load ---

  loadProjects(): ProjectEntry[] {
    const projects = this.projectsStore.get('projects')
    const valid: ProjectEntry[] = []
    let changed = false
    for (const project of projects) {
      const result = ProjectEntrySchema(project)
      if (result instanceof type.errors) {
        console.warn('[persist] Dropped invalid project:', result.summary)
        changed = true
        continue
      }
      valid.push(result)
    }
    if (changed) this.projectsStore.set('projects', valid)
    return valid
  }

  loadSettings(): { data: AppSettings; corrupted: boolean } {
    const saved = this.settingsStore.get('settings', {} as AppSettings)
    const merged = deepMerge(DEFAULT_SETTINGS, saved)
    const result = AppSettingsSchema(merged)
    if (result instanceof type.errors) {
      const defaults = structuredClone(DEFAULT_SETTINGS)
      if (!defaults.terminal.fontFamily) defaults.terminal.fontFamily = PLATFORM_DEFAULT_FONT
      return { data: defaults, corrupted: true }
    }
    if (!result.terminal.fontFamily) result.terminal.fontFamily = PLATFORM_DEFAULT_FONT
    return { data: result, corrupted: false }
  }

  loadUi(): Required<UiState> {
    const raw = this.uiStore.get('ui', DEFAULT_UI_STATE)
    const result = UiStateSchema(raw)
    if (result instanceof type.errors) return { ...DEFAULT_UI_STATE }
    return { ...DEFAULT_UI_STATE, ...result }
  }

  loadTerminalCache(): Record<string, TerminalCacheEntry> {
    const raw = TerminalCacheSchema(this.cacheStore.store)
    if (raw instanceof type.errors) {
      this.cacheStore.store = {}
      return {}
    }
    const now = Date.now()
    let changed = false
    for (const key of Object.keys(raw)) {
      if (now - raw[key].savedAt > SEVEN_DAYS_MS) {
        delete raw[key]
        changed = true
      }
    }
    if (changed) this.cacheStore.store = raw
    return raw
  }

  // --- Unified load dispatcher ---

  load(section: Section): unknown {
    switch (section) {
      case 'projects':
        return this.loadProjects()
      case 'settings':
        return this.loadSettings()
      case 'ui':
        return this.loadUi()
      case 'terminalCache':
        return this.loadTerminalCache()
    }
  }

  // --- Write ---

  private writeProjects(data: unknown): void {
    if (!Array.isArray(data)) return
    const validated: ProjectEntry[] = []
    for (const entry of data) {
      const result = ProjectEntrySchema(entry)
      if (result instanceof type.errors) {
        console.warn('[persist] Skipped invalid project on save:', result.summary)
        continue
      }
      validated.push(result)
    }
    this.projectsStore.set('projects', validated)
  }

  private writeSettings(data: unknown): void {
    const result = AppSettingsSchema(data)
    if (result instanceof type.errors) return
    this.settingsStore.set('settings', result)
  }

  private writeUi(data: unknown): void {
    const result = UiStateSchema(data)
    if (result instanceof type.errors) return
    this.uiStore.set('ui', { ...DEFAULT_UI_STATE, ...result })
  }

  private writeTerminalCache(data: unknown): void {
    const result = TerminalCacheSchema(data)
    if (result instanceof type.errors) return
    this.cacheStore.store = result
  }

  private writeSection(section: Section, data: unknown): void {
    switch (section) {
      case 'projects':
        this.writeProjects(data)
        break
      case 'settings':
        this.writeSettings(data)
        break
      case 'ui':
        this.writeUi(data)
        break
      case 'terminalCache':
        this.writeTerminalCache(data)
        break
    }
  }

  // --- Debounced update ---

  update(section: Section, data: unknown): void {
    const existing = this.pending.get(section)
    if (existing) clearTimeout(existing.timer)

    const debounce = DEBOUNCE[section]
    if (debounce === 0) {
      this.writeSection(section, data)
      return
    }

    const timer = setTimeout(() => {
      this.pending.delete(section)
      this.writeSection(section, data)
    }, debounce)

    this.pending.set(section, { data, timer })
  }

  // --- Flush ---

  flush(): void {
    for (const [section, { data, timer }] of this.pending) {
      clearTimeout(timer)
      this.writeSection(section, data)
    }
    this.pending.clear()
    this.flushBounds()
  }

  private flushBounds(): void {
    if (!this.boundsTimer || !this.boundsWindow) return
    clearTimeout(this.boundsTimer)
    this.boundsTimer = undefined
    this.saveBoundsNow()
  }

  private saveBoundsNow(): void {
    const win = this.boundsWindow
    if (!win || win.isDestroyed()) return
    const { data: settings } = this.loadSettings()
    if (!settings.window.rememberBounds) return
    settings.window.isMaximized = win.isMaximized()
    if (!win.isMaximized()) {
      settings.window.bounds = win.getNormalBounds()
    }
    this.writeSettings(settings)
  }

  // --- IPC ---

  setupIpc(): void {
    ipcMain.handle('persist:load', (_event, section: Section) => this.load(section))
    ipcMain.on('persist:update', (_event, section: Section, data: unknown) =>
      this.update(section, data)
    )
    ipcMain.handle('persist:flush', () => this.flush())
  }

  // --- Window bounds auto-save ---

  setupWindowBounds(mainWindow: BrowserWindow): void {
    this.boundsWindow = mainWindow
    const debouncedSave = (): void => {
      clearTimeout(this.boundsTimer)
      this.boundsTimer = setTimeout(() => {
        this.boundsTimer = undefined
        this.saveBoundsNow()
      }, 1500)
    }
    mainWindow.on('resize', debouncedSave)
    mainWindow.on('move', debouncedSave)
  }
}
