import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { nanoid } from 'nanoid'
import { IpcChannels, ok, err } from '@shared/ipc'
import { tunnelStartOptsSchema } from '@shared/schemas'
import type { Tunnel, TunnelSpec } from '@shared/types'
import { buildSshArgs, getConnection, getConnectionSecretEnv } from '../ssh-utils'
import * as procmgr from '../services/process-manager'
import { log } from '../services/logger'

type Entry = { tunnel: Tunnel; proc: ChildProcess }
const active = new Map<string, Entry>()

function emit(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function specToArgs(spec: TunnelSpec): string[] {
  if (spec.kind === 'dynamic') {
    return ['-N', '-D', `${spec.localHost}:${spec.localPort}`]
  }
  if (!spec.remoteHost || !spec.remotePort) {
    throw new Error('remoteHost and remotePort required for local/remote tunnel')
  }
  const flag = spec.kind === 'local' ? '-L' : '-R'
  return ['-N', flag, `${spec.localHost}:${spec.localPort}:${spec.remoteHost}:${spec.remotePort}`]
}

export async function startTunnel(opts: {
  connectionId: string
  spec: TunnelSpec
  tags?: Record<string, string>
}): Promise<Tunnel> {
  const conn = getConnection(opts.connectionId)
  if (!conn) throw new Error(`unknown connection: ${opts.connectionId}`)
  const { bin, args } = buildSshArgs(conn, { extraArgs: specToArgs(opts.spec), ttyAlloc: 'disable' })
  const secretEnv = await getConnectionSecretEnv(conn)

  const id = nanoid()
  log.info('tunnel.spawn', { id, connection: conn.name, spec: opts.spec, bin, args })
  const proc = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...secretEnv }
  })
  const tunnel: Tunnel = {
    id,
    connectionId: conn.id,
    spec: opts.spec,
    status: 'starting',
    startedAt: Date.now()
  }
  active.set(id, { tunnel, proc })
  procmgr.register({ id, kind: 'tunnel', proc, tags: opts.tags })

  // ssh -N has no useful stdout; rely on stderr for errors. After a brief grace period mark running.
  const grace = setTimeout(() => {
    const e = active.get(id)
    if (e && e.tunnel.status === 'starting') {
      e.tunnel.status = 'running'
      emit(IpcChannels.tunnelsStatus, { ...e.tunnel })
    }
  }, 600)

  let stderrBuf = ''
  proc.stderr?.on('data', (b) => {
    stderrBuf += b.toString()
  })

  proc.once('exit', (code, signal) => {
    clearTimeout(grace)
    const e = active.get(id)
    if (!e) return
    const status = signal || code === 0 ? 'stopped' : 'error'
    e.tunnel.status = status
    if (status === 'error') {
      const tail = stderrBuf.trim().slice(-500)
      if (code === 255 && /permission denied|too many authentication failures|authentications? that can continue/i.test(stderrBuf)) {
        e.tunnel.error = 'authentication failed'
      } else if (tail) {
        e.tunnel.error = tail
      } else {
        e.tunnel.error = `ssh exited ${code}`
      }
      log.error('tunnel.exit', { id, exitCode: code, signal, stderr: stderrBuf.trim().slice(-4000) })
    } else {
      log.info('tunnel.exit', { id, status, exitCode: code, signal })
    }
    emit(IpcChannels.tunnelsStatus, { ...e.tunnel })
    active.delete(id)
  })

  proc.once('error', (e) => {
    const ent = active.get(id)
    if (!ent) return
    ent.tunnel.status = 'error'
    ent.tunnel.error = e.message
    emit(IpcChannels.tunnelsStatus, { ...ent.tunnel })
  })

  emit(IpcChannels.tunnelsStatus, { ...tunnel })
  return tunnel
}

export function stopTunnel(id: string): boolean {
  const e = active.get(id)
  if (!e) return false
  procmgr.killOne(id)
  return true
}

export function listTunnels(): Tunnel[] {
  return Array.from(active.values()).map((e) => ({ ...e.tunnel }))
}

export function register() {
  ipcMain.handle(IpcChannels.tunnelsStart, async (_e, raw: unknown) => {
    const parsed = tunnelStartOptsSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    try {
      const t = await startTunnel(parsed.data)
      return ok(t)
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.tunnelsStop, (_e, id: string) => {
    return ok(stopTunnel(id))
  })

  ipcMain.handle(IpcChannels.tunnelsList, () => ok(listTunnels()))
}
