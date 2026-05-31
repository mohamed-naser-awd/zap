import { ipcMain, shell } from 'electron'
import { IpcChannels, ok, err } from '@shared/ipc'
import { log } from '../services/logger'

export function register() {
  ipcMain.handle(IpcChannels.logsGetPath, async () => {
    try {
      const path = await log.getLogPath()
      return ok({ path, dir: log.getLogDir(), size: await log.size() })
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.logsReveal, async () => {
    try {
      const path = await log.getLogPath()
      shell.showItemInFolder(path)
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.logsOpen, async () => {
    try {
      const path = await log.getLogPath()
      const result = await shell.openPath(path)
      return result === '' ? ok(true) : err(result)
    } catch (e) {
      return err((e as Error).message)
    }
  })
}
