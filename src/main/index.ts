import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { setupProjectIpc } from './ipc/project'
import { killAllTerminals, setupTerminalIpc } from './ipc/terminal'
import { setupUpdaterIpc } from './ipc/updater'
import { setupWindowIpc } from './ipc/window'
import { setupWorktreeIpc } from './ipc/worktree'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    title: 'uwu — Unified Workspace Utility',
    width: 900,
    height: 670,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Sandbox disabled: preload needs Node.js APIs for terminal/git IPC
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', () => killAllTerminals())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  setupTerminalIpc(mainWindow)
  setupWindowIpc(mainWindow)
  setupUpdaterIpc(mainWindow)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  setupProjectIpc()
  setupWorktreeIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
