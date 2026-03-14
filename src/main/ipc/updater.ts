import { type BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export function setupUpdaterIpc(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:available', info)
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater:error', err.message)
  })

  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall(false, true))

  // Auto-check for updates in production
  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdatesAndNotify()
  }
}
