import { resolveEach, resolve } from '@shared/template'
import type { ScriptStep } from '@shared/types'
import type { RunContext } from '../context'
import { spawnAndWait, type ChunkSink, type StepResult } from './common'

export async function runScript(
  step: ScriptStep,
  ctx: RunContext,
  onChunk: ChunkSink,
  signal: AbortSignal
): Promise<StepResult> {
  const interpreter = resolve(step.interpreter, ctx).text
  const scriptPath = resolve(step.scriptPath, ctx).text
  const argsRes = resolveEach(step.args, ctx)
  if (argsRes.warnings.length) {
    for (const w of argsRes.warnings) onChunk('stderr', `[template] ${w.reason}\n`)
  }
  return spawnAndWait({
    command: interpreter,
    args: [scriptPath, ...argsRes.values],
    cwd: step.cwd,
    signal,
    tag: { runId: ctx.runId, stepId: step.id },
    onChunk
  })
}
