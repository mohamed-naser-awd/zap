import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import * as procmgr from './services/process-manager'
import { closeAllSftp } from './ipc/sftp'
import { log } from './services/logger'
import { setupTray, showWindow } from './services/tray'
import { syncLoginItem, shouldStartHidden } from './services/startup'

const isDev = !app.isPackaged

// Tag the app object so the window's close handler can tell "user clicked X"
// (which hides) from "tray → Quit" / "before-quit fired" (which actually exit).
;(app as unknown as { isQuitting: boolean }).isQuitting = false

let mainWindow: BrowserWindow | null = null
// Set to false if the system tray couldn't be created — in that case we fall
// back to "close fully quits" so the user isn't trapped with no way to surface
// the window.
let trayAvailable = false

function createWindow() {
  const startHidden = shouldStartHidden() && trayAvailable
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    if (!startHidden) win.show()
  })

  // Hide on close instead of quitting — the tray's Quit menu is the only way
  // to fully exit. If we couldn't create a tray, fall back to letting the
  // close go through (otherwise the user has no way to bring the window back).
  win.on('close', (e) => {
    const quitting = (app as unknown as { isQuitting: boolean }).isQuitting
    if (!quitting && trayAvailable) {
      e.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Re-launching the installed shortcut while we're already running brings the
  // existing window to the foreground instead of spawning a duplicate.
  app.on('second-instance', () => {
    if (!mainWindow) createWindow()
    else showWindow()
  })

  app.whenReady().then(async () => {
    const logPath = await log.getLogPath()
    log.info('app.start', {
      version: app.getVersion(),
      platform: process.platform,
      logPath,
      args: process.argv.slice(1)
    })
    process.on('uncaughtException', (e) => log.error('uncaughtException', { error: e }))
    process.on('unhandledRejection', (e) => log.error('unhandledRejection', { reason: e }))
    registerIpc()
    syncLoginItem()
    // Create the tray BEFORE the window so `trayAvailable` is correct when the
    // window's `close` handler is attached.
    const tray = setupTray(() => mainWindow)
    trayAvailable = !!tray
    if (!trayAvailable) log.warn('tray.unavailable')
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  // On macOS apps usually stay alive after the last window closes; on Windows
  // we keep the process alive too because the tray is the canonical surface.
  // Only quit if the tray failed to come up — in that case "X" actually closed
  // the window and the app should exit normally.
  if (process.platform === 'darwin') return
  if (trayAvailable) return
  app.quit()
})

app.on('before-quit', () => {
  ;(app as unknown as { isQuitting: boolean }).isQuitting = true
  log.info('app.before-quit')
  procmgr.killAll()
  closeAllSftp().catch(() => undefined)
})
