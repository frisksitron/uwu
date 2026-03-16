export interface PersistentTerminal {
  id: string
  label: string
  worktreePath?: string
  customLabel?: boolean
}

export interface OpencodeInstance {
  id: string
  sessionId?: string
  label: string
  worktreePath?: string
}

// Runtime only — returned from main process, not persisted
export interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
  scripts: Record<string, string>
}

export interface Project {
  id: string
  name: string
  path: string
  scripts: Record<string, string>
  projectType: string
  persistentTerminals: PersistentTerminal[]
  collapsed: boolean
  hiddenScripts?: string[]
  customScripts?: Record<string, string>
  shellOverride?: string
  envVars?: Record<string, string>
  syncFiles?: string[]
  expandedWorktrees?: Record<string, boolean>
  opencodeInstances?: OpencodeInstance[]
  // Runtime-only (not persisted)
  isGit?: boolean
  worktrees?: WorktreeInfo[]
}

export interface TerminalCacheEntry {
  lastOutput: string
  title: string
  savedAt: number
}

// Discriminated union for tabs
interface TabBase {
  tabId: string
  label: string
  cwd: string
  projectId: string
}

export interface ScriptTab extends TabBase {
  type: 'script'
  initialCommand: string
  status?: 'idle' | 'running' | 'exited'
  exitCode?: number
}

export interface PersistentTab extends TabBase {
  type: 'persistent'
  persistentTerminalId: string
  status?: 'idle' | 'running' | 'exited'
  exitCode?: number
}

export interface OpencodeTab extends TabBase {
  type: 'opencode'
  opencodeInstanceId: string
  sessionId?: string
}

export type Tab = ScriptTab | PersistentTab | OpencodeTab

export interface AppState {
  projects: Project[]
  tabs: Tab[]
  activeTabId: string | null
}

export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  cursorBlink: boolean
  defaultShell: string
}

export interface WindowSettings {
  rememberBounds: boolean
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface KeyBinding {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface KeyboardShortcuts {
  cycleTabForward: KeyBinding
  cycleTabBackward: KeyBinding
  toggleSidebar: KeyBinding
  closeTab: KeyBinding
  openSettings: KeyBinding
}

export interface AppSettings {
  terminal: TerminalSettings
  window: WindowSettings
  shortcuts: KeyboardShortcuts
}

export const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    fontSize: 14,
    fontFamily: '"MonaspiceKr Nerd Font Mono", Menlo, Consolas, monospace',
    cursorBlink: true,
    defaultShell: ''
  },
  window: {
    rememberBounds: true
  },
  shortcuts: {
    cycleTabForward: { key: 'Tab', ctrlKey: true, shiftKey: false, altKey: false },
    cycleTabBackward: { key: 'Tab', ctrlKey: true, shiftKey: true, altKey: false },
    toggleSidebar: { key: 'b', ctrlKey: true, shiftKey: false, altKey: false },
    closeTab: { key: 'w', ctrlKey: true, shiftKey: false, altKey: false },
    openSettings: { key: ',', ctrlKey: true, shiftKey: false, altKey: false }
  }
}
