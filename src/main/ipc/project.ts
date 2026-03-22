import { relative } from 'node:path'
import { dialog, ipcMain } from 'electron'

export function setupDialogIpc(): void {
  ipcMain.handle('project:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('project:select-files', async (_event, defaultPath: string) => {
    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
      .map((p) => relative(defaultPath, p).replace(/\\/g, '/'))
      .filter((r) => !r.startsWith('..'))
  })
}
