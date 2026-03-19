import { type Accessor, createContext, useContext } from 'solid-js'
import type { Project, WorkspaceTab } from '../types'

export interface ProjectContextValue {
  project: Accessor<Project>
  onOpenItem: (item: WorkspaceTab, cwd: string) => void
  onRunScript: (item: WorkspaceTab, cwd: string) => void
  onCloseItem: (id: string) => void
  onRemoveItem: (id: string, cwd: string) => void

  onCreateTerminal: (worktreePath?: string) => void
  onCreateOpencodeInstance: (worktreePath?: string) => void
  onStartRename: (id: string, label: string) => void
  onConfirmRename: (id: string, cwd: string) => void
  onRenameInput: (value: string) => void
  onCancelRename: () => void
  onReorderItems: (cwd: string, newItems: WorkspaceTab[]) => void
  isItemActive: (id: string) => boolean
  getItemStatus: (id: string) => 'idle' | 'running' | 'success' | 'error'
  getOcSessionId: (id: string) => string | undefined
  isOcGenerating: (sessionId: string) => boolean
  ocNeedsAttention: (sessionId: string) => boolean
  ocActivity: (sessionId: string) => string
  onOpenDiff: (worktreePath?: string) => void
  isDiffActive: (cwd: string) => boolean
  renamingTerminalId: Accessor<string | null>
  renameValue: Accessor<string>
}

const ProjectContext = createContext<ProjectContextValue>()

export const ProjectProvider = ProjectContext.Provider

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within a ProjectProvider')
  return ctx
}
