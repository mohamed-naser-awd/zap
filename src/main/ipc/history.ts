import { ipcMain } from 'electron'
import { nanoid } from 'nanoid'
import { db } from '../services/config-store'
import { IpcChannels, ok, err } from '@shared/ipc'
import { tunnelSpecSchema } from '@shared/schemas'
import type { TunnelHistoryEntry, TunnelSpec } from '@shared/types'

const MAX_UNPINNED = 50

/**
 * De-dup key for a tunnel history entry: connection + the spec fields that
 * make the launch unique. Two tunnels with the same shape on the same
 * connection collapse into one row whose `lastUsedAt` is bumped on relaunch.
 */
function dedupKey(connectionId: string, spec: TunnelSpec): string {
  return [
    connectionId,
    spec.kind,
    spec.localHost,
    String(spec.localPort),
    spec.remoteHost ?? '',
    String(spec.remotePort ?? '')
  ].join('|')
}

function sortAndCap(entries: TunnelHistoryEntry[]): TunnelHistoryEntry[] {
  const pinned = entries.filter((e) => e.pinned).sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  const unpinned = entries.filter((e) => !e.pinned).sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  return [...pinned, ...unpinned.slice(0, MAX_UNPINNED)]
}

export function register() {
  ipcMain.handle(IpcChannels.tunnelHistoryList, () => ok(db.tunnelHistory.list()))

  ipcMain.handle(
    IpcChannels.tunnelHistoryUpsert,
    (_e, raw: { connectionId: string; spec: unknown }) => {
      if (!raw?.connectionId) return err('connectionId required')
      const parsed = tunnelSpecSchema.safeParse(raw.spec)
      if (!parsed.success) return err(parsed.error.message)
      const spec = parsed.data
      const key = dedupKey(raw.connectionId, spec)
      const existing = db.tunnelHistory.list()
      const i = existing.findIndex((e) => dedupKey(e.connectionId, e.spec) === key)
      const now = Date.now()
      let entry: TunnelHistoryEntry
      let next: TunnelHistoryEntry[]
      if (i >= 0) {
        entry = { ...existing[i], lastUsedAt: now }
        next = existing.slice()
        next[i] = entry
      } else {
        entry = { id: nanoid(), connectionId: raw.connectionId, spec, lastUsedAt: now }
        next = [entry, ...existing]
      }
      const trimmed = sortAndCap(next)
      db.tunnelHistory.set(trimmed)
      return ok(entry)
    }
  )

  ipcMain.handle(IpcChannels.tunnelHistoryDelete, (_e, id: string) => {
    db.tunnelHistory.set(db.tunnelHistory.list().filter((e) => e.id !== id))
    return ok(true)
  })

  ipcMain.handle(
    IpcChannels.tunnelHistorySetPinned,
    (_e, raw: { id: string; pinned: boolean }) => {
      if (!raw?.id) return err('id required')
      const all = db.tunnelHistory.list()
      const i = all.findIndex((e) => e.id === raw.id)
      if (i < 0) return err('not found')
      const next = all.slice()
      next[i] = { ...next[i], pinned: !!raw.pinned }
      db.tunnelHistory.set(sortAndCap(next))
      return ok(next[i])
    }
  )
}
