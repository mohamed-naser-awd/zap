import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import type { Command, CommandArg } from '@shared/types'
import { useStore } from '@renderer/store'

type Draft = Omit<Command, 'id'> & { id?: string }

const emptyDraft = (): Draft => ({
  slug: '',
  label: '',
  body: '',
  description: '',
  kind: 'text',
  args: [],
  workflowId: ''
})

export default function CommandsView() {
  const store = useStore()
  const items = store.commands
  const workflows = store.workflows
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const kind = draft.kind ?? 'text'
  const args = draft.args ?? []

  const save = async () => {
    setError('')
    try {
      if (editing) {
        await store.updateCommand({ ...draft, id: editing } as Command)
      } else {
        await store.createCommand(draft)
      }
      setDraft(emptyDraft())
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const startEdit = (c: Command) => {
    setEditing(c.id)
    setDraft({
      slug: c.slug,
      label: c.label,
      body: c.body,
      description: c.description,
      kind: c.kind ?? 'text',
      args: c.args ?? [],
      workflowId: c.workflowId ?? ''
    })
  }

  const remove = async (id: string) => {
    await store.deleteCommand(id)
    if (editing === id) {
      setEditing(null)
      setDraft(emptyDraft())
    }
  }

  const setArg = (i: number, patch: Partial<CommandArg>) =>
    setDraft({ ...draft, args: args.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  const addArg = () => setDraft({ ...draft, args: [...args, { name: '', label: '' }] })
  const removeArg = (i: number) => setDraft({ ...draft, args: args.filter((_, j) => j !== i) })

  const workflowName = (id?: string) => workflows.find((w) => w.id === id)?.name

  return (
    <div className="h-full overflow-auto p-4 grid grid-cols-[1fr_360px] gap-4">
      <div className="space-y-2 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Slash commands</h2>
          <div className="text-xs text-muted-foreground">
            Inserted via <code>/slug</code> in the terminal
          </div>
        </div>
        <div className="space-y-1.5">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground p-2">No commands yet.</div>
          )}
          {items.map((c) => (
            <Card key={c.id} className="hover:border-ring transition-colors cursor-pointer" onClick={() => startEdit(c)}>
              <CardContent className="flex items-start justify-between py-2.5 px-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground">/{c.slug}</code>
                    <span className="font-medium text-sm">{c.label}</span>
                    {c.kind === 'workflow' && (
                      <Badge variant="muted">workflow: {workflowName(c.workflowId) ?? '?'}</Badge>
                    )}
                  </div>
                  {c.kind === 'workflow' ? (
                    <div className="text-[11px] text-muted-foreground">Runs a workflow</div>
                  ) : (
                    <div className="mono text-[11px] text-muted-foreground truncate">{c.body}</div>
                  )}
                  {c.kind !== 'workflow' && c.args && c.args.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      args: {c.args.map((a) => a.name).join(', ')}
                    </div>
                  )}
                  {c.description && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{c.description}</div>
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
          <CardTitle>{editing ? 'Edit command' : 'New command'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            <Label>Slug</Label>
            <Input
              value={draft.slug}
              placeholder="deploy-prod"
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Label</Label>
            <Input
              value={draft.label}
              placeholder="Deploy to prod"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <Select
              value={kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as Command['kind'] })}
            >
              <option value="text">Insert text</option>
              <option value="workflow">Run workflow</option>
            </Select>
          </div>

          {kind === 'workflow' ? (
            <div className="space-y-1">
              <Label>Workflow</Label>
              <Select
                value={draft.workflowId ?? ''}
                onChange={(e) => setDraft({ ...draft, workflowId: e.target.value })}
              >
                <option value="">Select a workflow…</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <div className="text-[11px] text-muted-foreground">
                Choosing the command runs this workflow; its inputs are prompted first.
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Body (inserted at the prompt)</Label>
                <Textarea
                  rows={5}
                  value={draft.body}
                  placeholder="sudo systemctl restart {{ service }}"
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Arguments</Label>
                  <Button size="sm" variant="ghost" onClick={addArg}>
                    <Plus size={14} /> Add
                  </Button>
                </div>
                {args.length === 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Add fields, then reference them in the body with{' '}
                    <code>{'{{ name }}'}</code>. They're prompted when the command is chosen.
                  </div>
                )}
                {args.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      className="mono"
                      value={a.name}
                      placeholder="name"
                      onChange={(e) => setArg(i, { name: e.target.value })}
                    />
                    <Input
                      value={a.label}
                      placeholder="Label"
                      onChange={(e) => setArg(i, { label: e.target.value })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeArg(i)}>
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Input
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex gap-2">
            <Button onClick={save} size="sm">
              <Plus size={14} /> {editing ? 'Save' : 'Create'}
            </Button>
            {editing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(null)
                  setDraft(emptyDraft())
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
