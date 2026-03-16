import { type BrowserWindow, ipcMain } from 'electron'
import { getSettingsStore } from './settings'

const CLOSE_TIMEOUT_MS = 2000

export function setupWindowIpc(mainWindow: BrowserWindow): void {
  let closeTimeout: ReturnType<typeof setTimeout> | undefined
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => {
    // Ask renderer to save state before closing
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:close-requested')
    // Safety timeout in case renderer never responds
    closeTimeout = setTimeout(() => {
      if (!mainWindow.isDestroyed()) mainWindow.close()
    }, CLOSE_TIMEOUT_MS)
  })
  ipcMain.on('window:close-confirmed', () => {
    clearTimeout(closeTimeout)
    // Save window bounds before closing
    const store = getSettingsStore()
    const s = store.get('settings')
    if (s.window.rememberBounds && !mainWindow.isDestroyed()) {
      s.window.bounds = mainWindow.getBounds()
      store.set('settings', s)
    }
    if (!mainWindow.isDestroyed()) mainWindow.close()
  })
  ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false))
}
