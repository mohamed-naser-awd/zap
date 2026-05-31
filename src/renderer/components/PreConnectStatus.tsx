import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { zap } from '@renderer/lib/ipc'
import type { Workflow } from '@shared/types'

export type PreConnectStatusProps =
  | {
      phase: 'running'
      workflow: Workflow
      runId: string | null
    }
  | {
      phase: 'failed'
      workflowName: string
      message: string
      onConnectAnyway: () => void
      onCloseTab: () => void
    }

type LiveEntry = {
  stepId: string
  stepName: string
  kind: 'stdout' | 'stderr'
  text: string
}

// How many lines to keep visible in the live log; older lines scroll off.
const MAX_LINES = 200

export function PreConnectStatus(props: PreConnectStatusProps) {
  if (props.phase === 'running') return <RunningOverlay workflow={props.workflow} runId={props.runId} />
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm text-foreground p-4">
      <AlertTriangle size={28} className="text-red-400" />
      <div className="text-sm font-medium">
        Pre-connect workflow failed: <span className="font-normal">{props.workflowName}</span>
      </div>
      <pre className="mono text-[11px] whitespace-pre-wrap bg-red-500/10 border border-red-500/30 rounded p-2 max-h-48 w-[480px] max-w-[90%] overflow-auto text-red-200">
        {props.message}
      </pre>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="destructive" onClick={props.onCloseTab}>
          Close tab
        </Button>
        <Button size="sm" variant="outline" onClick={props.onConnectAnyway}>
          Connect anyway
        </Button>
      </div>
    </div>
  )
}

function RunningOverlay({ workflow, runId }: { workflow: Workflow; runId: string | null }) {
  const [entries, setEntries] = useState<LiveEntry[]>([])
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement | null>(null)
  // stepId → name lookup for prefixing log lines.
  const stepName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of workflow.steps) m.set(s.id, s.name)
    return m
  }, [workflow])

  useEffect(() => {
    if (!runId) return
    const offStatus = zap.workflows.onStepStatus((p) => {
      if (p.runId !== runId) return
      if (p.status === 'running') setActiveStepId(p.stepId)
    })
    const offOutput = zap.workflows.onStepOutput((p) => {
      if (p.runId !== runId) return
      // Split chunk into lines for stable rendering.
      const lines = p.chunk.split(/\r?\n/).filter((l) => l.length > 0)
      if (lines.length === 0) return
      setEntries((prev) => {
        const next = prev.slice()
        for (const ln of lines) {
          next.push({
            stepId: p.stepId,
            stepName: stepName.get(p.stepId) ?? p.stepId,
            kind: p.kind,
            text: ln
          })
        }
        if (next.length > MAX_LINES) next.splice(0, next.length - MAX_LINES)
        return next
      })
    })
    return () => {
      offStatus()
      offOutput()
    }
  }, [runId, stepName])

  // Keep the log scrolled to the bottom as new lines arrive.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [entries.length])

  const activeStep = activeStepId ? stepName.get(activeStepId) : null

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-stretch bg-background/85 backdrop-blur-sm text-foreground p-4 gap-3 overflow-hidden">
      <div className="flex items-center gap-2">
        <Loader2 size={18} className="animate-spin text-emerald-400 shrink-0" />
        <div className="text-sm">
          Running pre-connect workflow:{' '}
          <span className="font-medium">{workflow.name}</span>
          {activeStep && (
            <>
              {' '}
              <span className="text-muted-foreground">— step:</span>{' '}
              <span className="font-medium">{activeStep}</span>
            </>
          )}
        </div>
      </div>
      <pre
        ref={logRef}
        className="mono text-[11px] whitespace-pre-wrap flex-1 bg-card/60 border border-border rounded p-2 overflow-auto"
      >
        {entries.length === 0 ? (
          <span className="text-muted-foreground">(waiting for output…)</span>
        ) : (
          entries.map((e, i) => (
            <div key={i} className={e.kind === 'stderr' ? 'text-red-200' : ''}>
              <span className="text-muted-foreground">{e.stepName}</span>{' '}
              <span>{e.text}</span>
            </div>
          ))
        )}
      </pre>
      <div className="text-[11px] text-muted-foreground">
        Output is also written to the daily log file (Settings → Logs).
      </div>
    </div>
  )
}
