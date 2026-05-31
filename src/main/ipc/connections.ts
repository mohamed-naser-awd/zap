import { ipcMain } from 'electron'
import { nanoid } from 'nanoid'
import { db } from '../services/config-store'
import { IpcChannels, ok, err } from '@shared/ipc'
import { connectionSchema } from '@shared/schemas'
import type { Connection } from '@shared/types'

export function register() {
  ipcMain.handle(IpcChannels.connectionsList, () => ok(db.connections.list()))

  ipcMain.handle(IpcChannels.connectionsGet, (_e, id: string) => {
    const c = db.connections.list().find((x) => x.id === id)
    return c ? ok(c) : err('not found')
  })

  ipcMain.handle(IpcChannels.connectionsCreate, (_e, raw: unknown) => {
    const partial = raw as Omit<Connection, 'id'>
    const candidate: Connection = { ...partial, id: nanoid() }
    const parsed = connectionSchema.safeParse(candidate)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.connections.list()
    all.push(parsed.data)
    db.connections.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.connectionsUpdate, (_e, raw: unknown) => {
    const parsed = connectionSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.connections.list()
    const i = all.findIndex((x) => x.id === parsed.data.id)
    if (i < 0) return err('not found')
    all[i] = parsed.data
    db.connections.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.connectionsDelete, (_e, id: string) => {
    const all = db.connections.list()
    const next = all.filter((x) => x.id !== id)
    db.connections.set(next)
    return ok(true)
  })
}
