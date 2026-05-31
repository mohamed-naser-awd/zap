import { ipcMain, nativeImage, BrowserWindow } from 'electron'
import { tmpdir } from 'os'
import { join, basename } from 'path'
import { mkdir, rm } from 'fs/promises'
import { nanoid } from 'nanoid'
import { IpcChannels, ok, err } from '@shared/ipc'
import { getConnection } from '../ssh-utils'
import { getSftpClient } from './sftp'
import { log } from '../services/logger'

// 16x16 transparent PNG — Electron's startDrag requires a non-empty icon.
// The OS will substitute the real file icon in the actual drag image.
const ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

// Temp dirs cleaned up after a grace period so the OS has time to read the file
// post-drop. Long enough that a slow file manager copy finishes; short enough
// that we don't accumulate clutter across a long session.
const CLEANUP_AFTER_MS = 5 * 60_000

type CleanupEntry = { dir: string; at: number }
const cleanupQueue: CleanupEntry[] = []

function scheduleCleanup(dir: string) {
  cleanupQueue.push({ dir, at: Date.now() + CLEANUP_AFTER_MS })
}

setInterval(() => {
  const now = Date.now()
  while (cleanupQueue.length > 0 && cleanupQueue[0].at < now) {
    const entry = cleanupQueue.shift()!
    rm(entry.dir, { recursive: true, force: true })
      .then(() => log.info('dragout.cleanup', { dir: entry.dir }))
      .catch((e) => log.warn('dragout.cleanup-failed', { dir: entry.dir, error: e }))
  }
}, 60_000)

function callStartDrag(senderId: number, files: string[]): boolean {
  const wc = BrowserWindow.getAllWindows()
    .map((w) => w.webContents)
    .find((c) => c.id === senderId)
  if (!wc) {
    log.warn('dragout.no-webcontents', { senderId })
    return false
  }
  const icon = nativeImage.createFromBuffer(ICON_PNG)
  try {
    wc.startDrag({ file: files[0], files, icon })
    log.info('dragout.startDrag', { files })
    return true
  } catch (e) {
    log.error('dragout.startDrag-failed', { files, error: e })
    return false
  }
}

export function register() {
  /**
   * Drag-out for local files: just startDrag with the paths the renderer
   * already has. Synchronous from the OS's perspective, so the OS drag begins
   * in the same gesture the user started.
   */
  ipcMain.handle(IpcChannels.dragoutFromLocal, (e, raw: { paths: string[] }) => {
    if (!raw?.paths || raw.paths.length === 0) return err('no paths')
    const ok2 = callStartDrag(e.sender.id, raw.paths)
    return ok2 ? ok(true) : err('startDrag failed')
  })

  /**
   * Drag-out for remote files: download to a temp dir first (since the OS drag
   * requires a real local path), then call startDrag. If the user is still
   * holding the mouse button by the time the download completes, the drag
   * continues seamlessly to the OS target. For slow downloads the user may
   * release first — the file remains in temp so they can drag again, and we
   * also keep a record on disk to reveal via Show-in-folder.
   */
  ipcMain.handle(
    IpcChannels.dragoutFromRemote,
    async (
      e,
      raw: { connectionId: string; items: Array<{ path: string; isDir: boolean }> }
    ) => {
      if (!raw?.connectionId || !raw.items || raw.items.length === 0) return err('no items')
      const conn = getConnection(raw.connectionId)
      if (!conn) return err('unknown connection')

      const dir = join(tmpdir(), 'zap-dragout-' + nanoid())
      await mkdir(dir, { recursive: true })

      try {
        const client = await getSftpClient(raw.connectionId)
        const localPaths: string[] = []
        for (const it of raw.items) {
          const name = basename(it.path) || 'remote-file'
          const localPath = join(dir, name)
          log.info('dragout.download', {
            connection: conn.name,
            remote: it.path,
            local: localPath,
            isDir: it.isDir
          })
          if (it.isDir) {
            await client.downloadDir(it.path, localPath)
          } else {
            await client.fastGet(it.path, localPath)
          }
          localPaths.push(localPath)
        }

        const started = callStartDrag(e.sender.id, localPaths)
        scheduleCleanup(dir)
        return ok({ localPaths, startedDrag: started, dir })
      } catch (e) {
        log.error('dragout.remote.failed', { error: e })
        scheduleCleanup(dir)
        return err((e as Error).message)
      }
    }
  )
}
