export interface PersistentTerminal {
  id: string
  label: string
  worktreePath?: string
  customLabel?: boolean
}

export interface OpencodeInstance {
  id: string
  sessionId: string
  label: string
  worktreePath?: string
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
  opencodeInstances?: OpencodeInstance[]
}

// Runtime only — not persisted
export interface Tab {
  tabId: string
  label: string
  cwd: string
  projectId: string
  type: 'script' | 'persistent' | 'opencode'
  persistentTerminalId?: string
  opencodeInstanceId?: string
  initialCommand?: string
  status?: 'idle' | 'running' | 'exited'
  exitCode?: number
  sessionId?: string
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
