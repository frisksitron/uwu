import { type BrowserWindow, ipcMain } from 'electron'
import Store from 'electron-store'
import * as pty from 'node-pty'

const terminals = new Map<number, pty.IPty>()
let nextTermId = 1

function getDefaultShell(): string {
  if (process.platform === 'win32') return 'pwsh.exe'
  return process.env.SHELL || 'bash'
}

function spawnTerminal(
  mainWindow: BrowserWindow,
  args: string[],
  cols: number,
  rows: number,
  cwd?: string,
  shell?: string,
  extraEnv?: Record<string, string>
): number {
  const id = nextTermId++
  const resolvedShell = shell || getDefaultShell()
  let ptyProcess: pty.IPty
  try {
    ptyProcess = pty.spawn(resolvedShell, args, {
      name: 'xterm-color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: { ...(process.env as Record<string, string>), ...extraEnv }
    })
  } catch (err) {
    throw new Error(
      `Failed to spawn terminal (shell=${resolvedShell}, cwd=${cwd}): ${(err as Error).message}`
    )
  }
  ptyProcess.onData((data) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('terminal:output', id, data)
  })
  ptyProcess.onExit(({ exitCode, signal }) => {
    terminals.delete(id)
    if (!mainWindow.isDestroyed())
      mainWindow.webContents.send('terminal:exit', id, exitCode, signal)
  })
  terminals.set(id, ptyProcess)
  return id
}

export function killAllTerminals(): void {
  for (const [id, term] of terminals) {
    term.kill()
    terminals.delete(id)
  }
}

export function setupTerminalIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'terminal:create',
    (
      _event,
      cols: number,
      rows: number,
      cwd?: string,
      shell?: string,
      extraEnv?: Record<string, string>
    ) => {
      return spawnTerminal(mainWindow, [], cols, rows, cwd, shell, extraEnv)
    }
  )

  ipcMain.handle(
    'terminal:create-script',
    (
      _event,
      cols: number,
      rows: number,
      cwd: string,
      command: string,
      shell?: string,
      extraEnv?: Record<string, string>
    ) => {
      const resolvedShell = (shell || getDefaultShell()).toLowerCase()
      let scriptArgs: string[]
      if (resolvedShell.includes('cmd')) {
        scriptArgs = ['/c', command]
      } else if (resolvedShell.includes('pwsh') || resolvedShell.includes('powershell')) {
        scriptArgs = ['-Command', command]
      } else {
        scriptArgs = ['-c', command]
      }
      return spawnTerminal(mainWindow, scriptArgs, cols, rows, cwd, shell, extraEnv)
    }
  )

  ipcMain.on('terminal:input', (_event, id: number, data: string) => terminals.get(id)?.write(data))
  ipcMain.on('terminal:resize', (_event, id: number, cols: number, rows: number) =>
    terminals.get(id)?.resize(cols, rows)
  )
  ipcMain.on('terminal:kill', (_event, id: number) => {
    terminals.get(id)?.kill()
    terminals.delete(id)
  })

  const cacheStore = new Store({
    name: 'terminal-cache',
    defaults: {}
  })

  ipcMain.handle('terminal-cache:save', (_event, data: Record<string, unknown>) => {
    cacheStore.store = data
  })

  ipcMain.handle('terminal-cache:load', () => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const data = cacheStore.store as Record<string, { savedAt?: number }>
    let changed = false
    for (const key of Object.keys(data)) {
      const savedAt = data[key]?.savedAt
      if (savedAt && now - savedAt > SEVEN_DAYS_MS) {
        delete data[key]
        changed = true
      }
    }
    if (changed) cacheStore.store = data
    return data
  })
}
