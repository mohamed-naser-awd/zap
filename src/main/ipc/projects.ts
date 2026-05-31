import { ipcMain } from 'electron'
import { nanoid } from 'nanoid'
import { db } from '../services/config-store'
import { IpcChannels, ok, err } from '@shared/ipc'
import { projectSchema } from '@shared/schemas'
import type { Project } from '@shared/types'

export function register() {
  ipcMain.handle(IpcChannels.projectsList, () => ok(db.projects.list()))

  ipcMain.handle(IpcChannels.projectsGet, (_e, id: string) => {
    const p = db.projects.list().find((x) => x.id === id)
    return p ? ok(p) : err('not found')
  })

  ipcMain.handle(IpcChannels.projectsCreate, (_e, raw: unknown) => {
    const partial = raw as Omit<Project, 'id'>
    const candidate: Project = { ...partial, id: nanoid() }
    const parsed = projectSchema.safeParse(candidate)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.projects.list()
    if (all.some((p) => p.name === parsed.data.name)) return err('name already in use')
    all.push(parsed.data)
    db.projects.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.projectsUpdate, (_e, raw: unknown) => {
    const parsed = projectSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.projects.list()
    const i = all.findIndex((x) => x.id === parsed.data.id)
    if (i < 0) return err('not found')
    all[i] = parsed.data
    db.projects.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.projectsDelete, (_e, id: string) => {
    db.projects.set(db.projects.list().filter((x) => x.id !== id))
    // Detach any connections that pointed at this project.
    const conns = db.connections.list()
    let touched = false
    for (const c of conns) {
      if (c.projectId === id) {
        delete c.projectId
        touched = true
      }
    }
    if (touched) db.connections.set(conns)
    return ok(true)
  })
}
