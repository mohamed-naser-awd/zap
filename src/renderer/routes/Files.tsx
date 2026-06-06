import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowLeft, Square } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { FsEntry, RsyncJob } from '@shared/types'
import { FileBrowser } from '@renderer/components/FileBrowser'
import { useStore } from '@renderer/store'

type FlagDef = { flag: string; label: string; desc?: string }

const COMMON_FLAGS: FlagDef[] = [
  { flag: '-a', label: '-a archive', desc: 'recurse + preserve perms/times/symlinks/owner/group' },
  { flag: '-v', label: '-v verbose' },
  { flag: '-z', label: '-z compress' },
  { flag: '-h', label: '-h human-readable' },
  { flag: '--progress', label: '--progress', desc: 'per-file progress (drives the % column)' },
  { flag: '--delete', label: '--delete', desc: 'remove extraneous files on destination (mirror)' },
  { flag: '-n', label: '-n dry-run' },
  { flag: '--checksum', label: '--checksum', desc: 'verify by content, not mtime+size' },
  { flag: '-u', label: '-u update', desc: 'skip files newer on the receiver' }
]

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(Boolean)
}

function hasShortLetter(tokens: string[], letter: string): boolean {
  return tokens.some((t) => t.startsWith('-') && !t.startsWith('--') && t.includes(letter))
}

function hasFlag(tokens: string[], flag: string): boolean {
  if (flag.startsWith('--')) return tokens.includes(flag)
  const letter = flag.slice(1)
  return hasShortLetter(tokens, letter)
}

function removeFlag(tokens: string[], flag: string): string[] {
  if (flag.startsWith('--')) return tokens.filter((t) => t !== flag)
  const letter = flag.slice(1)
  const out: string[] = []
  for (const t of tokens) {
    if (t === flag) continue
    if (t.startsWith('-') && !t.startsWith('--') && t.includes(letter)) {
      const rest = '-' + t.slice(1).replace(letter, '')
      if (rest !== '-') out.push(rest)
    } else {
      out.push(t)
    }
  }
  return out
}

function addFlag(tokens: string[], flag: string): string[] {
  if (hasFlag(tokens, flag)) return tokens
  return [...tokens, flag]
}

function toggleFlag(raw: string, flag: string): string {
  const tokens = tokenize(raw)
  const next = hasFlag(tokens, flag) ? removeFlag(tokens, flag) : addFlag(tokens, flag)
  return next.join(' ')
}

/**
 * Render `binary argv...` as a copy-pasteable shell command, quoting any
 * tokens that contain whitespace.
 */
function formatArgv(binary: string, argv: string[]): string {
  const fmt = (a: string) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)
  return [binary, ...argv].map(fmt).join(' ')
}

