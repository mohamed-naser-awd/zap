import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join, resolve, sep } from 'path'
import { IpcChannels, ok, err } from '@shared/ipc'
import type { FsEntry } from '@shared/types'

export function register() {
  ipcMain.handle(IpcChannels.fsHome, () => ok(homedir()))

  ipcMain.handle(IpcChannels.fsList, async (_e, path: string) => {
    try {
      const abs = resolve(path || homedir())
      const items = await fs.readdir(abs, { withFileTypes: true })
      const entries: FsEntry[] = []
      for (const it of items) {
        const full = join(abs, it.name)
        let stat
        try {
          stat = await fs.stat(full)
        } catch {
          continue
        }
        entries.push({
          name: it.name,
          path: full,
          isDir: it.isDirectory(),
          size: stat.size,
          mtime: stat.mtimeMs
        })
      }
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return ok({ path: abs, sep, entries })
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.fsMkdir, async (_e, path: string) => {
    try {
      await fs.mkdir(path, { recursive: true })
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.fsDelete, async (_e, raw: { path: string; isDir: boolean }) => {
    try {
      if (raw.isDir) await fs.rm(raw.path, { recursive: true, force: true })
      else await fs.unlink(raw.path)
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.fsRename, async (_e, raw: { from: string; to: string }) => {
    try {
      await fs.rename(raw.from, raw.to)
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })
}
