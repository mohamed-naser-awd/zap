import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@renderer/store'
import { Plus, Play, Trash2, ChevronLeft, Square } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { Connection, Step, Workflow, WorkflowInput, WorkflowRun } from '@shared/types'
import { StepEditor } from '@renderer/components/workflow/StepEditor'

const newStep = (type: Step['type']): Step => {
  const base = { id: crypto.randomUUID().slice(0, 8), name: `${type} step` }
  switch (type) {
    case 'local-shell':
      return { ...base, type, shell: 'bash', command: '' }
    case 'script':
      return { ...base, type, interpreter: '', scriptPath: '', args: [] }
    case 'ssh-exec':
      return { ...base, type, connectionId: '', command: '', captureOutput: true }
    case 'tunnel':
      return {
        ...base,
        type,
        action: 'start',
        connectionId: '',
        spec: { kind: 'local', localHost: '127.0.0.1', localPort: 8080, remoteHost: 'localhost', remotePort: 80 },
        holdOpen: true
      }
    case 'rsync':
      return { ...base, type, connectionId: '', direction: 'push', source: '', dest: '', flags: ['-avz', '--info=progress2'] }
    case 'send-to-terminal':
      return { ...base, type, terminalName: '', text: '', appendNewline: true, openIfMissing: true }
  }
}

const emptyWorkflow = (): Omit<Workflow, 'id'> => ({
  name: 'New workflow',
  description: '',
  inputs: [],
  steps: []
})

type Mode =
  | { name: 'list' }
  | { name: 'edit'; draft: Omit<Workflow, 'id'> & { id?: string } }
  | { name: 'run'; runId: string; workflow: Workflow }

