import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, screen, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { setupDiffIpc } from './ipc/diff'
import { killAllOpencodeServers, setupOpencodeIpc } from './ipc/opencode'
import { setupProjectIpc } from './ipc/project'
import { getSettingsStore, setupSettingsIpc } from './ipc/settings'
import { killAllTerminals, setupTerminalIpc } from './ipc/terminal'
import { setupUpdaterIpc } from './ipc/updater'
import { setupWindowIpc } from './ipc/window'
import { setupWorktreeIpc } from './ipc/worktree'

function getSavedBounds(): { x: number; y: number; width: number; height: number } | undefined {
  const s = getSettingsStore().get('settings')
  if (!s.window.rememberBounds || !s.window.bounds) return undefined
  const b = s.window.bounds
  // Validate bounds are on a visible display
  const displays = screen.getAllDisplays()
  const visible = displays.some((d) => {
    const { x, y, width, height } = d.workArea
    return b.x + b.width > x && b.x < x + width && b.y + b.height > y && b.y < y + height
  })
  return visible ? b : undefined
}

function createWindow(): void {
  const savedBounds = getSavedBounds()
  const mainWindow = new BrowserWindow({
    title: 'uwu — Unified Workspace Utility',
    width: savedBounds?.width ?? 900,
    height: savedBounds?.height ?? 670,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    show: false,
    frame: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' || process.platform === 'win32' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Sandbox disabled: preload needs Node.js APIs for terminal/git IPC
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', () => {
    killAllTerminals()
    void killAllOpencodeServers()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  for (const [name, setup] of [
    ['terminal', () => setupTerminalIpc(mainWindow)],
    ['window', () => setupWindowIpc(mainWindow)],
    ['updater', () => setupUpdaterIpc(mainWindow)],
    ['opencode', () => setupOpencodeIpc(mainWindow)]
  ] as const) {
    try {
      setup()
    } catch (err) {
      console.error(`[ipc] Failed to setup ${name} IPC:`, err)
    }
  }
}

function ensureLoopbackNoProxy(): void {
  const loopback = ['127.0.0.1', 'localhost', '::1']
  for (const key of ['NO_PROXY', 'no_proxy']) {
    const existing = process.env[key]
    const entries = existing ? existing.split(',').map((s) => s.trim()) : []
    for (const addr of loopback) {
      if (!entries.includes(addr)) entries.push(addr)
    }
    process.env[key] = entries.join(',')
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.frisksitron.uwu')
  app.commandLine.appendSwitch('proxy-bypass-list', '<-loopback>')
  ensureLoopbackNoProxy()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  for (const [name, setup] of [
    ['settings', setupSettingsIpc],
    ['project', setupProjectIpc],
    ['worktree', setupWorktreeIpc],
    ['diff', setupDiffIpc]
  ] as const) {
    try {
      setup()
    } catch (err) {
      console.error(`[ipc] Failed to setup ${name} IPC:`, err)
    }
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
