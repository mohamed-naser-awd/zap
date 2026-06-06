import { useEffect, useRef, useState } from 'react'
import { Pilcrow } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { Command, Workflow, WorkflowRun } from '@shared/types'
import { resolve } from '@shared/template'
import { SlashPalette } from './SlashPalette'
import { CommandArgsDialog, type Field } from './CommandArgsDialog'
import { PreConnectStatus } from './PreConnectStatus'
import { TerminalComposer } from './TerminalComposer'
import { useStore } from '@renderer/store'

export type XTermProps = {
  connectionId?: string
  sessionName?: string
  commands: Command[]
  /** Called when the user clicks "Close tab" in the pre-connect failure overlay. */
  onClose?: () => void
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'preconnect-running'; workflow: Workflow; runId: string | null }
  | { kind: 'preconnect-failed'; workflow: Workflow; run: WorkflowRun }
  | { kind: 'connecting' }
  | { kind: 'ready' }

/**
 * Wait for a workflow run to reach a terminal state. Subscribes to the
 * `workflows:run-status` event and also polls `getRun` every 500ms as a
 * fallback in case the event was emitted between calls.
 */
function waitForRun(runId: string): Promise<WorkflowRun> {
  return new Promise((resolve) => {
    let done = false
    const finish = (run: WorkflowRun) => {
      if (done) return
      done = true
      off()
      clearInterval(interval)
      resolve(run)
    }
    const off = zap.workflows.onRunStatus(async ({ runId: id, status }) => {
      if (id !== runId) return
      if (status === 'success' || status === 'failed' || status === 'cancelled') {
        const final = await zap.workflows.getRun(runId)
        if (final.ok) finish(final.value)
      }
    })
    const interval = setInterval(async () => {
      const r = await zap.workflows.getRun(runId)
      if (r.ok && r.value.status !== 'running') finish(r.value)
    }, 500)
  })
}

function summarizeFailedRun(run: WorkflowRun): string {
  const failed = run.steps.find((s) => s.status === 'failed')
  if (failed) {
    const head = `step "${failed.stepId}" exited ${failed.exitCode ?? '?'}\n`
    const body = (failed.stderr || failed.stdout || '').trim().slice(-1500)
    return body ? head + body : head + '(no output captured)'
  }
  return `run ${run.status}`
}

