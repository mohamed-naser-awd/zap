import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import type { Command } from '@shared/types'

export type SlashPaletteProps = {
  commands: Command[]
  filter: string
  onSelect: (cmd: Command) => void
  /**
   * `commit=true` → user is dismissing with Esc (or Enter on no match); the
   * caller should send the literal `/` + filter text to the prompt so typing
   * `/` keeps behaving like a normal character.
   * `commit=false` → user is undoing the slash (e.g. Backspace through it);
   * the slash should NOT be sent.
   */
  onCancel: (commit: boolean) => void
  onFilterChange: (next: string) => void
  position: { top: number; left: number }
}

function fuzzyMatch(needle: string, hay: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  let i = 0
  for (const c of h) {
    if (c === n[i]) i++
    if (i >= n.length) return true
  }
  return false
}

export function SlashPalette({ commands, filter, onSelect, onCancel, onFilterChange, position }: SlashPaletteProps) {
  const filtered = useMemo(() => {
    return commands.filter((c) => fuzzyMatch(filter, c.slug + ' ' + c.label))
  }, [commands, filter])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    setActive(0)
  }, [filter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(filtered.length - 1, a + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(0, a - 1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const pick = filtered[active]
        if (pick) onSelect(pick)
        else onCancel(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel(true)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        if (filter.length === 0) onCancel(false)
        else onFilterChange(filter.slice(0, -1))
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        onFilterChange(filter + e.key)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [filtered, active, filter, onSelect, onCancel, onFilterChange])

  return (
    <div
      className="absolute z-50 w-80 rounded-md border border-border bg-card shadow-xl text-sm"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5">
        <span className="text-muted-foreground">/</span>
        <span className="mono">{filter}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">esc</span>
      </div>
      <ul ref={listRef} className="max-h-60 overflow-auto">
        {filtered.length === 0 && (
          <li className="px-2 py-1.5 text-muted-foreground italic">No matching commands</li>
        )}
        {filtered.map((c, i) => (
          <li
            key={c.id}
            className={cn(
              'px-2 py-1.5 cursor-pointer flex flex-col gap-0.5',
              i === active && 'bg-accent text-accent-foreground'
            )}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(c)
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">/</span>
              <span className="mono">{c.slug}</span>
              <span className="text-muted-foreground">— {c.label}</span>
            </div>
            <div className="mono text-[11px] text-muted-foreground truncate">{c.body}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
