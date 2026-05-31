import { resolve } from '@shared/template'
import type { SendToTerminalStep } from '@shared/types'
import type { RunContext } from '../context'
import * as termreg from '../../services/terminal-registry'
import { buildSshArgs, getConnection } from '../../ssh-utils'
import type { ChunkSink, StepResult } from './common'

export async function runSendToTerminal(
  step: SendToTerminalStep,
  ctx: RunContext,
  onChunk: ChunkSink,
  _signal: AbortSignal
): Promise<StepResult> {
  const name = resolve(step.terminalName, ctx).text
  const text = resolve(step.text, ctx).text
  const payload = step.appendNewline ? text + '\r' : text

  let term = termreg.findByName(name)
  if (!term && step.openIfMissing) {
    if (step.connectionId) {
      const conn = getConnection(step.connectionId)
      if (!conn) {
        onChunk('stderr', `unknown connection: ${step.connectionId}\n`)
        return { stdout: '', stderr: 'unknown connection', exitCode: 1 }
      }
      const built = buildSshArgs(conn, { ttyAlloc: 'force' })
      term = termreg.spawn({ command: built.bin, args: built.args, name })
    } else {
      const shell = process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/bash'
      term = termreg.spawn({ command: shell, args: [], name })
    }
  }
  if (!term) {
    onChunk('stderr', `terminal not found: ${name}\n`)
    return { stdout: '', stderr: `terminal not found: ${name}`, exitCode: 1 }
  }

  termreg.write(term.id, payload)
  onChunk('stdout', `sent ${payload.length} chars to "${name}"\n`)
  return { stdout: name, stderr: '', exitCode: 0 }
}
