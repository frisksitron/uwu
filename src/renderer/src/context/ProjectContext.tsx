import { type Accessor, createContext, useContext } from 'solid-js'
import type { OpencodeInstance, PersistentTerminal, Project, ScriptTab } from '../types'

export interface ProjectContextValue {
  project: Accessor<Project>
  onOpenScript: (scriptName: string, cwd: string) => void
  onRunScript: (scriptName: string, cwd: string) => void
  onCreateTerminal: (worktreePath?: string) => void
  onOpenTerminal: (pt: PersistentTerminal) => void
  onRemoveTerminal: (ptId: string) => void
  onStartRename: (ptId: string, label: string) => void
  onConfirmRename: (ptId: string) => void
  onRenameInput: (value: string) => void
  onCancelRename: () => void
  isScriptActive: (scriptName: string, cwd?: string) => boolean
  scriptStatus: (scriptName: string, cwd?: string) => 'idle' | 'running' | 'success' | 'error'
  getScriptTab: (scriptName: string, cwd?: string) => ScriptTab | undefined
  isPtActive: (ptId: string) => boolean
  onCreateOpencodeInstance: (worktreePath?: string) => void
  onOpenOpencodeInstance: (instance: OpencodeInstance) => void
  onRemoveOpencodeInstance: (instanceId: string) => void
  isOcInstanceActive: (instanceId: string) => boolean
  getOcSessionId: (instanceId: string) => string | undefined
  isOcGenerating: (sessionId: string) => boolean
  ocNeedsAttention: (sessionId: string) => boolean
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
