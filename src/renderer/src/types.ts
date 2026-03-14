export interface PersistentTerminal {
  id: string
  label: string
  worktreePath?: string
  customLabel?: boolean
}

// Runtime only — returned from main process, not persisted
export interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
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
  shellOverride?: string
  envVars?: Record<string, string>
  syncFiles?: string[]
  expandedWorktrees?: Record<string, boolean>
}

// Runtime only — not persisted
export interface Tab {
  tabId: string
  label: string
  cwd: string
  projectId: string
  type: 'script' | 'persistent'
  persistentTerminalId?: string
  initialCommand?: string
  status?: 'idle' | 'running' | 'exited'
  exitCode?: number
}

export interface TerminalCacheEntry {
  lastOutput: string
  title: string
  savedAt: number
}

export interface AppState {
  projects: Project[]
  tabs: Tab[]
  activeTabId: string | null
}
