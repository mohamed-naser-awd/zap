import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

export type TerminalComposerProps = {
  open: boolean
  initialValue?: string
  onSubmit: (text: string) => void
  onCancel: () => void
}

/**
 * A multi-line textarea modal for composing terminal input. Designed to
 * stitch into XTerm: on submit, the parent writes the resulting text to the
 * pty (the parent owns the pty handle; this component is presentation only).
 *
 * - Enter inserts a newline (default textarea behavior).
 * - Tab inserts a literal `\t` rather than tabbing to the next focusable.
 * - Ctrl+Enter / Cmd+Enter submits.
 * - Esc cancels.
 * - Clicking the backdrop cancels.
 */
export function TerminalComposer({
  open,
  initialValue = '',
  onSubmit,
  onCancel
}: TerminalComposerProps) {
  const [value, setValue] = useState(initialValue)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      // Defer focus so the textarea is in the DOM first.
      setTimeout(() => taRef.current?.focus(), 0)
    }
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel])

  if (!open) return null

  const submit = () => onSubmit(value)

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <Card className="w-[640px] max-w-[92vw] shadow-2xl">
        <CardHeader>
          <CardTitle>Compose multi-line input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                submit()
                return
              }
              if (e.key === 'Tab') {
                e.preventDefault()
                const ta = e.currentTarget
                const s = ta.selectionStart
                const t = ta.selectionEnd
                const next = ta.value.slice(0, s) + '\t' + ta.value.slice(t)
                setValue(next)
                // Move caret past inserted tab on next tick.
                setTimeout(() => {
                  ta.selectionStart = ta.selectionEnd = s + 1
                }, 0)
              }
            }}
            rows={14}
            spellCheck={false}
            className="w-full mono text-xs bg-background border border-border rounded-md p-2 outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder={'e.g.\nexport DEBUG=1\ncd /var/log\ntail -f syslog'}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              <span className="mono">Ctrl+Enter</span> send · <span className="mono">Esc</span> cancel ·
              each line runs separately
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={value.length === 0}>
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
