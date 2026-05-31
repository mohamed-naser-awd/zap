import { resolve } from '@shared/template'
import type { LocalShellStep } from '@shared/types'
import type { RunContext } from '../context'
import { spawnAndWait, type ChunkSink, type StepResult } from './common'

function shellInterpreter(step: LocalShellStep): { bin: string; flag: string } {
  if (step.shell === 'other') {
    if (!step.interpreter) throw new Error('shell=other requires an interpreter path')
    return { bin: step.interpreter, flag: '-c' }
  }
  if (step.shell === 'pwsh') {
    const bin = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
    return { bin, flag: '-Command' }
  }
  if (step.shell === 'cmd') {
    return { bin: process.env.COMSPEC || 'cmd.exe', flag: '/c' }
  }
  // bash
  return { bin: '/bin/bash', flag: '-c' }
}

export async function runLocalShell(
  step: LocalShellStep,
  ctx: RunContext,
  onChunk: ChunkSink,
  signal: AbortSignal
): Promise<StepResult> {
  const { text, warnings } = resolve(step.command, ctx)
  if (warnings.length) {
    for (const w of warnings) onChunk('stderr', `[template] ${w.reason}\n`)
  }
  const { bin, flag } = shellInterpreter(step)
  return spawnAndWait({
    command: bin,
    args: [flag, text],
    cwd: step.cwd,
    signal,
    tag: { runId: ctx.runId, stepId: step.id },
    onChunk
  })
}
