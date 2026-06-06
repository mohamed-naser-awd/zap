import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Folder, FileIcon, RefreshCw, Loader2, Download } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn, formatBytes } from '@renderer/lib/utils'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { FsEntry } from '@shared/types'

export type TransferRequest = {
  from: 'local' | 'remote'
  to: 'local' | 'remote'
  paths: string[]
  destPath: string
}

export type FileBrowserProps = {
  kind: 'local' | 'remote'
  connectionId?: string
  cwd: string
  onCwdChange: (path: string) => void
  selected: Set<string>
  onSelectionChange: (next: Set<string>) => void
  entries: FsEntry[]
  setEntries: (e: FsEntry[]) => void
  sep?: string
  onTransferRequest?: (req: TransferRequest) => void
  /** Bumped by the parent to force a re-list of the current directory (e.g. after an rsync transfer lands here). */
  refreshSignal?: number
}

// Carries the JSON payload. Only readable in `drop` (browsers blank getData()
// during dragover for security).
const DRAG_MIME = 'application/x-zap-paths'

// Type-marker MIMEs that ARE visible in `dataTransfer.types` during dragover,
// so we can tell the source pane without reading the payload yet.
const fromMime = (k: 'local' | 'remote') => `application/x-zap-from-${k}`

type DragPayload = { from: 'local' | 'remote'; paths: string[] }

function readDrag(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && (parsed.from === 'local' || parsed.from === 'remote') && Array.isArray(parsed.paths)) {
      return parsed as DragPayload
    }
  } catch {
    /* ignore */
  }
  return null
}

function hasTypeMarker(e: React.DragEvent, marker: string): boolean {
  // dataTransfer.types is a DOMStringList-like; spreading is the safest read.
  for (const t of Array.from(e.dataTransfer.types)) {
    if (t === marker) return true
  }
  return false
}

function externalFilePaths(e: React.DragEvent): string[] {
  // Electron sets a real filesystem path on File objects from OS drags.
  // (Up through Electron 31 the .path attribute is supported on the renderer File.)
  const out: string[] = []
  const files = e.dataTransfer.files
  for (let i = 0; i < files.length; i++) {
    const p = (files[i] as unknown as { path?: string }).path
    if (p) out.push(p)
  }
  return out
}

