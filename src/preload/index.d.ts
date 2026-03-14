import { ElectronAPI } from '@electron-toolkit/preload'

interface TerminalAPI {
  create: (
    cols: number,
    rows: number,
    cwd?: string,
    shell?: string,
    extraEnv?: Record<string, string>
  ) => Promise<number>
  createScript: (
    cols: number,
    rows: number,
    cwd: string,
    command: string,
    shell?: string,
    extraEnv?: Record<string, string>
  ) => Promise<number>
  sendInput: (id: number, data: string) => void
  resize: (id: number, cols: number, rows: number) => void
  kill: (id: number) => void
  onOutput: (callback: (id: number, data: string) => void) => () => void
  onExit: (
    callback: (id: number, exitCode: number, signal: number | undefined) => void
  ) => () => void
  saveCache: (
    data: Record<string, import('../renderer/src/types').TerminalCacheEntry>
  ) => Promise<void>
  loadCache: () => Promise<Record<string, import('../renderer/src/types').TerminalCacheEntry>>
}

interface ProjectAPI {
  selectFolder: () => Promise<string | null>
  readMetadata: (folderPath: string) => Promise<{
    name: string
    scripts: Record<string, string>
    projectType: string
  } | null>
  loadProjects: () => Promise<import('../renderer/src/types').Project[]>
  saveProjects: (projects: import('../renderer/src/types').Project[]) => Promise<void>
}

interface WorktreeAPI {
  getDefaultBasePath: () => Promise<string>
  isGitRepo: (projectPath: string) => Promise<boolean>
  list: (projectPath: string) => Promise<import('../renderer/src/types').WorktreeInfo[]>
  create: (
    projectPath: string,
    branchName: string,
    worktreePath: string,
    syncFiles: string[]
  ) => Promise<{ success: boolean; error?: string }>
  remove: (
    projectPath: string,
    worktreePath: string,
    force: boolean
  ) => Promise<{ success: boolean; error?: string }>
  syncFiles: (
    projectPath: string,
    worktreePath: string,
    files: string[]
  ) => Promise<{ copied: string[]; errors: string[] }>
  readScripts: (worktreePath: string) => Promise<Record<string, string>>
}

interface WindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void
}

interface UpdaterAPI {
  check: () => Promise<unknown>
  install: () => Promise<void>
  onChecking: (cb: () => void) => () => void
  onAvailable: (cb: (info: unknown) => void) => () => void
  onNotAvailable: (cb: () => void) => () => void
  onProgress: (cb: (progress: unknown) => void) => () => void
  onDownloaded: (cb: (info: unknown) => void) => () => void
  onError: (cb: (message: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    terminalAPI: TerminalAPI
    projectAPI: ProjectAPI
    worktreeAPI: WorktreeAPI
    windowAPI: WindowAPI
    updaterAPI: UpdaterAPI
  }
}
