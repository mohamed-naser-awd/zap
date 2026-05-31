import { resolve } from '@shared/template'
import type { RsyncStep } from '@shared/types'
import type { RunContext } from '../context'
import { startRsync, rsyncBus } from '../../ipc/rsync'
import * as procmgr from '../../services/process-manager'
import type { ChunkSink, StepResult } from './common'

export async function runRsyncStep(
  step: RsyncStep,
  ctx: RunContext,
  onChunk: ChunkSink,
  signal: AbortSignal
): Promise<StepResult> {
  const source = resolve(step.source, ctx).text
  const dest = resolve(step.dest, ctx).text

  const job = await startRsync({
    connectionId: step.connectionId,
    direction: step.direction,
    source,
    dest,
    flags: step.flags,
    tags: { runId: ctx.runId, stepId: step.id }
  })
  onChunk('stdout', `rsync started: ${job.id}\n`)

  return await new Promise<StepResult>((resolveP) => {
    const onProgress = (payload: { id: string; progress: { pct: number; rate: string; eta: string } }) => {
      if (payload.id !== job.id) return
      onChunk('stdout', `${payload.progress.pct}% @ ${payload.progress.rate} (ETA ${payload.progress.eta})\n`)
    }
    const onLine = (payload: { id: string; line: string }) => {
      if (payload.id !== job.id) return
      onChunk('stdout', payload.line + '\n')
    }
    const onDone = (payload: { id: string; status: string; exitCode?: number; stderr?: string }) => {
      if (payload.id !== job.id) return
      rsyncBus.off('progress', onProgress)
      rsyncBus.off('line', onLine)
      rsyncBus.off('done', onDone)
      signal.removeEventListener('abort', onAbort)
      if (payload.stderr) onChunk('stderr', payload.stderr + '\n')
      const exitCode = payload.exitCode ?? (payload.status === 'cancelled' ? 130 : payload.status === 'done' ? 0 : -1)
      resolveP({ stdout: payload.status, stderr: payload.stderr ?? '', exitCode })
    }
    const onAbort = () => {
      procmgr.killOne(job.id)
    }

    rsyncBus.on('progress', onProgress)
    rsyncBus.on('line', onLine)
    rsyncBus.on('done', onDone)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
