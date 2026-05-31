import { useEffect, useState } from 'react'
import { Square, Plus, Star, Trash2, Play } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { Tunnel, TunnelHistoryEntry, TunnelSpec } from '@shared/types'
import { useStore } from '@renderer/store'

function specSummary(spec: TunnelSpec): string {
  if (spec.kind === 'dynamic') return `SOCKS ${spec.localHost}:${spec.localPort}`
  const flag = spec.kind === 'local' ? '-L' : '-R'
  return `${flag} ${spec.localHost}:${spec.localPort} → ${spec.remoteHost}:${spec.remotePort}`
}

const emptySpec: TunnelSpec = {
  kind: 'local',
  localHost: '127.0.0.1',
  localPort: 8080,
  remoteHost: 'localhost',
  remotePort: 80
}

export default function TunnelsView() {
  const store = useStore()
  const conns = store.connections
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [connectionId, setConnectionId] = useState('')
  const [spec, setSpec] = useState<TunnelSpec>(emptySpec)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!connectionId && conns[0]) setConnectionId(conns[0].id)
  }, [conns, connectionId])

  useEffect(() => {
    unwrap(zap.tunnels.list()).then(setTunnels)
    const off = zap.tunnels.onStatus((t) => {
      setTunnels((prev) => {
        const i = prev.findIndex((x) => x.id === t.id)
        if (t.status === 'stopped' || t.status === 'error') {
          return prev.filter((x) => x.id !== t.id).concat(t.status === 'error' ? [t] : [])
        }
        if (i < 0) return [...prev, t]
        const next = prev.slice()
        next[i] = t
        return next
      })
    })
    return off
  }, [])

  const start = async () => {
    setError('')
    try {
      await unwrap(zap.tunnels.start({ connectionId, spec }))
      // Capture into history so the user can relaunch without re-filling the form.
      store.upsertTunnelHistory(connectionId, spec).catch(() => undefined)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const stop = async (id: string) => {
    await unwrap(zap.tunnels.stop(id))
  }

  /** Relaunch a tunnel from a history entry. Bumps `lastUsedAt` via upsert. */
  const relaunchFromHistory = async (entry: TunnelHistoryEntry) => {
    setError('')
    try {
      await unwrap(zap.tunnels.start({ connectionId: entry.connectionId, spec: entry.spec }))
      store.upsertTunnelHistory(entry.connectionId, entry.spec).catch(() => undefined)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /** Click on a recent row body — pre-fill the form so the user can tweak. */
  const editFromHistory = (entry: TunnelHistoryEntry) => {
    setConnectionId(entry.connectionId)
    setSpec({ ...entry.spec })
  }

  return (
    <div className="h-full overflow-auto p-4 grid grid-cols-[1fr_360px] gap-4">
      <div className="space-y-2 min-w-0">
        <h2 className="text-lg font-semibold">Active tunnels</h2>
        <div className="space-y-1.5">
          {tunnels.length === 0 && <div className="text-sm text-muted-foreground p-2">No active tunnels.</div>}
          {tunnels.map((t) => {
            const conn = conns.find((c) => c.id === t.connectionId)
            return (
              <Card key={t.id}>
                <CardContent className="flex items-start justify-between py-2.5 px-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          t.status === 'running' ? 'success' : t.status === 'error' ? 'error' : 'muted'
                        }
                      >
                        {t.status}
                      </Badge>
                      <span className="text-sm font-medium">{conn?.name ?? t.connectionId}</span>
                    </div>
                    <div className="mono text-[11px] text-muted-foreground">
                      {specSummary(t.spec)}
                    </div>
                    {t.error && <div className="text-[11px] text-red-400 mono">{t.error}</div>}
                  </div>
                  {(t.status === 'starting' || t.status === 'running') && (
                    <Button size="icon" variant="ghost" onClick={() => stop(t.id)}>
                      <Square size={14} />
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Recent — quick-relaunch a previously-started tunnel without re-filling the form. */}
        <h2 className="text-lg font-semibold pt-3">Recent</h2>
        <div className="space-y-1.5">
          {store.tunnelHistory.length === 0 && (
            <div className="text-sm text-muted-foreground p-2">No recent tunnels yet.</div>
          )}
          {store.tunnelHistory.map((entry) => {
            const conn = conns.find((c) => c.id === entry.connectionId)
            const orphan = !conn
            return (
              <Card
                key={entry.id}
                className={cn(
                  'hover:border-ring transition-colors cursor-pointer',
                  orphan && 'opacity-60'
                )}
                title={orphan ? 'connection removed' : 'Click to load into the form on the right'}
                onClick={() => !orphan && editFromHistory(entry)}
              >
                <CardContent className="flex items-start justify-between gap-2 py-2 px-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {conn?.name ?? '(connection removed)'}
                      </span>
                    </div>
                    <div className="mono text-[11px] text-muted-foreground">
                      {specSummary(entry.spec)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={entry.pinned ? 'Unpin' : 'Pin'}
                      onClick={() => store.setTunnelHistoryPinned(entry.id, !entry.pinned)}
                    >
                      <Star
                        size={14}
                        className={cn(
                          entry.pinned ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'
                        )}
                      />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={orphan ? 'connection removed' : 'Relaunch'}
                      disabled={orphan}
                      onClick={() => relaunchFromHistory(entry)}
                    >
                      <Play size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove from history"
                      onClick={() => store.deleteTunnelHistory(entry.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Card className="self-start sticky top-0">
        <CardHeader>
          <CardTitle>New tunnel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            <Label>Connection</Label>
            <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
              <option value="">— select —</option>
              {conns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <Select
              value={spec.kind}
              onChange={(e) => setSpec({ ...spec, kind: e.target.value as TunnelSpec['kind'] })}
            >
              <option value="local">Local forward (-L)</option>
              <option value="remote">Remote forward (-R)</option>
              <option value="dynamic">SOCKS (-D)</option>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div className="space-y-1">
              <Label>Local host</Label>
              <Input value={spec.localHost} onChange={(e) => setSpec({ ...spec, localHost: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Local port</Label>
              <Input
                type="number"
                value={spec.localPort}
                onChange={(e) => setSpec({ ...spec, localPort: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          {spec.kind !== 'dynamic' && (
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div className="space-y-1">
                <Label>Remote host</Label>
                <Input
                  value={spec.remoteHost ?? ''}
                  onChange={(e) => setSpec({ ...spec, remoteHost: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Remote port</Label>
                <Input
                  type="number"
                  value={spec.remotePort ?? 0}
                  onChange={(e) => setSpec({ ...spec, remotePort: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          <Button onClick={start} disabled={!connectionId} size="sm">
            <Plus size={14} /> Start
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
