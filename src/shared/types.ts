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
