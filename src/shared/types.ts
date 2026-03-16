export type {
  AppSettings,
  KeyBinding,
  KeyboardShortcuts,
  OpencodeInstance,
  PersistentTerminal,
  ProjectEntry,
  TerminalCacheEntry,
  TerminalSettings,
  WindowSettings
} from './schemas'

import type { AppSettings, OpencodeInstance, PersistentTerminal } from './schemas'

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

export const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    fontSize: 14,
    fontFamily:
      process.platform === 'darwin'
        ? 'Menlo'
        : process.platform === 'win32'
          ? 'Consolas'
          : 'DejaVu Sans Mono',
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
