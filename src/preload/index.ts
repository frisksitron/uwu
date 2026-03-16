import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

const terminalAPI = {
  create: (
    cols: number,
    rows: number,
    cwd?: string,
    shell?: string,
    extraEnv?: Record<string, string>
  ): Promise<number> => ipcRenderer.invoke('terminal:create', cols, rows, cwd, shell, extraEnv),
  createScript: (
    cols: number,
    rows: number,
    cwd: string,
    command: string,
    shell?: string,
    extraEnv?: Record<string, string>
  ): Promise<number> =>
    ipcRenderer.invoke('terminal:create-script', cols, rows, cwd, command, shell, extraEnv),
  sendInput: (id: number, data: string): void => ipcRenderer.send('terminal:input', id, data),
  resize: (id: number, cols: number, rows: number): void =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  kill: (id: number): void => ipcRenderer.send('terminal:kill', id),
  onOutput: (cb: (id: number, data: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: number, data: string): void => cb(id, data)
    ipcRenderer.on('terminal:output', handler)
    return () => ipcRenderer.removeListener('terminal:output', handler)
  },
  onExit: (cb: (id: number, code: number, signal: number | undefined) => void): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      id: number,
      code: number,
      signal: number | undefined
    ): void => cb(id, code, signal)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  saveCache: (
    data: Record<string, import('../renderer/src/types').TerminalCacheEntry>
  ): Promise<void> => ipcRenderer.invoke('terminal-cache:save', data),
  loadCache: (): Promise<Record<string, import('../renderer/src/types').TerminalCacheEntry>> =>
    ipcRenderer.invoke('terminal-cache:load')
}

const projectAPI = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('project:select-folder'),
  readMetadata: (
    p: string
  ): Promise<{
    name: string
    scripts: Record<string, string>
    projectType: string
  } | null> => ipcRenderer.invoke('project:read-metadata', p),
  loadProjects: (): Promise<import('../renderer/src/types').Project[]> =>
    ipcRenderer.invoke('projects:load'),
  saveProjects: (projects: import('../renderer/src/types').Project[]): Promise<void> =>
    ipcRenderer.invoke('projects:save', projects)
}

