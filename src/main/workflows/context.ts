import type { ResolveContext } from '@shared/template'
import type { StepRun } from '@shared/types'

export type RunContext = ResolveContext & {
  runId: string
  vars: Record<string, string>
  steps: Record<string, Pick<StepRun, 'stdout' | 'stderr' | 'exitCode'>>
}

export function makeContext(runId: string, vars: Record<string, string>): RunContext {
  return { runId, vars, steps: {} }
}

export function recordStepResult(
  ctx: RunContext,
  stepId: string,
  result: { stdout: string; stderr: string; exitCode?: number }
) {
  ctx.steps[stepId] = { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
}
