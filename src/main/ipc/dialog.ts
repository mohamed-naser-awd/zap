import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IpcChannels, ok, err } from '@shared/ipc'

export type OpenDialogArgs = {
  mode: 'file' | 'directory'
  title?: string
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export function register() {
  ipcMain.handle(IpcChannels.dialogOpen, async (e, raw: unknown) => {
    const args = (raw ?? {}) as OpenDialogArgs
    if (args.mode !== 'file' && args.mode !== 'directory') return err('invalid mode')
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const properties: Array<'openFile' | 'openDirectory'> =
      args.mode === 'directory' ? ['openDirectory'] : ['openFile']
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: args.title,
          defaultPath: args.defaultPath,
          filters: args.filters,
          properties
        })
      : await dialog.showOpenDialog({
          title: args.title,
          defaultPath: args.defaultPath,
          filters: args.filters,
          properties
        })
    if (result.canceled || result.filePaths.length === 0) return ok(null)
    return ok(result.filePaths[0])
  })
}
