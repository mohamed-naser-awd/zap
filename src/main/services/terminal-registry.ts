import * as pty from 'node-pty'
import { nanoid } from 'nanoid'
import { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc'
import * as procmgr from './process-manager'

export type TerminalEntry = {
  id: string
  name?: string
  proc: pty.IPty
  cols: number
  rows: number
}

const byId = new Map<string, TerminalEntry>()
const nameToId = new Map<string, string>()

function emit(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

export type SpawnArgs = {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  name?: string
  cols?: number
  rows?: number
}

export function spawn(args: SpawnArgs): TerminalEntry {
  const cols = args.cols ?? 100
  const rows = args.rows ?? 30
  const proc = pty.spawn(args.command, args.args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: args.cwd,
    env: { ...process.env, ...(args.env ?? {}) } as { [key: string]: string }
  })

  const id = nanoid()
  const entry: TerminalEntry = { id, name: args.name, proc, cols, rows }
  byId.set(id, entry)
  if (args.name) nameToId.set(args.name, id)

  procmgr.register({ id, kind: 'pty', proc: { pid: proc.pid, kill: (s?: string) => proc.kill(s) } })

  proc.onData((data) => emit(IpcChannels.terminalData, { id, data }))
  proc.onExit(({ exitCode, signal }) => {
    byId.delete(id)
    if (args.name && nameToId.get(args.name) === id) nameToId.delete(args.name)
    procmgr.unregister(id)
    emit(IpcChannels.terminalExit, { id, exitCode, signal })
  })

  return entry
}

export function write(id: string, data: string): boolean {
  const e = byId.get(id)
  if (!e) return false
  e.proc.write(data)
  return true
}

export function resize(id: string, cols: number, rows: number): boolean {
  const e = byId.get(id)
  if (!e) return false
  e.cols = cols
  e.rows = rows
  try {
    e.proc.resize(cols, rows)
  } catch {
    return false
  }
  return true
}

export function kill(id: string): boolean {
  const e = byId.get(id)
  if (!e) return false
  try {
    e.proc.kill()
  } catch {
    /* ignore */
  }
  return true
}

export function findByName(name: string): TerminalEntry | undefined {
  const id = nameToId.get(name)
  return id ? byId.get(id) : undefined
}

export function list(): Array<Pick<TerminalEntry, 'id' | 'name' | 'cols' | 'rows'>> {
  return Array.from(byId.values()).map((e) => ({ id: e.id, name: e.name, cols: e.cols, rows: e.rows }))
}
