import { resolve } from '@shared/template'
import type { SshExecStep } from '@shared/types'
import type { RunContext } from '../context'
import { buildSshArgs, requireConnection, getConnectionSecretEnv } from '../../ssh-utils'
import { spawnAndWait, type ChunkSink, type StepResult } from './common'

export async function runSshExec(
  step: SshExecStep,
  ctx: RunContext,
  onChunk: ChunkSink,
  signal: AbortSignal
): Promise<StepResult> {
  const conn = requireConnection(step.connectionId)
  const command = resolve(step.command, ctx).text
  const { bin, args } = buildSshArgs(conn, { remoteCommand: command, ttyAlloc: 'disable' })
  const secretEnv = await getConnectionSecretEnv(conn)
  return spawnAndWait({
    command: bin,
    args,
    env: { ...process.env, ...secretEnv },
    signal,
    tag: { runId: ctx.runId, stepId: step.id },
    onChunk
  })
}