const worktreeAPI = {
  getDefaultBasePath: (): Promise<string> => ipcRenderer.invoke('worktree:default-base-path'),
  isGitRepo: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('worktree:is-git-repo', projectPath),
  list: (projectPath: string): Promise<{ path: string; branch: string; isMain: boolean }[]> =>
    ipcRenderer.invoke('worktree:list', projectPath),
  create: (
    projectPath: string,
    branchName: string,
    worktreePath: string,
    syncFiles: string[]
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('worktree:create', projectPath, branchName, worktreePath, syncFiles),
  remove: (
    projectPath: string,
    worktreePath: string,
    force: boolean
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('worktree:remove', projectPath, worktreePath, force),
  syncFiles: (
    projectPath: string,
    worktreePath: string,
    files: string[]
  ): Promise<{ copied: string[]; errors: string[] }> =>
    ipcRenderer.invoke('worktree:sync-files', projectPath, worktreePath, files),
  readScripts: (worktreePath: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('worktree:read-scripts', worktreePath)
}

const windowAPI = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  confirmClose: (): void => ipcRenderer.send('window:close-confirmed'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
    const handler = (_: unknown, val: boolean): void => cb(val)
    ipcRenderer.on('window:maximized-change', handler)
    return () => ipcRenderer.off('window:maximized-change', handler)
  },
  onCloseRequested: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('window:close-requested', handler)
    return () => ipcRenderer.removeListener('window:close-requested', handler)
  }
}

const opencodeAPI = {
  start: (projectPath: string): Promise<{ status: string; error?: string }> =>
    ipcRenderer.invoke('opencode:start', projectPath),
  sessionList: (projectPath: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:session-list', projectPath),
  sessionCreate: (projectPath: string, title?: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:session-create', projectPath, title),
  sessionGet: (projectPath: string, sessionId: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:session-get', projectPath, sessionId),
  sessionDelete: (projectPath: string, sessionId: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:session-delete', projectPath, sessionId),
  sessionAbort: (projectPath: string, sessionId: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:session-abort', projectPath, sessionId),
  messages: (projectPath: string, sessionId: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:messages', projectPath, sessionId),
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
  ): Promise<void> => ipcRenderer.invoke('opencode:send-message', projectPath, sessionId, payload),
  permissionRespond: (
    projectPath: string,
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ): Promise<void> =>
    ipcRenderer.invoke(
      'opencode:permission-respond',
      projectPath,
      sessionId,
      permissionId,
      response
    ),
  questionReply: (
    projectPath: string,
    requestId: string,
    answers: Array<Array<string>>
  ): Promise<void> =>
    ipcRenderer.invoke('opencode:question-reply', projectPath, requestId, answers),
  questionReject: (projectPath: string, requestId: string): Promise<void> =>
    ipcRenderer.invoke('opencode:question-reject', projectPath, requestId),
  providers: (projectPath: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:providers', projectPath),
  config: (projectPath: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:config', projectPath),
  agents: (projectPath: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:agents', projectPath),
  commands: (projectPath: string): Promise<unknown> =>
    ipcRenderer.invoke('opencode:commands', projectPath),
  sessionCommand: (
    projectPath: string,
    sessionId: string,
    command: string,
    args: string,
    model?: string,
    agent?: string,
    variant?: string
  ): Promise<void> =>
    ipcRenderer.invoke(
      'opencode:session-command',
      projectPath,
      sessionId,
      command,
      args,
      model,
      agent,
      variant
    ),
  onEvent: (cb: (projectPath: string, event: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, projectPath: string, event: unknown): void =>
      cb(projectPath, event)
    ipcRenderer.on('opencode:event', handler)
    return () => ipcRenderer.removeListener('opencode:event', handler)
  },
  onEventError: (cb: (projectPath: string, error: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, projectPath: string, error: string): void =>
      cb(projectPath, error)
    ipcRenderer.on('opencode:event-error', handler)
    return () => ipcRenderer.removeListener('opencode:event-error', handler)
  }
}

const updaterAPI = {
  check: (): Promise<unknown> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onChecking: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('updater:checking', handler)
    return () => ipcRenderer.removeListener('updater:checking', handler)
  },
  onAvailable: (cb: (info: unknown) => void): (() => void) => {
    const handler = (_: unknown, info: unknown): void => cb(info)
    ipcRenderer.on('updater:available', handler)
    return () => ipcRenderer.removeListener('updater:available', handler)
  },
  onNotAvailable: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('updater:not-available', handler)
    return () => ipcRenderer.removeListener('updater:not-available', handler)
  },
  onProgress: (cb: (progress: unknown) => void): (() => void) => {
    const handler = (_: unknown, progress: unknown): void => cb(progress)
    ipcRenderer.on('updater:progress', handler)
    return () => ipcRenderer.removeListener('updater:progress', handler)
  },
  onDownloaded: (cb: (info: unknown) => void): (() => void) => {
    const handler = (_: unknown, info: unknown): void => cb(info)
    ipcRenderer.on('updater:downloaded', handler)
    return () => ipcRenderer.removeListener('updater:downloaded', handler)
  },
  onError: (cb: (error: { message: string; stack?: string }) => void): (() => void) => {
    const handler = (_: unknown, error: { message: string; stack?: string }): void => cb(error)
    ipcRenderer.on('updater:error', handler)
    return () => ipcRenderer.removeListener('updater:error', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('terminalAPI', terminalAPI)
    contextBridge.exposeInMainWorld('projectAPI', projectAPI)
    contextBridge.exposeInMainWorld('worktreeAPI', worktreeAPI)
    contextBridge.exposeInMainWorld('windowAPI', windowAPI)
    contextBridge.exposeInMainWorld('opencodeAPI', opencodeAPI)
    contextBridge.exposeInMainWorld('updaterAPI', updaterAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (window.electron is not in the declared Window type)
  window.electron = electronAPI
  // @ts-expect-error (window.terminalAPI is not in the declared Window type)
  window.terminalAPI = terminalAPI
  // @ts-expect-error (window.projectAPI is not in the declared Window type)
  window.projectAPI = projectAPI
  // @ts-expect-error (window.worktreeAPI is not in the declared Window type)
  window.worktreeAPI = worktreeAPI
  // @ts-expect-error (window.windowAPI is not in the declared Window type)
  window.windowAPI = windowAPI
  // @ts-expect-error (window.opencodeAPI is not in the declared Window type)
  window.opencodeAPI = opencodeAPI
  // @ts-expect-error (window.updaterAPI is not in the declared Window type)
  window.updaterAPI = updaterAPI
}