export default function WorkflowsView() {
  const store = useStore()
  const items = store.workflows
  const conns = store.connections
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [mode, setMode] = useState<Mode>({ name: 'list' })

  const refreshRuns = async () => {
    setRuns(await unwrap(zap.workflows.listRuns()))
  }
  useEffect(() => {
    refreshRuns().catch(() => undefined)
  }, [])

  if (mode.name === 'edit') {
    return (
      <EditWorkflow
        draft={mode.draft}
        connections={conns}
        onCancel={() => setMode({ name: 'list' })}
        onSaved={async () => {
          await refreshRuns()
          setMode({ name: 'list' })
        }}
      />
    )
  }
  if (mode.name === 'run') {
    return (
      <RunWorkflow
        runId={mode.runId}
        workflow={mode.workflow}
        onClose={async () => {
          await refreshRuns()
          setMode({ name: 'list' })
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workflows</h2>
        <Button onClick={() => setMode({ name: 'edit', draft: emptyWorkflow() })}>
          <Plus size={14} /> New workflow
        </Button>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground p-2">No workflows yet.</div>
        )}
        {items.map((w) => (
          <Card key={w.id}>
            <CardContent className="flex items-start justify-between py-2.5 px-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{w.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {w.steps.length} step{w.steps.length === 1 ? '' : 's'} · {w.inputs.length} input{w.inputs.length === 1 ? '' : 's'}
                </div>
                {w.description && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">{w.description}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <RunButton workflow={w} onStarted={(runId) => setMode({ name: 'run', runId, workflow: w })} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode({ name: 'edit', draft: { ...w } })}
                >
                  Edit
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    await store.deleteWorkflow(w.id)
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {runs.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-4">Recent runs</h3>
          <div className="space-y-1">
            {runs.slice(0, 25).map((r) => {
              const wf = items.find((i) => i.id === r.workflowId)
              return (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:border-ring"
                  onClick={() =>
                    wf && setMode({ name: 'run', runId: r.id, workflow: wf })
                  }
                >
                  <CardContent className="flex items-center gap-2 py-2 px-3 text-xs">
                    <Badge
                      variant={
                        r.status === 'success'
                          ? 'success'
                          : r.status === 'failed'
                          ? 'error'
                          : r.status === 'cancelled'
                          ? 'muted'
                          : 'default'
                      }
                    >
                      {r.status}
                    </Badge>
                    <span className="font-medium">{wf?.name ?? r.workflowId}</span>
                    <span className="text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function RunButton({ workflow, onStarted }: { workflow: Workflow; onStarted: (runId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [vars, setVars] = useState<Record<string, string>>({})

  const start = async () => {
    const { runId } = await unwrap(zap.workflows.run({ id: workflow.id, vars }))
    setOpen(false)
    onStarted(runId)
  }

  if (workflow.inputs.length === 0) {
    return (
      <Button size="sm" onClick={start}>
        <Play size={14} /> Run
      </Button>
    )
  }

  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => {
          const defaults: Record<string, string> = {}
          for (const i of workflow.inputs) defaults[i.name] = i.default ?? ''
          setVars(defaults)
          setOpen(true)
        }}
      >
        <Play size={14} /> Run
      </Button>
    )
  }

  return (
    <div className="absolute right-6 mt-8 z-10 w-80">
      <Card>
        <CardHeader>
          <CardTitle>Run {workflow.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workflow.inputs.map((i) => (
            <div key={i.name} className="space-y-1">
              <Label>{i.label || i.name}</Label>
              {i.type === 'select' ? (
                <Select value={vars[i.name] ?? ''} onChange={(e) => setVars({ ...vars, [i.name]: e.target.value })}>
                  {(i.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : i.type === 'boolean' ? (
                <Select value={vars[i.name] ?? 'false'} onChange={(e) => setVars({ ...vars, [i.name]: e.target.value })}>
                  <option value="false">false</option>
                  <option value="true">true</option>
                </Select>
              ) : (
                <Input
                  type={i.type === 'secret' ? 'password' : 'text'}
                  value={vars[i.name] ?? ''}
                  onChange={(e) => setVars({ ...vars, [i.name]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" onClick={start}>
              Run
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type EditProps = {
  draft: Omit<Workflow, 'id'> & { id?: string }
  connections: Connection[]
  onCancel: () => void
  onSaved: () => void
}

function EditWorkflow({ draft: initial, connections, onCancel, onSaved }: EditProps) {
  const store = useStore()
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const [pickType, setPickType] = useState<Step['type']>('local-shell')

  const save = async () => {
    setError('')
    try {
      if (draft.id) {
        await store.updateWorkflow(draft as Workflow)
      } else {
        await store.createWorkflow(draft)
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const addStep = () => setDraft({ ...draft, steps: [...draft.steps, newStep(pickType)] })

  const updateStep = (i: number, next: Step) => {
    const steps = draft.steps.slice()
    steps[i] = next
    setDraft({ ...draft, steps })
  }

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= draft.steps.length) return
    const steps = draft.steps.slice()
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    setDraft({ ...draft, steps })
  }

  const removeStep = (i: number) => {
    const steps = draft.steps.slice()
    steps.splice(i, 1)
    setDraft({ ...draft, steps })
  }

  const updateInput = (i: number, next: WorkflowInput) => {
    const inputs = draft.inputs.slice()
    inputs[i] = next
    setDraft({ ...draft, inputs })
  }

  const removeInput = (i: number) => {
    const inputs = draft.inputs.slice()
    inputs.splice(i, 1)
    setDraft({ ...draft, inputs })
  }

  const addInput = () =>
    setDraft({
      ...draft,
      inputs: [...draft.inputs, { name: `var${draft.inputs.length + 1}`, label: '', type: 'string' }]
    })

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-lg font-semibold">{draft.id ? 'Edit workflow' : 'New workflow'}</h2>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <Button onClick={save}>Save</Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Inputs</CardTitle>
          <Button size="sm" variant="outline" onClick={addInput}>
            <Plus size={12} /> Add input
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.inputs.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No inputs.</div>
          )}
          {draft.inputs.map((inp, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_120px_1fr_30px] gap-2 items-end">
              <div className="space-y-1">
                <Label>name</Label>
                <Input value={inp.name} onChange={(e) => updateInput(i, { ...inp, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>label</Label>
                <Input value={inp.label} onChange={(e) => updateInput(i, { ...inp, label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>type</Label>
                <Select
                  value={inp.type}
                  onChange={(e) => updateInput(i, { ...inp, type: e.target.value as WorkflowInput['type'] })}
                >
                  <option value="string">string</option>
                  <option value="secret">secret</option>
                  <option value="select">select</option>
                  <option value="boolean">boolean</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{inp.type === 'select' ? 'options (comma)' : 'default'}</Label>
                {inp.type === 'select' ? (
                  <Input
                    value={(inp.options ?? []).join(', ')}
                    onChange={(e) =>
                      updateInput(i, {
                        ...inp,
                        options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                      })
                    }
                  />
                ) : (
                  <Input
                    value={inp.default ?? ''}
                    onChange={(e) => updateInput(i, { ...inp, default: e.target.value })}
                  />
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => removeInput(i)}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Steps</CardTitle>
          <div className="flex items-center gap-1">
            <Select value={pickType} onChange={(e) => setPickType(e.target.value as Step['type'])} className="w-44">
              <option value="local-shell">local shell</option>
              <option value="script">script</option>
              <option value="ssh-exec">ssh exec</option>
              <option value="tunnel">tunnel</option>
              <option value="rsync">rsync</option>
              <option value="send-to-terminal">send to terminal</option>
            </Select>
            <Button size="sm" variant="outline" onClick={addStep}>
              <Plus size={12} /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.steps.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No steps.</div>
          )}
          {draft.steps.map((s, i) => (
            <StepEditor
              key={s.id}
              step={s}
              connections={connections}
              onChange={(next) => updateStep(i, next)}
              onDelete={() => removeStep(i)}
              onMove={(dir) => moveStep(i, dir)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function RunWorkflow({ runId, workflow, onClose }: { runId: string; workflow: Workflow; onClose: () => void }) {
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const stepIndex = useMemo(() => Object.fromEntries(workflow.steps.map((s) => [s.id, s])), [workflow])

  useEffect(() => {
    let mounted = true
    unwrap(zap.workflows.getRun(runId)).then((r) => mounted && setRun(r)).catch(() => undefined)
    const offStatus = zap.workflows.onRunStatus(({ runId: id, status }) => {
      if (id !== runId) return
      setRun((prev) => (prev ? { ...prev, status: status as WorkflowRun['status'] } : prev))
    })
    const offStep = zap.workflows.onStepStatus(({ runId: id, stepId, status, exitCode }) => {
      if (id !== runId) return
      setRun((prev) => {
        if (!prev) return prev
        const steps = prev.steps.map((s) =>
          s.stepId === stepId ? { ...s, status: status as WorkflowRun['steps'][number]['status'], exitCode } : s
        )
        return { ...prev, steps }
      })
    })
    const offOut = zap.workflows.onStepOutput(({ runId: id, stepId, kind, chunk }) => {
      if (id !== runId) return
      setRun((prev) => {
        if (!prev) return prev
        const steps = prev.steps.map((s) =>
          s.stepId === stepId
            ? kind === 'stdout'
              ? { ...s, stdout: s.stdout + chunk }
              : { ...s, stderr: s.stderr + chunk }
            : s
        )
        return { ...prev, steps }
      })
    })
    return () => {
      mounted = false
      offStatus()
      offStep()
      offOut()
    }
  }, [runId])

  const cancel = async () => {
    await unwrap(zap.workflows.cancelRun(runId))
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border p-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-sm font-semibold">{workflow.name}</h2>
          {run && (
            <Badge
              variant={
                run.status === 'success'
                  ? 'success'
                  : run.status === 'failed'
                  ? 'error'
                  : run.status === 'cancelled'
                  ? 'muted'
                  : 'default'
              }
            >
              {run.status}
            </Badge>
          )}
        </div>
        {run?.status === 'running' && (
          <Button size="sm" variant="destructive" onClick={cancel}>
            <Square size={12} /> Cancel
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {run?.steps.map((s) => {
          const def = stepIndex[s.stepId]
          return (
            <Card key={s.stepId}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      s.status === 'success'
                        ? 'success'
                        : s.status === 'failed'
                        ? 'error'
                        : s.status === 'cancelled' || s.status === 'skipped'
                        ? 'muted'
                        : s.status === 'running'
                        ? 'warn'
                        : 'default'
                    }
                  >
                    {s.status}
                  </Badge>
                  <span className="text-sm font-medium">{def?.name ?? s.stepId}</span>
                  <span className="text-[11px] text-muted-foreground">{def?.type}</span>
                  {s.exitCode != null && (
                    <span className="text-[11px] text-muted-foreground ml-auto">exit {s.exitCode}</span>
                  )}
                </div>
                {(s.stdout || s.stderr) && (
                  <pre
                    className={cn(
                      'mono text-[11px] whitespace-pre-wrap bg-secondary/30 rounded p-2 max-h-60 overflow-auto'
                    )}
                  >
                    {s.stdout}
                    {s.stderr && <span className="text-red-300">{s.stderr}</span>}
                  </pre>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
