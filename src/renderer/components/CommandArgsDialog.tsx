import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

export type Field = {
  name: string
  label: string
  /** Defaults to 'string' (a plain text input). */
  type?: 'string' | 'secret' | 'select' | 'boolean'
  options?: string[]
  default?: string
}

export type CommandArgsDialogProps = {
  title: string
  fields: Field[]
  onSubmit: (vars: Record<string, string>) => void
  onCancel: () => void
}

export function CommandArgsDialog({ title, fields, onSubmit, onCancel }: CommandArgsDialogProps) {
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.name] = f.default ?? (f.type === 'boolean' ? 'false' : '')
    return init
  })
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => {
    // Defer focus to next tick so the field mounts first.
    setTimeout(() => firstRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const submit = () => onSubmit(vars)
  const set = (name: string, value: string) => setVars((v) => ({ ...v, [name]: value }))

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <Card className="w-[420px] max-w-[90vw] shadow-2xl">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.name} className="space-y-1">
              <Label>{f.label || f.name}</Label>
              {f.type === 'select' ? (
                <Select
                  ref={i === 0 ? (firstRef as React.Ref<HTMLSelectElement>) : undefined}
                  value={vars[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'boolean' ? (
                <Select
                  ref={i === 0 ? (firstRef as React.Ref<HTMLSelectElement>) : undefined}
                  value={vars[f.name] ?? 'false'}
                  onChange={(e) => set(f.name, e.target.value)}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </Select>
              ) : (
                <Input
                  ref={i === 0 ? (firstRef as React.Ref<HTMLInputElement>) : undefined}
                  type={f.type === 'secret' ? 'password' : 'text'}
                  value={vars[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submit()
                    }
                  }}
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              Run
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
