import { app } from 'electron'
import { db } from './config-store'
import { log } from './logger'

/**
 * Apply the current settings to the OS-level login item (Windows Run key /
 * macOS LoginItems). Safe to call any time; no-op on Linux.
 */
export function syncLoginItem(): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  // Auto-launching the dev electron binary is never useful: it would launch
  // `node_modules/electron/dist/electron.exe` with no project context, no
  // renderer dev server, and no way to find our app code. Refuse to register
  // it, and proactively wipe any stale entry left by an earlier broken enable.
  if (!app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false })
    log.warn('login-item.skipped-dev', { reason: 'app is not packaged' })
    return
  }
  const s = db.settings.get()
  app.setLoginItemSettings({
    openAtLogin: !!s.launchOnLogin,
    openAsHidden: !!s.startMinimized,
    args: s.startMinimized ? ['--hidden'] : []
  })
  log.info('login-item.sync', {
    openAtLogin: s.launchOnLogin,
    openAsHidden: s.startMinimized
  })
}

/**
 * Should the main window be hidden on launch? True when the OS launched us
 * via the login item with `openAsHidden`, when the user passed `--hidden`
 * explicitly, or when they've set `startMinimized` in Settings.
 */
export function shouldStartHidden(): boolean {
  if (process.argv.includes('--hidden')) return true
  if (process.platform === 'win32' && app.getLoginItemSettings().wasOpenedAsHidden) return true
  if (db.settings.get().startMinimized) return true
  return false
}
