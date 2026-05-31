import { ipcMain } from 'electron'
import SftpClient from 'ssh2-sftp-client'
import { IpcChannels, ok, err } from '@shared/ipc'
import { getConnection } from '../ssh-utils'
import { getSecret } from './secrets'
import type { FsEntry } from '@shared/types'
import { log } from '../services/logger'

type Pool = {
  client: SftpClient
  lastUsed: number
  connecting: Promise<void> | null
}

const pool = new Map<string, Pool>()
const IDLE_MS = 60_000

async function buildConfig(connectionId: string) {
  const conn = getConnection(connectionId)
  if (!conn) throw new Error(`unknown connection: ${connectionId}`)
  const config: any = {
    host: conn.host,
    port: conn.port,
    username: conn.user,
    readyTimeout: 15_000
  }
  let anyMethod = false
  if (conn.identityKey) {
    const fs = await import('fs/promises')
    config.privateKey = await fs.readFile(conn.identityKey.path)
    if (conn.identityKey.hasPassphrase) {
      const pp = await getSecret(conn.id, 'passphrase')
      if (pp) config.passphrase = pp
    }
    anyMethod = true
  }
  if (conn.useAgent && process.env.SSH_AUTH_SOCK) {
    config.agent = process.env.SSH_AUTH_SOCK
    anyMethod = true
  }
  if (conn.hasPassword) {
    const pw = await getSecret(conn.id, 'password')
    if (pw) {
      config.password = pw
      anyMethod = true
    }
  }
  if (!anyMethod) {
    throw new Error('no auth method configured for this connection')
  }
  return config
}

export async function getSftpClient(connectionId: string): Promise<SftpClient> {
  return getClient(connectionId)
}

async function getClient(connectionId: string): Promise<SftpClient> {
  let entry = pool.get(connectionId)
  if (entry) {
    entry.lastUsed = Date.now()
    if (entry.connecting) await entry.connecting
    return entry.client
  }
  const client = new SftpClient()
  entry = { client, lastUsed: Date.now(), connecting: null }
  pool.set(connectionId, entry)
  entry.connecting = (async () => {
    const cfg = await buildConfig(connectionId)
    try {
      await client.connect(cfg)
      log.info('sftp.connected', { connectionId, host: cfg.host, port: cfg.port, user: cfg.username })
    } catch (e) {
      log.error('sftp.connect-failed', { connectionId, host: cfg.host, port: cfg.port, error: e })
      pool.delete(connectionId)
      throw e
    }
  })()
  await entry.connecting
  entry.connecting = null
  return client
}

setInterval(() => {
  const now = Date.now()
  for (const [id, e] of Array.from(pool.entries())) {
    if (!e.connecting && now - e.lastUsed > IDLE_MS) {
      e.client.end().catch(() => undefined)
      pool.delete(id)
    }
  }
}, 30_000)

export function register() {
  ipcMain.handle(IpcChannels.sftpList, async (_e, raw: { connectionId: string; path: string }) => {
    try {
      const c = await getClient(raw.connectionId)
      const items = await c.list(raw.path || '.')
      const entries: FsEntry[] = items.map((it) => ({
        name: it.name,
        path: (raw.path.endsWith('/') ? raw.path : raw.path + '/') + it.name,
        isDir: it.type === 'd',
        size: it.size,
        mtime: it.modifyTime
      }))
      return ok(entries)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.sftpMkdir, async (_e, raw: { connectionId: string; path: string }) => {
    try {
      const c = await getClient(raw.connectionId)
      await c.mkdir(raw.path, true)
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.sftpDelete, async (_e, raw: { connectionId: string; path: string; isDir: boolean }) => {
    try {
      const c = await getClient(raw.connectionId)
      if (raw.isDir) await c.rmdir(raw.path, true)
      else await c.delete(raw.path)
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.sftpRename, async (_e, raw: { connectionId: string; from: string; to: string }) => {
    try {
      const c = await getClient(raw.connectionId)
      await c.rename(raw.from, raw.to)
      return ok(true)
    } catch (e) {
      return err((e as Error).message)
    }
  })
}

export async function closeAllSftp() {
  for (const [, e] of pool) {
    try {
      await e.client.end()
    } catch {
      /* ignore */
    }
  }
  pool.clear()
}
