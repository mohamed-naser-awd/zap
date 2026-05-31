import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { zap, unwrap } from '@renderer/lib/ipc'

export type PathInputProps = {
  value: string
  onChange: (next: string) => void
  mode: 'file' | 'directory'
  placeholder?: string
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export function PathInput({ value, onChange, mode, placeholder, title, filters }: PathInputProps) {
  const [pickError, setPickError] = useState<string | null>(null)

  const pick = async () => {
    setPickError(null)
    if (typeof window.zap?.dialog?.open !== 'function') {
      setPickError('Path picker not available — restart the app')
      console.error('[PathInput] window.zap.dialog.open is not a function — main bundle is stale')
      return
    }
    try {
      const picked = await unwrap(
        zap.dialog.open({
          mode,
          title: title ?? (mode === 'directory' ? 'Pick a folder' : 'Pick a file'),
          defaultPath: value || undefined,
          filters
        })
      )
      if (picked) onChange(picked)
    } catch (e) {
      const msg = (e as Error).message || 'picker failed'
      console.error('[PathInput] dialog.open failed:', e)
      setPickError(msg)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Input
          className="flex-1"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          size="icon"
          variant="outline"
          type="button"
          onClick={pick}
          title={mode === 'directory' ? 'Browse for folder' : 'Browse for file'}
        >
          <FolderOpen size={14} />
        </Button>
      </div>
      {pickError && <div className="text-[11px] text-red-400">{pickError}</div>}
    </div>
  )
}
