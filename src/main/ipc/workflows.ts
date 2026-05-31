import { ipcMain } from 'electron'
import { nanoid } from 'nanoid'
import { IpcChannels, ok, err } from '@shared/ipc'
import { workflowSchema, workflowRunOptsSchema } from '@shared/schemas'
import type { Workflow } from '@shared/types'
import { db } from '../services/config-store'
import { startRun, cancelRun, getRun, listRuns } from '../workflows/runner'

export function register() {
  ipcMain.handle(IpcChannels.workflowsList, () => ok(db.workflows.list()))

  ipcMain.handle(IpcChannels.workflowsGet, (_e, id: string) => {
    const w = db.workflows.list().find((x) => x.id === id)
    return w ? ok(w) : err('not found')
  })

  ipcMain.handle(IpcChannels.workflowsCreate, (_e, raw: unknown) => {
    const partial = raw as Omit<Workflow, 'id'>
    const candidate: Workflow = { ...partial, id: nanoid() }
    const parsed = workflowSchema.safeParse(candidate)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.workflows.list()
    all.push(parsed.data)
    db.workflows.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.workflowsUpdate, (_e, raw: unknown) => {
    const parsed = workflowSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    const all = db.workflows.list()
    const i = all.findIndex((x) => x.id === parsed.data.id)
    if (i < 0) return err('not found')
    all[i] = parsed.data
    db.workflows.set(all)
    return ok(parsed.data)
  })

  ipcMain.handle(IpcChannels.workflowsDelete, (_e, id: string) => {
    db.workflows.set(db.workflows.list().filter((x) => x.id !== id))
    return ok(true)
  })

  ipcMain.handle(IpcChannels.workflowsRun, (_e, raw: unknown) => {
    const parsed = workflowRunOptsSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    const wf = db.workflows.list().find((w) => w.id === parsed.data.id)
    if (!wf) return err('workflow not found')
    const run = startRun(wf, parsed.data.vars)
    return ok({ runId: run.id })
  })

  ipcMain.handle(IpcChannels.workflowsCancelRun, (_e, id: string) => ok(cancelRun(id)))

  ipcMain.handle(IpcChannels.workflowsGetRun, (_e, id: string) => {
    const r = getRun(id)
    return r ? ok(r) : err('not found')
  })

  ipcMain.handle(IpcChannels.workflowsListRuns, (_e, workflowId?: string) => ok(listRuns(workflowId)))
}