export function FileBrowser({
  kind,
  connectionId,
  cwd,
  onCwdChange,
  selected,
  onSelectionChange,
  entries,
  setEntries,
  onTransferRequest,
  refreshSignal
}: FileBrowserProps) {
  const [pathInput, setPathInput] = useState(cwd)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // `''` = pane background highlight, `<path>` = a folder row, `null` = no highlight.
  const [dropHover, setDropHover] = useState<string | null>(null)
  // Per-row "preparing for external drag" indicator (set of remote paths
  // currently being downloaded to temp).
  const [stagingPaths, setStagingPaths] = useState<Set<string>>(new Set())
  // Toast-like notice when a remote download finishes but the drag has
  // already ended — tells the user to drag again to copy to OS.
  const [readyForDrag, setReadyForDrag] = useState<string | null>(null)
  // Keyboard navigation: index of the focused entry (independent of selection).
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([])

  useEffect(() => {
    setPathInput(cwd)
  }, [cwd])

  const reload = async (path: string) => {
    setError('')
    setLoading(true)
    try {
      if (kind === 'local') {
        const res = await unwrap(zap.fs.list(path))
        setEntries(res.entries)
        onCwdChange(res.path)
      } else {
        if (!connectionId) {
          setEntries([])
          return
        }
        const res = await unwrap(zap.sftp.list(connectionId, path))
        setEntries(res)
        onCwdChange(path)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload(cwd).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  // Parent bumps `refreshSignal` to re-list the current directory (e.g. after an
  // rsync transfer lands in this pane). Skip the initial mount (tick 0).
  useEffect(() => {
    if (!refreshSignal) return
    reload(cwd).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  // Reset focus & row-ref cache when the directory listing changes.
  useEffect(() => {
    setFocusIdx(null)
    rowRefs.current = []
  }, [entries])

  // Auto-scroll the focused row into view as the user moves through the list.
  useEffect(() => {
    if (focusIdx == null) return
    rowRefs.current[focusIdx]?.scrollIntoView({ block: 'nearest' })
  }, [focusIdx])

  const goUp = () => {
    const norm = cwd.replace(/[\\/]+$/, '')
    let parent: string
    if (kind === 'local') {
      const i = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
      parent = i > 0 ? norm.slice(0, i) : norm.slice(0, 1) === '/' ? '/' : norm
    } else {
      const i = norm.lastIndexOf('/')
      parent = i > 0 ? norm.slice(0, i) : '/'
    }
    reload(parent)
  }

  const toggle = (path: string, multi: boolean) => {
    const next = new Set(multi ? selected : [])
    if (selected.has(path)) next.delete(path)
    else next.add(path)
    onSelectionChange(next)
  }

  const enter = (entry: FsEntry) => {
    if (entry.isDir) {
      const joined =
        kind === 'local'
          ? entry.path
          : (cwd.endsWith('/') ? cwd : cwd + '/') + entry.name
      reload(joined)
    }
  }

  /**
   * Pane-level keyboard handler. Activated when the pane (or one of its rows)
   * has focus. Letter keys jump to the first entry starting with that letter;
   * the four arrow keys provide Explorer-style navigation.
   */
  const onPaneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (loading) return
    // Don't intercept keystrokes meant for the path bar input.
    const target = e.target as HTMLElement
    if (target?.matches?.('input, textarea')) return
    if (entries.length === 0) return

    const k = e.key

    if (k === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((i) => Math.min(entries.length - 1, (i ?? -1) + 1))
      return
    }
    if (k === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((i) => Math.max(0, (i ?? entries.length) - 1))
      return
    }
    if (k === 'ArrowRight' || k === 'Enter') {
      if (focusIdx == null) return
      const cur = entries[focusIdx]
      if (cur?.isDir) {
        e.preventDefault()
        enter(cur)
      }
      return
    }
    if (k === 'ArrowLeft' || k === 'Backspace') {
      e.preventDefault()
      goUp()
      return
    }

    // Letter / digit jump: find the next entry whose name starts with this
    // character (case-insensitive), wrapping around. Repeat presses cycle
    // through matches.
    if (
      k.length === 1 &&
      /^[a-z0-9._-]$/i.test(k) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      const ch = k.toLowerCase()
      const start = (focusIdx ?? -1) + 1
      const n = entries.length
      for (let off = 0; off < n; off++) {
        const i = (start + off) % n
        if (entries[i].name.toLowerCase().startsWith(ch)) {
          setFocusIdx(i)
          break
        }
      }
    }
  }

  /** Is the current drag operation something this pane should accept? */
  const acceptsDrag = (e: React.DragEvent): { internal: boolean; external: boolean } => {
    const otherKind = kind === 'local' ? 'remote' : 'local'
    const internal = hasTypeMarker(e, fromMime(otherKind))
    // OS-file drag has the special 'Files' entry in types.
    const external = hasTypeMarker(e, 'Files')
    return { internal, external }
  }

  const onRowDragStart = (e: React.DragEvent, entry: FsEntry) => {
    // Dragging a row that's part of the current selection drags the whole
    // selection; dragging an unselected row drags just that one.
    const paths = selected.has(entry.path) ? Array.from(selected) : [entry.path]
    const payload: DragPayload = { from: kind, paths }
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.setData(fromMime(kind), '1')
    e.dataTransfer.effectAllowed = 'copy'

    // Also initiate an OS-level drag so the user can drop on Explorer, the
    // desktop, or any non-zap target. For local files this is synchronous
    // (the OS already has the path). For remote files, the main process
    // downloads to a temp dir first and then calls webContents.startDrag —
    // if the user is still holding the mouse, the OS drag picks up right
    // where the HTML5 drag was.
    if (kind === 'local') {
      zap.dragout.fromLocal(paths).catch(() => undefined)
    } else if (kind === 'remote' && connectionId) {
      const items = entries
        .filter((en) => paths.includes(en.path))
        .map((en) => ({ path: en.path, isDir: en.isDir }))
      if (items.length === 0) return
      setStagingPaths((prev) => {
        const next = new Set(prev)
        for (const it of items) next.add(it.path)
        return next
      })
      zap.dragout
        .fromRemote(connectionId, items)
        .then((r) => {
          if (r.ok && !r.value.startedDrag) {
            // Download finished but the user already released the mouse;
            // surface a "ready — drag again" hint and reveal where it landed.
            setReadyForDrag(r.value.dir)
            setTimeout(() => setReadyForDrag(null), 6000)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          setStagingPaths((prev) => {
            const next = new Set(prev)
            for (const it of items) next.delete(it.path)
            return next
          })
        })
    }
  }

  const onRowDragOver = (e: React.DragEvent, entry: FsEntry) => {
    if (!entry.isDir) return
    const { internal, external } = acceptsDrag(e)
    if (!internal && !external) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropHover(entry.path)
  }

  const onRowDragLeave = (entry: FsEntry) => {
    if (dropHover === entry.path) setDropHover(null)
  }

  const onRowDrop = (e: React.DragEvent, entry: FsEntry) => {
    if (!entry.isDir) return
    e.preventDefault()
    e.stopPropagation()
    setDropHover(null)

    const internal = readDrag(e)
    if (internal) {
      if (internal.from === kind) return
      onTransferRequest?.({
        from: internal.from,
        to: kind,
        paths: internal.paths,
        destPath: entry.path
      })
      return
    }
    const ext = externalFilePaths(e)
    if (ext.length === 0) return
    // OS files are local; if this pane is local too, it'd be a no-op (would-be self-copy).
    if (kind === 'local') return
    onTransferRequest?.({ from: 'local', to: kind, paths: ext, destPath: entry.path })
  }

  const onPaneDragOver = (e: React.DragEvent) => {
    const { internal, external } = acceptsDrag(e)
    if (!internal && !external) return
    // OS files on the local pane: don't auto-copy onto itself.
    if (!internal && external && kind === 'local') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHover('')
  }

  const onPaneDragLeave = (e: React.DragEvent) => {
    // Only clear when the pointer truly leaves the pane (not when crossing into children).
    if (e.currentTarget === e.target) setDropHover(null)
  }

  const onPaneDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropHover(null)

    const internal = readDrag(e)
    if (internal) {
      if (internal.from === kind) return
      onTransferRequest?.({ from: internal.from, to: kind, paths: internal.paths, destPath: cwd })
      return
    }
    const ext = externalFilePaths(e)
    if (ext.length === 0) return
    if (kind === 'local') return
    onTransferRequest?.({ from: 'local', to: kind, paths: ext, destPath: cwd })
  }

  return (
    <div
      ref={paneRef}
      tabIndex={0}
      onKeyDown={onPaneKeyDown}
      className={cn(
        'relative flex flex-col h-full min-h-0 transition-colors outline-none',
        dropHover === '' && !loading && 'ring-1 ring-inset ring-emerald-400/60'
      )}
      onDragOver={loading ? undefined : onPaneDragOver}
      onDragLeave={loading ? undefined : onPaneDragLeave}
      onDrop={loading ? undefined : onPaneDrop}
    >
      <div className="flex items-center gap-1 p-2 border-b border-border">
        <Button size="icon" variant="ghost" onClick={goUp} title="Up" disabled={loading}>
          <ArrowUp size={14} />
        </Button>
        <Input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') reload(pathInput)
          }}
          disabled={loading}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => reload(pathInput)}
          title={loading ? 'Loading…' : 'Refresh'}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {error && <div className="text-xs text-red-400 p-2">{error}</div>}
        {readyForDrag && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-200 bg-emerald-500/10 border-b border-emerald-500/30 px-2 py-1">
            <Download size={12} />
            <span>
              File ready in temp — drag the row again to drop on Explorer / desktop.
            </span>
            <button
              className="ml-auto underline underline-offset-2 hover:text-emerald-100"
              onClick={() => {
                // Open the staged folder so the user can also drag from there.
                window.zap.fs
                  .list(readyForDrag)
                  .catch(() => undefined)
                setReadyForDrag(null)
              }}
            >
              dismiss
            </button>
          </div>
        )}
        <table className="w-full text-xs">
          <tbody>
            {entries.map((it, idx) => {
              const isSel = selected.has(it.path)
              const isDropTarget = dropHover === it.path
              const isStaging = stagingPaths.has(it.path)
              const isFocused = focusIdx === idx
              return (
                <tr
                  key={it.path}
                  ref={(el) => {
                    rowRefs.current[idx] = el
                  }}
                  draggable
                  className={cn(
                    'cursor-pointer border-b border-border/40 hover:bg-accent/40',
                    isSel && 'bg-accent text-accent-foreground',
                    isFocused && 'ring-1 ring-inset ring-foreground/40 bg-accent/30',
                    isDropTarget && 'bg-emerald-500/15 outline outline-1 outline-emerald-400/60'
                  )}
                  onClick={(e) => {
                    setFocusIdx(idx)
                    // Keep keyboard focus on the pane so subsequent keys are
                    // routed to our handler, not stolen by the row itself.
                    paneRef.current?.focus()
                    toggle(it.path, e.ctrlKey || e.metaKey || e.shiftKey)
                  }}
                  onDoubleClick={() => enter(it)}
                  onDragStart={(e) => onRowDragStart(e, it)}
                  onDragOver={(e) => onRowDragOver(e, it)}
                  onDragLeave={() => onRowDragLeave(it)}
                  onDrop={(e) => onRowDrop(e, it)}
                >
                  <td className="py-1 px-2 w-[18px]">
                    {it.isDir ? <Folder size={12} /> : <FileIcon size={12} />}
                  </td>
                  <td className="py-1 mono">
                    <span className="inline-flex items-center gap-1.5">
                      {it.name}
                      {isStaging && (
                        <Loader2
                          size={11}
                          className="animate-spin text-emerald-400 shrink-0"
                          aria-label="downloading to temp for external drag"
                        />
                      )}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-right text-muted-foreground">
                    {it.isDir ? '' : formatBytes(it.size)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {loading && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm cursor-wait"
          // Absorb clicks/drags so nothing underneath is interactable.
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'none'
          }}
          onDrop={(e) => e.preventDefault()}
        >
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {kind === 'remote' ? 'Loading remote…' : 'Loading…'}
          </span>
        </div>
      )}
    </div>
  )
}
