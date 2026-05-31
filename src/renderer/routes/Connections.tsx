import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { Connection, Project } from '@shared/types'
import { PathInput } from '@renderer/components/PathInput'
import { colorStyles, PROJECT_COLOR_KEYS } from '@renderer/lib/utils'
import { useStore } from '@renderer/store'
import { usePrompt } from '@renderer/lib/usePrompt'

type Draft = Omit<Connection, 'id'> & { id?: string; _password?: string; _passphrase?: string }

const emptyDraft = (): Draft => ({
  name: '',
  host: '',
  port: 22,
  user: '',
  useAgent: false,
  identityKey: undefined,
  hasPassword: false,
  runOnConnect: '',
  projectId: undefined
})

const NEW_PROJECT_SENTINEL = '__new_project__'

function authBadge(c: Connection): string {
  const parts: string[] = []
  if (c.useAgent) parts.push('agent')
  if (c.identityKey) parts.push('key')
  if (c.hasPassword) parts.push('password')
  return parts.length ? parts.join(' + ') : 'none'
}

export default function ConnectionsView() {
  const store = useStore()
  const prompt = usePrompt()
  const items = store.connections
  const workflows = store.workflows
  const projects = store.projects

  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [secretOnFile, setSecretOnFile] = useState<{ password: boolean; passphrase: boolean }>({
    password: false,
    passphrase: false
  })

  const onProjectPick = async (raw: string) => {
    if (raw === NEW_PROJECT_SENTINEL) {
      const name = (await prompt('New project name'))?.trim()
      if (!name) return
      try {
        const created = await store.createProject({ name })
        setDraft({ ...draft, projectId: created.id })
      } catch (e) {
        setError((e as Error).message)
      }
      return
    }
    setDraft({ ...draft, projectId: raw || undefined })
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setSecretOnFile({ password: false, passphrase: false })
    setError('')
  }

  const save = async () => {
    setError('')
    try {
      const { _password, _passphrase, ...rest } = draft
      const cleaned: Omit<Connection, 'id'> = {
        ...rest,
        runOnConnect: rest.runOnConnect || undefined,
        identityKey: rest.identityKey ? { ...rest.identityKey } : undefined
      }
      let saved: Connection
      if (editing) {
        saved = await store.updateConnection({ ...(cleaned as Connection), id: editing })
      } else {
        saved = await store.createConnection(cleaned)
      }

      // Password slot: write if a new value was typed; delete if user unchecked the toggle.
      if (draft.hasPassword && _password) {
        await unwrap(zap.secrets.set(saved.id, 'password', _password))
      } else if (!draft.hasPassword && secretOnFile.password) {
        await unwrap(zap.secrets.delete(saved.id, 'password'))
      }

      // Passphrase slot: same pattern, gated by identityKey + hasPassphrase.
      const wantsPassphrase = !!draft.identityKey?.hasPassphrase
      if (wantsPassphrase && _passphrase) {
        await unwrap(zap.secrets.set(saved.id, 'passphrase', _passphrase))
      } else if (!wantsPassphrase && secretOnFile.passphrase) {
        await unwrap(zap.secrets.delete(saved.id, 'passphrase'))
      }

      cancelEdit()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const startEdit = async (c: Connection) => {
    setEditing(c.id)
    setDraft({
      name: c.name,
      host: c.host,
      port: c.port,
      user: c.user,
      useAgent: c.useAgent,
      identityKey: c.identityKey ? { ...c.identityKey } : undefined,
      hasPassword: c.hasPassword,
      runOnConnect: c.runOnConnect ?? '',
      projectId: c.projectId
    })
    setSecretOnFile({ password: false, passphrase: false })
    const [pw, pp] = await Promise.all([
      zap.secrets.get(c.id, 'password'),
      zap.secrets.get(c.id, 'passphrase')
    ])
    setSecretOnFile({
      password: pw.ok && !!pw.value,
      passphrase: pp.ok && !!pp.value
    })
  }

  const remove = async (id: string) => {
    await store.deleteConnection(id)
    if (editing === id) cancelEdit()
  }

  const toggleKey = (on: boolean) => {
    if (on) {
      setDraft({ ...draft, identityKey: draft.identityKey ?? { path: '', hasPassphrase: false } })
    } else {
      setDraft({ ...draft, identityKey: undefined })
    }
  }

  const noAuthSelected = !draft.useAgent && !draft.identityKey && !draft.hasPassword

  return (
    <div className="h-full overflow-auto p-4 grid grid-cols-[1fr_400px] gap-4">
      <div className="space-y-2 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connections</h2>
        </div>
        <div className="space-y-1.5">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground p-2">
              No connections yet. Use the form on the right to add one.
            </div>
          )}
          {items.map((c) => (
            <Card
              key={c.id}
              className="hover:border-ring transition-colors cursor-pointer"
              onClick={() => startEdit(c)}
            >
              <CardContent className="flex items-start justify-between py-2.5 px-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <Badge variant="muted">{authBadge(c)}</Badge>
                    {c.projectId && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            colorStyles(projects.find((p) => p.id === c.projectId)?.color).dot
                          }`}
                        />
                        {projects.find((p) => p.id === c.projectId)?.name ?? '(unknown)'}
                      </span>
                    )}
                  </div>
                  <div className="mono text-[11px] text-muted-foreground">
                    {c.user}@{c.host}:{c.port}
                  </div>
                  {c.runOnConnect && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      runs workflow: {workflows.find((w) => w.id === c.runOnConnect)?.name ?? c.runOnConnect}
                    </div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(c.id)
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="self-start sticky top-0">
        <CardHeader>
          <CardTitle>{editing ? 'Edit connection' : 'New connection'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div className="space-y-1">
              <Label>Host</Label>
              <Input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Port</Label>
              <Input
                type="number"
                value={draft.port}
                onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 22 })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>User</Label>
            <Input value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
          </div>

          <div className="border-t border-border pt-2 mt-1 space-y-3">
            <Label>Authentication</Label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.useAgent}
                onChange={(e) => setDraft({ ...draft, useAgent: e.target.checked })}
              />
              Use SSH agent
            </label>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!draft.identityKey}
                  onChange={(e) => toggleKey(e.target.checked)}
                />
                Use private key
              </label>
              {draft.identityKey && (
                <div className="space-y-1.5 pl-6">
                  <div className="space-y-1">
                    <Label>Path</Label>
                    <PathInput
                      mode="file"
                      value={draft.identityKey.path}
                      placeholder="C:\Users\you\.ssh\id_ed25519"
                      title="Pick private key"
                      onChange={(v) =>
                        setDraft({
                          ...draft,
                          identityKey: { ...draft.identityKey!, path: v }
                        })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={draft.identityKey.hasPassphrase}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          identityKey: { ...draft.identityKey!, hasPassphrase: e.target.checked }
                        })
                      }
                    />
                    Key has passphrase
                  </label>
                  {draft.identityKey.hasPassphrase && (
                    <div className="space-y-1">
                      <Label>Passphrase (stored in OS keychain)</Label>
                      <Input
                        type="password"
                        value={draft._passphrase ?? ''}
                        placeholder={editing ? 'leave blank to keep existing' : ''}
                        onChange={(e) => setDraft({ ...draft, _passphrase: e.target.value })}
                      />
                      {editing && secretOnFile.passphrase && (
                        <div className="text-[11px] text-emerald-300">passphrase on file ✓ — leave blank to keep</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.hasPassword}
                  onChange={(e) => setDraft({ ...draft, hasPassword: e.target.checked })}
                />
                Store user / SSH password
              </label>
              {draft.hasPassword && (
                <div className="space-y-1 pl-6">
                  <Label>Password (stored in OS keychain)</Label>
                  <Input
                    type="password"
                    value={draft._password ?? ''}
                    placeholder={editing ? 'leave blank to keep existing' : ''}
                    onChange={(e) => setDraft({ ...draft, _password: e.target.value })}
                  />
                  {editing && secretOnFile.password && (
                    <div className="text-[11px] text-emerald-300">password on file ✓ — leave blank to keep</div>
                  )}
                </div>
              )}
            </div>

            {noAuthSelected && (
              <div className="text-[11px] text-amber-300">
                No auth method selected — ssh will fall back to your system's ~/.ssh/config.
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-border pt-2 mt-1">
            <Label>Project</Label>
            <div className="flex items-center gap-2">
              {draft.projectId && (
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    colorStyles(projects.find((p) => p.id === draft.projectId)?.color).dot
                  }`}
                />
              )}
              <Select value={draft.projectId ?? ''} onChange={(e) => onProjectPick(e.target.value)}>
                <option value="">All (no project)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW_PROJECT_SENTINEL}>+ new project…</option>
              </Select>
            </div>
            {draft.projectId && (
              <div className="flex items-center gap-1 pt-1">
                <span className="text-[11px] text-muted-foreground mr-1">color:</span>
                {[undefined, ...PROJECT_COLOR_KEYS].map((k) => {
                  const proj = projects.find((p) => p.id === draft.projectId)
                  if (!proj) return null
                  const active = (proj.color ?? undefined) === k
                  return (
                    <button
                      key={k ?? 'none'}
                      type="button"
                      title={k ?? 'no color'}
                      className={`h-4 w-4 rounded-full border ${
                        k ? colorStyles(k).dot : 'bg-transparent border-muted-foreground'
                      } ${active ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/40' : 'border-border'}`}
                      onClick={async () => {
                        const next: Project = { ...proj, color: k }
                        try {
                          await store.updateProject(next)
                        } catch (err) {
                          setError((err as Error).message)
                        }
                      }}
                    />
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-border pt-2 mt-1">
            <Label>Run on connect (workflow)</Label>
            <Select
              value={draft.runOnConnect ?? ''}
              onChange={(e) => setDraft({ ...draft, runOnConnect: e.target.value })}
            >
              <option value="">— none —</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex gap-2">
            <Button onClick={save} size="sm">
              <Plus size={14} /> {editing ? 'Save' : 'Create'}
            </Button>
            {editing && (
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
