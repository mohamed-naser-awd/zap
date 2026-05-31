import { app } from 'electron'
import { appendFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'

type Level = 'INFO' | 'WARN' | 'ERROR'

let cachedPath: string | null = null
const queue: string[] = []
let flushing = false

function logDir(): string {
  return join(app.getPath('userData'), 'logs')
}

async function ensureLogPath(): Promise<string> {
  if (cachedPath) return cachedPath
  const dir = logDir()
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    /* exists */
  }
  const stamp = new Date().toISOString().slice(0, 10)
  cachedPath = join(dir, `zap-${stamp}.log`)
  return cachedPath
}

function fmtArg(v: unknown): string {
  if (v == null) return String(v)
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack : ''}`
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function format(level: Level, msg: string, fields?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  let line = `${ts} [${level}] ${msg}`
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      const s = fmtArg(v)
      // Quote values that contain whitespace so the key=value remains parseable.
      const needsQuote = /\s/.test(s) || s === ''
      line += ` ${k}=${needsQuote ? JSON.stringify(s) : s}`
    }
  }
  return line + '\n'
}

async function flush() {
  if (flushing) return
  flushing = true
  try {
    const path = await ensureLogPath()
    while (queue.length > 0) {
      // Drain in batches so we don't blow the call stack on a flood.
      const chunk = queue.splice(0, queue.length).join('')
      try {
        await appendFile(path, chunk)
      } catch (e) {
        // Last resort: mirror to stderr so the message isn't lost entirely.
        process.stderr.write(`[zap.logger] failed to write log: ${(e as Error).message}\n`)
        process.stderr.write(chunk)
      }
    }
  } finally {
    flushing = false
  }
}

function enqueue(line: string) {
  queue.push(line)
  // Mirror to console too so dev-time `npm run dev` shows the same stream.
  process.stdout.write(line)
  flush().catch(() => undefined)
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => enqueue(format('INFO', msg, fields)),
  warn: (msg: string, fields?: Record<string, unknown>) => enqueue(format('WARN', msg, fields)),
  error: (msg: string, fields?: Record<string, unknown>) => enqueue(format('ERROR', msg, fields)),
  getLogPath: () => ensureLogPath(),
  getLogDir: () => logDir(),
  /** Returns the size of the current log file in bytes, or 0 if missing. */
  size: async (): Promise<number> => {
    try {
      const p = await ensureLogPath()
      const st = await stat(p)
      return st.size
    } catch {
      return 0
    }
  }
}