export function XTerm({ connectionId, sessionName, commands, onClose }: XTermProps) {
  const store = useStore()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const lineBufRef = useRef<string>('')
  const paletteOpenRef = useRef<boolean>(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteFilter, setPaletteFilter] = useState('')
  const [palettePos, setPalettePos] = useState({ top: 0, left: 0 })
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [composerOpen, setComposerOpen] = useState(false)
  const [argPrompt, setArgPrompt] = useState<{
    title: string
    fields: Field[]
    run: (vars: Record<string, string>) => void
  } | null>(null)

  // Resolves when the user clicks "Connect anyway" or "Close tab" on a failed
  // pre-connect overlay. Set inside the effect, called from button handlers.
  const decisionRef = useRef<((d: 'continue' | 'close') => void) | null>(null)

  useEffect(() => {
    paletteOpenRef.current = paletteOpen
  }, [paletteOpen])

  useEffect(() => {
    if (!containerRef.current) return
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      theme: { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5' },
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // NOTE: xterm already handles Ctrl+Shift+V (and right-click / Cmd+V) paste
    // natively, so our custom paste layer was firing a *second* write for the
    // same gesture → double paste. Leave paste entirely to xterm.
    // let lastPasteAt = 0
    // const PASTE_DEDUP_MS = 300
    // const writePastedText = (text: string) => {
    //   if (!text || !ptyIdRef.current) return
    //   const now = Date.now()
    //   if (now - lastPasteAt < PASTE_DEDUP_MS) return
    //   lastPasteAt = now
    //   zap.terminal.write(ptyIdRef.current, text.replace(/\r\n/g, '\n'))
    // }

    // Intercept clipboard + composer chords BEFORE xterm processes them.
    // Returning false from the handler suppresses xterm's default action.
    term.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
      if (e.type !== 'keydown') return true
      // Slash palette consumes its own keystrokes — don't fight with it.
      if (paletteOpenRef.current) return true
      const cs = e.ctrlKey && e.shiftKey
      if (!cs) return true

      const key = e.key.toLowerCase()
      if (key === 'c') {
        const sel = term.getSelection()
        if (sel) navigator.clipboard.writeText(sel).catch(() => undefined)
        return false
      }
      // Paste is handled natively by xterm — don't intercept it here, or it
      // pastes twice.
      // if (key === 'v') {
      //   navigator.clipboard
      //     .readText()
      //     .then(writePastedText)
      //     .catch(() => undefined)
      //   return false
      // }
      if (e.key === 'Enter' || e.code === 'Enter') {
        setComposerOpen(true)
        return false
      }
      return true
    })

    // Native paste (right-click → Paste, macOS Cmd+V, etc.) is handled by xterm
    // itself, which writes the pasted text through term.onData. Our own listener
    // was a duplicate, so it's disabled.
    // const onContainerPaste = (e: ClipboardEvent) => {
    //   const text = e.clipboardData?.getData('text')
    //   if (!text) return
    //   e.preventDefault()
    //   e.stopImmediatePropagation()
    //   writePastedText(text)
    // }
    // containerRef.current.addEventListener('paste', onContainerPaste, true)

    let cancelled = false

    ;(async () => {
      // 1. Pre-connect workflow — if any — runs BEFORE we spawn the pty so it
      //    can do things like widen a security group before ssh tries.
      const conn = connectionId ? store.connections.find((c) => c.id === connectionId) : undefined
      const workflowId = conn?.runOnConnect
      const workflow = workflowId ? store.workflows.find((w) => w.id === workflowId) : undefined

      if (workflow) {
        setPhase({ kind: 'preconnect-running', workflow, runId: null })
        try {
          const { runId } = await unwrap(zap.workflows.run({ id: workflow.id, vars: {} }))
          setPhase({ kind: 'preconnect-running', workflow, runId })
          const finalRun = await waitForRun(runId)
          if (cancelled) return
          if (finalRun.status !== 'success') {
            // Show error overlay and wait for the user's choice.
            setPhase({ kind: 'preconnect-failed', workflow, run: finalRun })
            const decision = await new Promise<'continue' | 'close'>((resolve) => {
              decisionRef.current = resolve
            })
            decisionRef.current = null
            if (cancelled) return
            if (decision === 'close') {
              onClose?.()
              return
            }
            // else: fall through to spawn
          }
        } catch (e) {
          // IPC failure (e.g. workflow vanished). Surface and let the user decide.
          if (cancelled) return
          const stubRun: WorkflowRun = {
            id: 'unknown',
            workflowId: workflow.id,
            startedAt: Date.now(),
            endedAt: Date.now(),
            status: 'failed',
            vars: {},
            steps: [
              { stepId: 'ipc', status: 'failed', stdout: '', stderr: (e as Error).message, exitCode: -1 }
            ]
          }
          setPhase({ kind: 'preconnect-failed', workflow, run: stubRun })
          const decision = await new Promise<'continue' | 'close'>((resolve) => {
            decisionRef.current = resolve
          })
          decisionRef.current = null
          if (cancelled) return
          if (decision === 'close') {
            onClose?.()
            return
          }
        }
      }

      // 2. Spawn the pty.
      setPhase({ kind: 'connecting' })
      try {
        const { id } = await unwrap(
          zap.terminal.spawn({
            connectionId,
            name: sessionName,
            cols: term.cols,
            rows: term.rows
          })
        )
        if (cancelled) {
          await zap.terminal.kill(id)
          return
        }
        ptyIdRef.current = id
        setPhase({ kind: 'ready' })
      } catch (e) {
        if (cancelled) return
        term.writeln(`\r\n\x1b[31m[zap] failed to spawn: ${(e as Error).message}\x1b[0m`)
        setPhase({ kind: 'ready' })
      }
    })()

    const offData = zap.terminal.onData(({ id, data }) => {
      if (id !== ptyIdRef.current) return
      term.write(data)
      if (/[\r\n]/.test(data)) lineBufRef.current = ''
      if (data.includes('\x1b[2J') || data.includes('\x1b[H')) lineBufRef.current = ''
    })
    const offExit = zap.terminal.onExit(({ id, exitCode }) => {
      if (id !== ptyIdRef.current) return
      term.writeln(`\r\n\x1b[33m[zap] process exited (${exitCode})\x1b[0m`)
    })

    term.onData((data) => {
      if (paletteOpenRef.current) return
      if (data === '/' && lineBufRef.current.length === 0) {
        if (containerRef.current && term.element) {
          const el = term.element
          const charW = el.clientWidth / term.cols
          const charH = el.clientHeight / term.rows
          const cursorX = term.buffer.active.cursorX
          const cursorY = term.buffer.active.cursorY
          setPalettePos({ top: cursorY * charH + charH + 4, left: cursorX * charW })
        }
        setPaletteFilter('')
        setPaletteOpen(true)
        return
      }
      if (data === '\r' || data === '\n') {
        lineBufRef.current = ''
      } else if (data === '\x7f' || data === '\b') {
        lineBufRef.current = lineBufRef.current.slice(0, -1)
      } else if (data === '\x03' || data === '\x15') {
        lineBufRef.current = ''
      } else if (data >= ' ') {
        lineBufRef.current += data
      }
      if (ptyIdRef.current) zap.terminal.write(ptyIdRef.current, data)
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        if (ptyIdRef.current) zap.terminal.resize(ptyIdRef.current, term.cols, term.rows)
      } catch {
        /* ignore */
      }
    })
    ro.observe(containerRef.current)

    return () => {
      cancelled = true
      // If the user is staring at the failed overlay when the tab unmounts,
      // unblock the awaiter so it can clean up.
      decisionRef.current?.('close')
      // containerRef.current?.removeEventListener('paste', onContainerPaste, true)
      ro.disconnect()
      offData()
      offExit()
      if (ptyIdRef.current) zap.terminal.kill(ptyIdRef.current)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, sessionName])

  const closePalette = () => {
    setPaletteOpen(false)
    setPaletteFilter('')
  }

  const onCancelPalette = (commit: boolean) => {
    if (commit && ptyIdRef.current) {
      const text = '/' + paletteFilter
      zap.terminal.write(ptyIdRef.current, text)
      lineBufRef.current = text
    }
    closePalette()
  }

  const writeBody = (text: string) => {
    if (ptyIdRef.current) zap.terminal.write(ptyIdRef.current, text)
    const lastNl = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'))
    lineBufRef.current = lastNl >= 0 ? text.slice(lastNl + 1) : text
  }

  const onSelectCommand = (cmd: Command) => {
    closePalette()
    const kind = cmd.kind ?? 'text'

    if (kind === 'workflow') {
      const wf = store.workflows.find((w) => w.id === cmd.workflowId)
      if (!wf) {
        termRef.current?.writeln('\r\n\x1b[31m[zap] workflow not found\x1b[0m')
        return
      }
      const run = async (vars: Record<string, string>) => {
        const res = await zap.workflows.run({ id: wf.id, vars })
        termRef.current?.writeln(
          res.ok
            ? `\r\n\x1b[36m[zap] started workflow "${wf.name}" — see Workflows tab\x1b[0m`
            : `\r\n\x1b[31m[zap] ${res.error}\x1b[0m`
        )
      }
      if (wf.inputs.length === 0) void run({})
      else setArgPrompt({ title: `Run ${wf.name}`, fields: wf.inputs, run })
      return
    }

    // kind === 'text'
    const args = cmd.args ?? []
    if (args.length === 0) {
      writeBody(cmd.body)
      return
    }
    setArgPrompt({
      title: cmd.label,
      fields: args.map((a) => ({ name: a.name, label: a.label })),
      run: (vars) => writeBody(resolve(cmd.body, { vars, steps: {} }).text)
    })
  }

  return (
    <div className="relative h-full w-full xterm-container">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Floating compose button — opens the multi-line input modal. Kept
          subtle until hover so it doesn't interfere with selection. */}
      <button
        type="button"
        title="Compose multi-line input  (Ctrl+Shift+Enter)"
        onClick={() => setComposerOpen(true)}
        className="absolute bottom-2 right-3 z-10 rounded-md border border-border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 transition p-1.5 backdrop-blur-sm"
      >
        <Pilcrow size={14} />
      </button>
      {paletteOpen && (
        <SlashPalette
          commands={commands}
          filter={paletteFilter}
          onFilterChange={setPaletteFilter}
          onSelect={onSelectCommand}
          onCancel={onCancelPalette}
          position={palettePos}
        />
      )}
      {argPrompt && (
        <CommandArgsDialog
          title={argPrompt.title}
          fields={argPrompt.fields}
          onCancel={() => setArgPrompt(null)}
          onSubmit={(vars) => {
            argPrompt.run(vars)
            setArgPrompt(null)
          }}
        />
      )}
      <TerminalComposer
        open={composerOpen}
        onCancel={() => setComposerOpen(false)}
        onSubmit={(text) => {
          if (text.length > 0 && ptyIdRef.current) {
            const normalized = text.replace(/\r\n/g, '\n')
            // Trailing newline so the last line actually runs (Enter).
            const payload = normalized.endsWith('\n') ? normalized : normalized + '\n'
            zap.terminal.write(ptyIdRef.current, payload)
          }
          setComposerOpen(false)
        }}
      />
      {phase.kind === 'preconnect-running' && (
        <PreConnectStatus phase="running" workflow={phase.workflow} runId={phase.runId} />
      )}
      {phase.kind === 'preconnect-failed' && (
        <PreConnectStatus
          phase="failed"
          workflowName={phase.workflow.name}
          message={summarizeFailedRun(phase.run)}
          onConnectAnyway={() => decisionRef.current?.('continue')}
          onCloseTab={() => decisionRef.current?.('close')}
        />
      )}
    </div>
  )
}
