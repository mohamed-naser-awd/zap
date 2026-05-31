import { BrowserWindow } from 'electron'
import { nanoid } from 'nanoid'
import { IpcChannels } from '@shared/ipc'
import type {
  StepRun,
  Workflow,
  WorkflowRun,
  WorkflowRunStatus,
  StepRunStatus,
  Step
} from '@shared/types'
import { db } from '../services/config-store'
import * as procmgr from '../services/process-manager'
import { log } from '../services/logger'
import { makeContext, recordStepResult, type RunContext } from './context'
import { runLocalShell } from './executors/localShell'
import { runScript } from './executors/script'
import { runSshExec } from './executors/sshExec'
import { runTunnel, cleanupHeldOpen } from './executors/tunnel'
import { runRsyncStep } from './executors/rsync'
import { runSendToTerminal } from './executors/sendToTerminal'
import type { StepResult } from './executors/common'

type LiveRun = {
  run: WorkflowRun
  ctx: RunContext
  abort: AbortController
  done: Promise<WorkflowRun>
}

const live = new Map<string, LiveRun>()

function emit(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function persist(run: WorkflowRun) {
  const all = db.runs.list()
  const i = all.findIndex((r) => r.id === run.id)
  if (i >= 0) {
    all[i] = run
    db.runs.set(all)
  } else {
    db.runs.push(run)
  }
}

async function executeStep(step: Step, ctx: RunContext, onChunk: (kind: 'stdout' | 'stderr', text: string) => void, signal: AbortSignal): Promise<StepResult> {
  switch (step.type) {
    case 'local-shell':
      return runLocalShell(step, ctx, onChunk, signal)
    case 'script':
      return runScript(step, ctx, onChunk, signal)
    case 'ssh-exec':
      return runSshExec(step, ctx, onChunk, signal)
    case 'tunnel':
      return runTunnel(step, ctx, onChunk, signal)
    case 'rsync':
      return runRsyncStep(step, ctx, onChunk, signal)
    case 'send-to-terminal':
      return runSendToTerminal(step, ctx, onChunk, signal)
    default:
      return { stdout: '', stderr: `unknown step type: ${(step as { type: string }).type}`, exitCode: -1 }
  }
}

export function getRun(id: string): WorkflowRun | undefined {
  const liveOne = live.get(id)
  if (liveOne) return liveOne.run
  return db.runs.list().find((r) => r.id === id)
}

export function listRuns(workflowId?: string): WorkflowRun[] {
  const all = db.runs.list()
  return workflowId ? all.filter((r) => r.workflowId === workflowId) : all
}

export function cancelRun(id: string): boolean {
  const l = live.get(id)
  if (!l) return false
  l.abort.abort()
  procmgr.killByTag('runId', id)
  cleanupHeldOpen(id)
  return true
}

export function startRun(workflow: Workflow, vars: Record<string, string>): WorkflowRun {
  const runId = nanoid()
  const startedAt = Date.now()
  const stepStates: StepRun[] = workflow.steps.map((s) => ({
    stepId: s.id,
    status: 'pending' as StepRunStatus,
    stdout: '',
    stderr: ''
  }))
  const run: WorkflowRun = {
    id: runId,
    workflowId: workflow.id,
    startedAt,
    status: 'running',
    vars,
    steps: stepStates
  }
  const ctx = makeContext(runId, vars)
  const abort = new AbortController()

  emit(IpcChannels.workflowsRunStatus, { runId, status: run.status })
  persist(run)
  log.info('workflow.run.start', { runId, workflowId: workflow.id, name: workflow.name, steps: workflow.steps.length })

  const done = (async () => {
    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        if (abort.signal.aborted) {
          for (let j = i; j < stepStates.length; j++) {
            stepStates[j].status = 'cancelled'
            emit(IpcChannels.workflowsStepStatus, { runId, stepId: stepStates[j].stepId, status: 'cancelled' })
          }
          run.status = 'cancelled'
          break
        }
        const step = workflow.steps[i]
        const state = stepStates[i]
        state.status = 'running'
        state.startedAt = Date.now()
        emit(IpcChannels.workflowsStepStatus, { runId, stepId: step.id, status: 'running' })
        log.info('workflow.step.start', {
          runId,
          stepId: step.id,
          name: step.name,
          type: step.type
        })

        // Per-step line buffers — output arrives as arbitrary chunks; we batch
        // up complete lines before writing to the file logger so each log entry
        // is one rsync/script line rather than partial fragments.
        const lineBufs: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' }
        const flushLine = (kind: 'stdout' | 'stderr', line: string) => {
          if (!line) return
          log.info('workflow.step.output', {
            runId,
            stepId: step.id,
            kind,
            line: line.length > 2000 ? line.slice(0, 2000) + '…' : line
          })
        }

        const onChunk = (kind: 'stdout' | 'stderr', text: string) => {
          if (kind === 'stdout') state.stdout += text
          else state.stderr += text
          emit(IpcChannels.workflowsStepOutput, { runId, stepId: step.id, kind, chunk: text })
          // Split on any newline; keep the trailing partial in the buffer.
          const combined = lineBufs[kind] + text
          const lines = combined.split(/\r?\n/)
          lineBufs[kind] = lines.pop() ?? ''
          for (const ln of lines) flushLine(kind, ln)
        }

        let result: StepResult
        try {
          result = await executeStep(step, ctx, onChunk, abort.signal)
        } catch (e) {
          log.error('workflow.step.exception', { runId, stepId: step.id, type: step.type, error: e })
          result = { stdout: state.stdout, stderr: state.stderr + `\n[runner] ${(e as Error).message}`, exitCode: -1 }
        }

        state.stdout = result.stdout || state.stdout
        state.stderr = result.stderr || state.stderr
        state.exitCode = result.exitCode
        state.endedAt = Date.now()

        // Flush any partial trailing line so it makes it into the file log too.
        if (lineBufs.stdout) flushLine('stdout', lineBufs.stdout)
        if (lineBufs.stderr) flushLine('stderr', lineBufs.stderr)

        const failed = abort.signal.aborted
          ? 'cancelled'
          : result.exitCode === 0
          ? 'success'
          : 'failed'
        state.status = failed
        recordStepResult(ctx, step.id, { stdout: state.stdout, stderr: state.stderr, exitCode: state.exitCode })
        emit(IpcChannels.workflowsStepStatus, {
          runId,
          stepId: step.id,
          status: state.status,
          exitCode: state.exitCode
        })
        log.info('workflow.step.end', {
          runId,
          stepId: step.id,
          status: state.status,
          exitCode: state.exitCode,
          durationMs: (state.endedAt ?? 0) - (state.startedAt ?? 0)
        })

        if (state.status === 'failed' && !step.continueOnError) {
          for (let j = i + 1; j < stepStates.length; j++) {
            stepStates[j].status = 'skipped'
            emit(IpcChannels.workflowsStepStatus, { runId, stepId: stepStates[j].stepId, status: 'skipped' })
          }
          run.status = 'failed'
          break
        }
        if (state.status === 'cancelled') {
          run.status = 'cancelled'
          break
        }
      }

      if (run.status === 'running') run.status = 'success'
    } finally {
      run.endedAt = Date.now()
      if (run.status !== 'success') cleanupHeldOpen(runId)
      persist(run)
      live.delete(runId)
      emit(IpcChannels.workflowsRunStatus, { runId, status: run.status as WorkflowRunStatus })
      log.info('workflow.run.end', { runId, status: run.status, durationMs: run.endedAt - run.startedAt })
    }
    return run
  })()

  live.set(runId, { run, ctx, abort, done })
  return run
}
