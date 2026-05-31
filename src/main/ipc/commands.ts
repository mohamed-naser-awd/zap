import { ipcMain } from 'electron'
import { nanoid } from 'nanoid'
import { db } from '../services/config-store'
import { IpcChannels, ok, err } from '@shared/ipc'
import { commandSchema } from '@shared/schemas'
import type { Command } from '@shared/types'

export function register() {
  ipcMain.handle(IpcChannels.commandsList, () => ok(db.commands.list()))

  ipcMain.handle(IpcChannels.commandsGet, (_e, id: string) => {
    const c = db.commands.list().find((x) => x.id === id)
    return c ? ok(c) : err('not found')
  })

  ipcMain.handle(IpcChannels.commandsCreate, (_e, raw: unknown) => {
    const partial = raw as Omit<Command, 'id'>
    const candidate: Command = { ...partial, id: nanoid() }
    const parsed = commandSchema.safeParse(candidate)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.commands.list()
    if (all.some((c) => c.slug === parsed.data.slug)) return err('slug already in use')
    all.push(parsed.data)
    db.commands.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.commandsUpdate, (_e, raw: unknown) => {
    const parsed = commandSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.commands.list()
    const i = all.findIndex((x) => x.id === parsed.data.id)
    if (i < 0) return err('not found')
    if (all.some((c, j) => j !== i && c.slug === parsed.data.slug)) return err('slug already in use')
    all[i] = parsed.data
    db.commands.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.commandsDelete, (_e, id: string) => {
    db.commands.set(db.commands.list().filter((x) => x.id !== id))
    return ok(true)
  })
}
