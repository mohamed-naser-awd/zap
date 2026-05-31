import type { TunnelStep } from '@shared/types'
import type { RunContext } from '../context'
import { startTunnel, stopTunnel, listTunnels } from '../../ipc/tunnels'
import type { ChunkSink, StepResult } from './common'

const heldByRun = new Map<string, Set<string>>() // runId -> tunnelIds

export async function runTunnel(
  step: TunnelStep,
  ctx: RunContext,
  onChunk: ChunkSink,
  _signal: AbortSignal
): Promise<StepResult> {
  if (step.action === 'start') {
    const t = await startTunnel({
      connectionId: step.connectionId,
      spec: step.spec,
      tags: { runId: ctx.runId, stepId: step.id }
    })
    if (step.holdOpen) {
      let s = heldByRun.get(ctx.runId)
      if (!s) {
        s = new Set()
        heldByRun.set(ctx.runId, s)
      }
      s.add(t.id)
    }
    onChunk('stdout', `tunnel started: ${t.id} (${step.spec.kind} ${step.spec.localPort})\n`)
    return { stdout: t.id, stderr: '', exitCode: 0 }
  }

  // stop: stop the matching held-open tunnel(s) for this connection/spec; fall back to any matching active tunnel.
  let stopped = 0
  for (const t of listTunnels()) {
    if (t.connectionId !== step.connectionId) continue
    if (t.spec.localPort !== step.spec.localPort) continue
    if (t.spec.kind !== step.spec.kind) continue
    if (stopTunnel(t.id)) {
      stopped++
      const s = heldByRun.get(ctx.runId)
      s?.delete(t.id)
    }
  }
  onChunk('stdout', `stopped ${stopped} tunnel(s)\n`)
  return { stdout: String(stopped), stderr: '', exitCode: stopped > 0 ? 0 : 1 }
}

export function cleanupHeldOpen(runId: string) {
  const s = heldByRun.get(runId)
  if (!s) return
  for (const id of s) stopTunnel(id)
  heldByRun.delete(runId)
}
