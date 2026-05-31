import { ipcMain, app } from 'electron'
import { db } from '../services/config-store'
import { IpcChannels, ok, err } from '@shared/ipc'
import { appSettingsSchema } from '@shared/schemas'
import { syncLoginItem } from '../services/startup'

export function register() {
  ipcMain.handle(IpcChannels.settingsGet, () => ok(db.settings.get()))
  ipcMain.handle(IpcChannels.appIsPackaged, () => ok(app.isPackaged))

  ipcMain.handle(IpcChannels.settingsSet, (_e, raw: unknown) => {
    const parsed = appSettingsSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    db.settings.set(parsed.data)
    // Re-apply the OS-level login-item config so toggling the checkboxes
    // takes effect immediately, not just on next launch.
    try {
      syncLoginItem()
    } catch (e) {
      // Non-fatal — the setting is persisted and will sync next start.
      return err(`saved, but login-item sync failed: ${(e as Error).message}`)
    }
    return ok(parsed.data)
  })
}
