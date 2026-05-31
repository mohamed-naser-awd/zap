import { Trash2 } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { PathInput } from '@renderer/components/PathInput'
import type { Connection, Step } from '@shared/types'

type Props = {
  step: Step
  connections: Connection[]
  onChange: (next: Step) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
}

export function StepEditor({ step, connections, onChange, onDelete, onMove }: Props) {
  const update = (patch: Partial<Step>) => onChange({ ...step, ...patch } as Step)

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Badge variant="muted">{step.type}</Badge>
          <Input
            className="flex-1"
            value={step.name}
            placeholder="step name"
            onChange={(e) => update({ name: e.target.value })}
          />
          <code className="text-[11px] text-muted-foreground">id: {step.id}</code>
          <Button size="icon" variant="ghost" onClick={() => onMove(-1)} title="Move up">
            ↑
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onMove(1)} title="Move down">
            ↓
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Remove">
            <Trash2 size={14} />
          </Button>
        </div>
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!step.continueOnError}
            onChange={(e) => update({ continueOnError: e.target.checked })}
          />
          Continue on error
        </label>
        {step.type === 'local-shell' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Shell</Label>
                <Select
                  value={step.shell}
                  onChange={(e) => update({ shell: e.target.value as 'bash' | 'pwsh' | 'cmd' | 'other' })}
                >
                  <option value="bash">bash</option>
                  <option value="pwsh">pwsh / powershell</option>
                  <option value="cmd">cmd</option>
                  <option value="other">other</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Interpreter (for "other")</Label>
                <PathInput
                  mode="file"
                  value={step.interpreter ?? ''}
                  onChange={(v) => update({ interpreter: v })}
                  title="Pick interpreter"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Command</Label>
              <Textarea rows={3} value={step.command} onChange={(e) => update({ command: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Working dir (optional)</Label>
              <PathInput
                mode="directory"
                value={step.cwd ?? ''}
                onChange={(v) => update({ cwd: v })}
                title="Pick working directory"
              />
            </div>
          </>
        )}
        {step.type === 'script' && (
          <>
            <div className="space-y-1">
              <Label>Interpreter (e.g. C:\Python311\python.exe)</Label>
              <PathInput
                mode="file"
                value={step.interpreter}
                onChange={(v) => update({ interpreter: v })}
                title="Pick interpreter"
              />
            </div>
            <div className="space-y-1">
              <Label>Script path</Label>
              <PathInput
                mode="file"
                value={step.scriptPath}
                onChange={(v) => update({ scriptPath: v })}
                title="Pick script"
              />
            </div>
            <div className="space-y-1">
              <Label>Args (space-separated, each templated)</Label>
              <Input
                value={step.args.join(' ')}
                onChange={(e) => update({ args: e.target.value.split(/\s+/).filter(Boolean) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Working dir (optional)</Label>
              <PathInput
                mode="directory"
                value={step.cwd ?? ''}
                onChange={(v) => update({ cwd: v })}
                title="Pick working directory"
              />
            </div>
          </>
        )}
        {step.type === 'ssh-exec' && (
          <>
            <div className="space-y-1">
              <Label>Connection</Label>
              <Select value={step.connectionId} onChange={(e) => update({ connectionId: e.target.value })}>
                <option value="">— select —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Remote command</Label>
              <Textarea rows={3} value={step.command} onChange={(e) => update({ command: e.target.value })} />
            </div>
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              <input
                type="checkbox"
                checked={step.captureOutput}
                onChange={(e) => update({ captureOutput: e.target.checked })}
              />
              Capture output
            </label>
          </>
        )}
        {step.type === 'tunnel' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Action</Label>
                <Select value={step.action} onChange={(e) => update({ action: e.target.value as 'start' | 'stop' })}>
                  <option value="start">start</option>
                  <option value="stop">stop</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Connection</Label>
                <Select value={step.connectionId} onChange={(e) => update({ connectionId: e.target.value })}>
                  <option value="">— select —</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Kind</Label>
                <Select
                  value={step.spec.kind}
                  onChange={(e) =>
                    update({
                      spec: { ...step.spec, kind: e.target.value as 'local' | 'remote' | 'dynamic' }
                    })
                  }
                >
                  <option value="local">local (-L)</option>
                  <option value="remote">remote (-R)</option>
                  <option value="dynamic">SOCKS (-D)</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label>Local host</Label>
                <Input
                  value={step.spec.localHost}
                  onChange={(e) => update({ spec: { ...step.spec, localHost: e.target.value } })}
                />
              </div>
              <div className="space-y-1">
                <Label>Local port</Label>
                <Input
                  type="number"
                  value={step.spec.localPort}
                  onChange={(e) =>
                    update({ spec: { ...step.spec, localPort: Number(e.target.value) || 0 } })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Remote host</Label>
                <Input
                  value={step.spec.remoteHost ?? ''}
                  onChange={(e) => update({ spec: { ...step.spec, remoteHost: e.target.value } })}
                />
              </div>
              <div className="space-y-1">
                <Label>Remote port</Label>
                <Input
                  type="number"
                  value={step.spec.remotePort ?? 0}
                  onChange={(e) =>
                    update({ spec: { ...step.spec, remotePort: Number(e.target.value) || 0 } })
                  }
                />
              </div>
            </div>
            {step.action === 'start' && (
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!step.holdOpen}
                  onChange={(e) => update({ holdOpen: e.target.checked })}
                />
                Hold open after step (auto-cleaned on run end/cancel)
              </label>
            )}
          </>
        )}
        {step.type === 'rsync' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Connection</Label>
                <Select value={step.connectionId} onChange={(e) => update({ connectionId: e.target.value })}>
                  <option value="">— select —</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Direction</Label>
                <Select
                  value={step.direction}
                  onChange={(e) => update({ direction: e.target.value as 'push' | 'pull' })}
                >
                  <option value="push">push (local → remote)</option>
                  <option value="pull">pull (remote → local)</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Input value={step.source} onChange={(e) => update({ source: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Dest</Label>
              <Input value={step.dest} onChange={(e) => update({ dest: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Flags</Label>
              <Input
                value={step.flags.join(' ')}
                onChange={(e) => update({ flags: e.target.value.split(/\s+/).filter(Boolean) })}
              />
            </div>
          </>
        )}
        {step.type === 'send-to-terminal' && (
          <>
            <div className="space-y-1">
              <Label>Terminal name</Label>
              <Input value={step.terminalName} onChange={(e) => update({ terminalName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Open with connection (optional)</Label>
                <Select
                  value={step.connectionId ?? ''}
                  onChange={(e) => update({ connectionId: e.target.value || undefined })}
                >
                  <option value="">local shell</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1 flex items-end gap-3 text-xs text-muted-foreground">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={step.openIfMissing}
                    onChange={(e) => update({ openIfMissing: e.target.checked })}
                  />
                  Open if missing
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={step.appendNewline}
                    onChange={(e) => update({ appendNewline: e.target.checked })}
                  />
                  Append newline
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Text to send</Label>
              <Textarea rows={2} value={step.text} onChange={(e) => update({ text: e.target.value })} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
