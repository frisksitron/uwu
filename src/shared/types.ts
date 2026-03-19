export type {
  AppSettings,
  KeyBinding,
  KeyboardShortcuts,
  ProjectEntry,
  TerminalCacheEntry,
  TerminalSettings,
  WindowSettings
} from './schemas'

import type { AppSettings } from './schemas'

// --- Workspace tab types ---

interface WorkspaceTabBase {
  id: string
}

export interface ScriptTab extends WorkspaceTabBase {
  type: 'script'
  name: string
  hidden?: boolean
}

export interface CustomScriptTab extends WorkspaceTabBase {
  type: 'custom-script'
  name: string
  command: string
}

export interface TerminalTab extends WorkspaceTabBase {
  type: 'terminal'
  label: string
  customLabel?: boolean
}

export interface OpencodeTab extends WorkspaceTabBase {
  type: 'opencode'
  label: string
  sessionId?: string
}

export type WorkspaceTab = ScriptTab | CustomScriptTab | TerminalTab | OpencodeTab

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
  collapsed: boolean
  workspaces: Record<string, WorkspaceTab[]>
  shellOverride?: string
  envVars?: Record<string, string>
  syncFiles?: string[]
  expandedWorktrees?: Record<string, boolean>
  // Runtime-only (not persisted)
  isGit?: boolean
  worktrees?: WorktreeInfo[]
}

// Diff data types
export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface DiffRow {
  type: 'context' | 'add' | 'remove' | 'modify'
  oldLineNo: number | null
  newLineNo: number | null
  oldContent: string | null
  newContent: string | null
}

export interface DiffHunk {
  rows: DiffRow[]
}

export interface DiffFile {
  path: string
  oldPath?: string
  status: DiffFileStatus
  additions: number
  deletions: number
  binary?: boolean
  language?: string
  hunks: DiffHunk[]
}

export interface DiffResult {
  files: DiffFile[]
  totalAdditions: number
  totalDeletions: number
  hasDifftastic: boolean
  error?: string
}

export interface DiffShortStat {
  filesChanged: number
  additions: number
  deletions: number
}

export interface AppState {
  projects: Project[]
  activeTabId: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    fontSize: 14,
    fontFamily: '',
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