export default function FilesView() {
  const store = useStore()
  const conns = store.connections
  const settings = store.settings

  const [connectionId, setConnectionId] = useState('')
  const [localCwd, setLocalCwd] = useState('')
  const [remoteCwd, setRemoteCwd] = useState('/')
  const [localEntries, setLocalEntries] = useState<FsEntry[]>([])
  const [remoteEntries, setRemoteEntries] = useState<FsEntry[]>([])
  const [localSel, setLocalSel] = useState<Set<string>>(new Set())
  const [remoteSel, setRemoteSel] = useState<Set<string>>(new Set())
  const [flagsRaw, setFlagsRaw] = useState('')
  const [flagsTouched, setFlagsTouched] = useState(false)
  const [jobs, setJobs] = useState<RsyncJob[]>([])
  const [error, setError] = useState('')
  // Bumped to force the destination pane to re-list after a successful transfer.
  const [localRefreshTick, setLocalRefreshTick] = useState(0)
  const [remoteRefreshTick, setRemoteRefreshTick] = useState(0)

  const flagTokens = useMemo(() => tokenize(flagsRaw), [flagsRaw])

  // Default the connection to the first one available, but only once.
  useEffect(() => {
    if (!connectionId && conns[0]) setConnectionId(conns[0].id)
  }, [conns, connectionId])

  // Pull default rsync flags from settings whenever they change (unless the
  // user has typed/toggled their own).
  useEffect(() => {
    if (!flagsTouched && settings) setFlagsRaw(settings.defaultRsyncFlags.join(' '))
  }, [settings, flagsTouched])

  useEffect(() => {
    unwrap(zap.fs.home()).then(setLocalCwd)
    unwrap(zap.rsync.list()).then(setJobs)

    const offProg = zap.rsync.onProgress(({ id, progress }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? { ...j, progress: { ...progress, transferredBytes: progress.transferredBytes ?? 0 } }
            : j
        )
      )
    })
    const offDone = zap.rsync.onDone(({ id, status, exitCode, stderr, direction }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? { ...j, status: status as RsyncJob['status'], exitCode, stderr }
            : j
        )
      )
      // Refresh the destination pane so transferred files show up:
      // push → remote pane, pull → local pane.
      if (status === 'done') {
        if (direction === 'push') setRemoteRefreshTick((t) => t + 1)
        else setLocalRefreshTick((t) => t + 1)
      }
    })
    return () => {
      offProg()
      offDone()
    }
  }, [])

  const startTransfer = async (req: {
    direction: 'push' | 'pull'
    sources: string[]
    dest: string
  }) => {
    setError('')
    if (!connectionId) {
      setError('Pick a connection')
      return
    }
    if (req.sources.length === 0) {
      setError(req.direction === 'push' ? 'Select local items' : 'Select remote items')
      return
    }
    const flags = tokenize(flagsRaw)
    try {
      for (const src of req.sources) {
        const job = await unwrap(
          zap.rsync.start({
            connectionId,
            direction: req.direction,
            source: src,
            dest: req.dest,
            flags
          })
        )
        setJobs((j) => [job, ...j])
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const transferButton = (direction: 'push' | 'pull') => {
    const sources = direction === 'push' ? Array.from(localSel) : Array.from(remoteSel)
    const dest = direction === 'push' ? remoteCwd : localCwd
    return startTransfer({ direction, sources, dest })
  }

  const handleDrop = (req: {
    from: 'local' | 'remote'
    to: 'local' | 'remote'
    paths: string[]
    destPath: string
  }) => {
    if (req.from === req.to) return
    const direction: 'push' | 'pull' = req.from === 'local' ? 'push' : 'pull'
    return startTransfer({ direction, sources: req.paths, dest: req.destPath })
  }

  const cancel = async (id: string) => {
    await unwrap(zap.rsync.cancel(id))
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border p-2 flex flex-col gap-2">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label>Connection</Label>
            <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="w-48">
              <option value="">— select —</option>
              {conns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label>rsync flags</Label>
            <Input
              value={flagsRaw}
              onChange={(e) => {
                setFlagsRaw(e.target.value)
                setFlagsTouched(true)
              }}
            />
          </div>
          <Button onClick={() => transferButton('push')} disabled={!connectionId}>
            <ArrowRight size={14} /> Push
          </Button>
          <Button onClick={() => transferButton('pull')} disabled={!connectionId} variant="secondary">
            <ArrowLeft size={14} /> Pull
          </Button>
          {error && <div className="text-xs text-red-400 self-center">{error}</div>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {COMMON_FLAGS.map((f) => {
            const on = hasFlag(flagTokens, f.flag)
            return (
              <label
                key={f.flag}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none"
                title={f.desc}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    setFlagsRaw(toggleFlag(flagsRaw, f.flag))
                    setFlagsTouched(true)
                  }}
                />
                {f.label}
              </label>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 flex-1 min-h-0 divide-x divide-border">
        <FileBrowser
          kind="local"
          cwd={localCwd}
          onCwdChange={setLocalCwd}
          selected={localSel}
          onSelectionChange={setLocalSel}
          entries={localEntries}
          setEntries={setLocalEntries}
          onTransferRequest={handleDrop}
          refreshSignal={localRefreshTick}
        />
        <FileBrowser
          kind="remote"
          connectionId={connectionId}
          cwd={remoteCwd}
          onCwdChange={setRemoteCwd}
          selected={remoteSel}
          onSelectionChange={setRemoteSel}
          entries={remoteEntries}
          setEntries={setRemoteEntries}
          sep="/"
          onTransferRequest={handleDrop}
          refreshSignal={remoteRefreshTick}
        />
      </div>
      <div className="border-t border-border p-2 max-h-48 overflow-auto">
        <div className="text-xs text-muted-foreground mb-1">rsync jobs</div>
        {jobs.length === 0 && <div className="text-xs text-muted-foreground italic">No jobs.</div>}
        {jobs.map((j) => (
          <div key={j.id} className="flex flex-col py-0.5 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2 text-xs">
              <Badge
                variant={
                  j.status === 'done'
                    ? 'success'
                    : j.status === 'error'
                    ? 'error'
                    : j.status === 'cancelled'
                    ? 'muted'
                    : 'default'
                }
              >
                {j.status}
              </Badge>
              <span className="mono truncate flex-1">
                {j.direction === 'push' ? '↑' : '↓'} {j.source} → {j.dest}
              </span>
              {j.status === 'running' && (
                <Button size="icon" variant="ghost" onClick={() => cancel(j.id)}>
                  <Square size={12} />
                </Button>
              )}
            </div>
            {j.progress && j.status === 'running' && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-1">
                {j.progress.file && (
                  <span className="mono truncate max-w-[260px]" title={j.progress.file}>
                    {j.progress.file}
                  </span>
                )}
                <span>{j.progress.pct}%</span>
                <span>{j.progress.rate}</span>
                <span>ETA {j.progress.eta}</span>
                {/* a thin progress bar */}
                <div className="flex-1 h-1 bg-secondary rounded">
                  <div
                    className="h-full bg-emerald-400 rounded transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, j.progress.pct))}%` }}
                  />
                </div>
              </div>
            )}
            {j.binary && j.argv && (
              <details className="pl-1 pt-0.5">
                <summary className="text-[11px] text-muted-foreground cursor-pointer select-none hover:text-foreground">
                  show command
                </summary>
                <pre className="mono text-[11px] whitespace-pre-wrap bg-secondary/40 border border-border rounded p-2 mt-1 max-h-40 overflow-auto select-text">
                  {formatArgv(j.binary, j.argv)}
                </pre>
              </details>
            )}
            {j.status === 'error' && j.stderr && (
              <details className="pl-1 pt-0.5" open>
                <summary className="text-[11px] text-red-300 cursor-pointer select-none">
                  {(j.exitCode != null ? `exit ${j.exitCode} — ` : '') + 'show error output'}
                </summary>
                <pre className="mono text-[11px] whitespace-pre-wrap bg-red-500/5 border border-red-500/30 rounded p-2 mt-1 max-h-40 overflow-auto select-text">
                  {j.stderr}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

