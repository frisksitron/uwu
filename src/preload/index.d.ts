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
}

interface ProjectAPI {
  selectFolder: () => Promise<string | null>
  selectFiles: (defaultPath: string) => Promise<string[]>
}

interface WorktreeAPI {
  getDefaultBasePath: () => Promise<string>
  isGitRepo: (projectPath: string) => Promise<boolean>
  list: (projectPath: string) => Promise<import('../shared/types').WorktreeInfo[]>
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
}

interface WindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  confirmClose: () => void
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void
  onCloseRequested: (cb: () => void) => () => void
}

interface OpencodeAPI {
  start: (projectPath: string) => Promise<{ status: string; error?: string }>
  sessionList: (projectPath: string) => Promise<unknown>
  sessionCreate: (projectPath: string, title?: string) => Promise<unknown>
  sessionGet: (projectPath: string, sessionId: string) => Promise<unknown>
  sessionDelete: (projectPath: string, sessionId: string) => Promise<unknown>
  sessionAbort: (projectPath: string, sessionId: string) => Promise<unknown>
  messages: (projectPath: string, sessionId: string) => Promise<unknown>
  sendMessage: (
    projectPath: string,
    sessionId: string,
    payload: {
      parts: Array<
        | { type: 'text'; text: string }
        | { type: 'file'; mime: string; url: string; filename?: string }
      >
      model?: { providerID: string; modelID: string }
      agent?: string
      variant?: string
    }
  ) => Promise<void>
  permissionRespond: (
    projectPath: string,
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ) => Promise<void>
  questionReply: (
    projectPath: string,
    requestId: string,
    answers: Array<Array<string>>
  ) => Promise<void>
  questionReject: (projectPath: string, requestId: string) => Promise<void>
  providers: (projectPath: string) => Promise<unknown>
  config: (projectPath: string) => Promise<unknown>
  agents: (projectPath: string) => Promise<unknown>
  commands: (projectPath: string) => Promise<unknown>
  sessionCommand: (
    projectPath: string,
    sessionId: string,
    command: string,
    args: string,
    model?: string,
    agent?: string,
    variant?: string
  ) => Promise<void>
  onEvent: (cb: (projectPath: string, event: unknown) => void) => () => void
  onEventError: (cb: (projectPath: string, error: string) => void) => () => void
}

interface UpdaterAPI {
  check: () => Promise<unknown>
  install: () => Promise<void>
  onChecking: (cb: () => void) => () => void
  onAvailable: (cb: (info: unknown) => void) => () => void
  onNotAvailable: (cb: () => void) => () => void
  onProgress: (cb: (progress: unknown) => void) => () => void
  onDownloaded: (cb: (info: unknown) => void) => () => void
  onError: (cb: (error: { message: string; stack?: string }) => void) => () => void
}

interface DiffAPI {
  get: (cwd: string, mode: string) => Promise<import('../shared/types').DiffResult>
  shortstat: (cwd: string) => Promise<import('../shared/types').DiffShortStat | null>
}

interface SettingsAPI {
  getMonoFonts: () => Promise<string[]>
}

interface PersistAPI {
  load: (section: string) => Promise<unknown>
  update: (section: string, data: unknown) => void
  flush: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    terminalAPI: TerminalAPI
    projectAPI: ProjectAPI
    worktreeAPI: WorktreeAPI
    windowAPI: WindowAPI
    opencodeAPI: OpencodeAPI
    diffAPI: DiffAPI
    settingsAPI: SettingsAPI
    persistAPI: PersistAPI
    updaterAPI: UpdaterAPI
  }
}
