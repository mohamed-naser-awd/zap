import type { ChildProcess } from 'child_process'

type Entry = {
  id: string
  kind: string
  proc: ChildProcess | { pid?: number; kill: (sig?: string) => void }
  tags?: Record<string, string>
}

const registry = new Map<string, Entry>()

export function register(entry: Entry) {
  registry.set(entry.id, entry)
  const proc = entry.proc as ChildProcess
  if (proc && typeof (proc as ChildProcess).once === 'function') {
    ;(proc as ChildProcess).once('exit', () => registry.delete(entry.id))
  }
}

export function unregister(id: string) {
  registry.delete(id)
}

export function get(id: string): Entry | undefined {
  return registry.get(id)
}

export function list(filter?: (e: Entry) => boolean): Entry[] {
  const all = Array.from(registry.values())
  return filter ? all.filter(filter) : all
}

export function killOne(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  const e = registry.get(id)
  if (!e) return false
  try {
    e.proc.kill(signal)
    if (process.platform === 'win32' && (e.proc as ChildProcess).pid) {
      // Best effort: ensure children of the SSH/rsync wrapper also die
      try {
        const { spawnSync } = require('child_process') as typeof import('child_process')
        spawnSync('taskkill', ['/PID', String((e.proc as ChildProcess).pid), '/T', '/F'])
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  registry.delete(id)
  return true
}

export function killAll() {
  for (const id of Array.from(registry.keys())) killOne(id, 'SIGTERM')
}

export function killByTag(tag: string, value: string) {
  for (const e of Array.from(registry.values())) {
    if (e.tags && e.tags[tag] === value) killOne(e.id)
  }
}
