import { spawn, ChildProcess, SpawnOptions } from 'child_process'
import * as procmgr from '../../services/process-manager'

export type StepResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type ChunkSink = (kind: 'stdout' | 'stderr', text: string) => void

export type SpawnAndWaitArgs = {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: string
  signal: AbortSignal
  tag: { runId: string; stepId: string }
  onChunk: ChunkSink
}

export async function spawnAndWait(opts: SpawnAndWaitArgs): Promise<StepResult> {
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: opts.stdin == null ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
  }

  const proc: ChildProcess = spawn(opts.command, opts.args, spawnOpts)
  const procId = `${opts.tag.runId}:${opts.tag.stepId}`
  procmgr.register({ id: procId, kind: 'workflow-step', proc, tags: { runId: opts.tag.runId, stepId: opts.tag.stepId } })

  let stdout = ''
  let stderr = ''

  proc.stdout?.on('data', (b: Buffer) => {
    const s = b.toString()
    stdout += s
    opts.onChunk('stdout', s)
  })
  proc.stderr?.on('data', (b: Buffer) => {
    const s = b.toString()
    stderr += s
    opts.onChunk('stderr', s)
  })

  if (opts.stdin != null && proc.stdin) {
    proc.stdin.write(opts.stdin)
    proc.stdin.end()
  }

  const onAbort = () => {
    procmgr.killOne(procId)
  }
  opts.signal.addEventListener('abort', onAbort, { once: true })

  return new Promise<StepResult>((resolveP) => {
    proc.once('error', (e) => {
      resolveP({ stdout, stderr: stderr + `\n[spawn error] ${e.message}`, exitCode: -1 })
      opts.signal.removeEventListener('abort', onAbort)
    })
    proc.once('exit', (code, signal) => {
      opts.signal.removeEventListener('abort', onAbort)
      procmgr.unregister(procId)
      const exitCode = code ?? (signal ? 130 : -1)
      resolveP({ stdout, stderr, exitCode })
    })
  })
}
