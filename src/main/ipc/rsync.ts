import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { nanoid } from 'nanoid'
import { IpcChannels, ok, err } from '@shared/ipc'
import { rsyncStartOptsSchema } from '@shared/schemas'
import type { RsyncJob, RsyncProgress } from '@shared/types'
import {
  getConnection,
  getConnectionSecretEnv,
  buildRsyncSshOption,
  toRsyncLocalPath
} from '../ssh-utils'
import { db } from '../services/config-store'
import * as procmgr from '../services/process-manager'
import { log } from '../services/logger'

type Entry = { job: RsyncJob; proc: ChildProcess }
const active = new Map<string, Entry>()

export const rsyncBus = new EventEmitter()

function emitToWindows(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

// e.g. "    12,345  23% 1.23MB/s 0:00:42 (xfr#3, to-chk=12/100)"
const progressRe = /^\s+([\d,]+)\s+(\d+)%\s+([\d.]+[a-zA-Z]+\/s)\s+([\d:]+)/

// Lines we should ignore when looking for "current file" hints.
const STATUS_PREFIXES = [
  'sending ',
  'receiving ',
  'sent ',
  'total size',
  'created directory',
  'speedup is',
  'delta:',
  'deleting'
]

function looksLikeFileLine(line: string): boolean {
  if (!line) return false
  // Progress lines start with whitespace; file-name lines from rsync's
  // verbose/progress output start at column 0.
  if (/^\s/.test(line)) return false
  const lc = line.toLowerCase()
  for (const p of STATUS_PREFIXES) if (lc.startsWith(p)) return false
  // Skip the trailing summary line ("sent X bytes  received Y bytes ...").
  if (lc.includes('bytes/sec') || lc.includes('bytes received')) return false
  return true
}

export type RsyncStartOpts = {
  connectionId: string
  direction: 'push' | 'pull'
  source: string
  dest: string
  flags: string[]
  tags?: Record<string, string>
}

export async function startRsync(opts: RsyncStartOpts): Promise<RsyncJob> {
  const conn = getConnection(opts.connectionId)
  if (!conn) throw new Error(`unknown connection: ${opts.connectionId}`)
  const settings = db.settings.get()

  const rshValue = buildRsyncSshOption(conn)
  const secretEnv = await getConnectionSecretEnv(conn)

  const remote = `${conn.user}@${conn.host}:${opts.direction === 'push' ? opts.dest : opts.source}`
  const localPathRaw = opts.direction === 'push' ? opts.source : opts.dest
  const localPath = toRsyncLocalPath(
    localPathRaw,
    settings.windowsRsyncPathStyle,
    settings.rsyncBinary
  )

  const args: string[] = [...opts.flags, '-e', rshValue]
  if (opts.direction === 'push') args.push(localPath, remote)
  else args.push(remote, localPath)

  const id = nanoid()
  log.info('rsync.spawn', {
    id,
    connection: conn.name,
    direction: opts.direction,
    source: opts.source,
    dest: opts.dest,
    localPath, // post-translation, what we actually ship to rsync
    bin: settings.rsyncBinary,
    args
  })
  const proc = spawn(settings.rsyncBinary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...secretEnv }
  })
  const job: RsyncJob = {
    id,
    connectionId: conn.id,
    direction: opts.direction,
    source: opts.source,
    dest: opts.dest,
    flags: opts.flags,
    status: 'running',
    binary: settings.rsyncBinary,
    argv: args
  }
  active.set(id, { job, proc })
  procmgr.register({ id, kind: 'rsync', proc, tags: opts.tags })

  let stdoutBuf = ''
  let stderrBuf = ''
  let currentFile: string | undefined
  proc.stdout?.on('data', (b) => {
    stdoutBuf += b.toString()
    const parts = stdoutBuf.split(/[\r\n]/)
    stdoutBuf = parts.pop() ?? ''
    for (const line of parts) {
      const m = progressRe.exec(line)
      if (m) {
        const progress: RsyncProgress = {
          transferredBytes: Number(m[1].replace(/,/g, '')),
          pct: Number(m[2]),
          rate: m[3],
          eta: m[4],
          file: currentFile
        }
        job.progress = progress
        const payload = { id, progress }
        emitToWindows(IpcChannels.rsyncProgress, payload)
        rsyncBus.emit('progress', payload)
      } else if (looksLikeFileLine(line)) {
        currentFile = line.trim()
        rsyncBus.emit('line', { id, line })
      } else if (line.trim()) {
        rsyncBus.emit('line', { id, line })
      }
    }
  })
  proc.stderr?.on('data', (b) => {
    stderrBuf += b.toString()
  })

  proc.once('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') job.status = 'cancelled'
    else if (code === 0) job.status = 'done'
    else job.status = 'error'
    job.exitCode = code ?? undefined
    const stderr = stderrBuf.trim().slice(-4000)
    if (job.status === 'error') {
      log.error('rsync.exit', { id, exitCode: code, signal, stderr })
    } else {
      log.info('rsync.exit', { id, status: job.status, exitCode: code, signal })
    }
    const payload = { id, status: job.status, exitCode: code, stderr, direction: job.direction }
    emitToWindows(IpcChannels.rsyncDone, payload)
    rsyncBus.emit('done', payload)
    active.delete(id)
  })

  proc.once('error', (e) => {
    job.status = 'error'
    log.error('rsync.spawn-error', { id, error: e })
    const payload = {
      id,
      status: 'error' as const,
      exitCode: undefined,
      stderr: e.message,
      direction: job.direction
    }
    emitToWindows(IpcChannels.rsyncDone, payload)
    rsyncBus.emit('done', payload)
  })

  return job
}

export function cancelRsync(id: string): boolean {
  return procmgr.killOne(id)
}

export function listRsync(): RsyncJob[] {
  return Array.from(active.values()).map((e) => ({ ...e.job }))
}

export function register() {
  ipcMain.handle(IpcChannels.rsyncStart, async (_e, raw: unknown) => {
    const parsed = rsyncStartOptsSchema.safeParse(raw)
    if (!parsed.success) return err(parsed.error.message)
    try {
      return ok(await startRsync(parsed.data))
    } catch (e) {
      return err((e as Error).message)
    }
  })

  ipcMain.handle(IpcChannels.rsyncCancel, (_e, id: string) => ok(cancelRsync(id)))
  ipcMain.handle(IpcChannels.rsyncList, () => ok(listRsync()))
}
