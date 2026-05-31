import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

export type PromptDialogProps = {
  open: boolean
  title: string
  label?: string
  placeholder?: string
  initialValue?: string
  okLabel?: string
  cancelLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  open,
  title,
  label,
  placeholder,
  initialValue = '',
  okLabel = 'OK',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      // Defer focus to next tick so the input mounts first.
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
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

  const submit = () => onSubmit(value.trim())

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Click outside the card cancels.
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <Card className="w-[420px] max-w-[90vw] shadow-2xl">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {label && <Label>{label}</Label>}
          <Input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button size="sm" onClick={submit}>
              {okLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
