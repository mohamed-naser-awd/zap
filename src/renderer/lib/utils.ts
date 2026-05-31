import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatBytes(n?: number): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function shortId(id: string): string {
  return id.slice(0, 6)
}

/**
 * Return an Electron dialog filter set for executables when running on Windows,
 * or undefined elsewhere (POSIX executables have no canonical extension).
 */
export function exeFilter(): Array<{ name: string; extensions: string[] }> | undefined {
  if (typeof navigator !== 'undefined' && navigator.platform.startsWith('Win')) {
    return [
      { name: 'Executables', extensions: ['exe'] },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  return undefined
}

/**
 * Palette used to tint projects and terminal tabs. Keys are referenced in
 * stored data (`project.color`, terminal-tab color) so they must stay stable.
 *
 * - `dot`: the small color swatch (used in pickers + connection rows).
 * - `tint`: subtle background for general accents (low opacity).
 * - `bgActive` / `bgInactive`: stronger fills used on terminal tabs so the
 *   chosen color is unmistakable against the dark base.
 * - `border`: a saturated border to pair with the fill on active tabs.
 * - `text`: tinted text for the tab label.
 * - `ring`: focus/highlight ring color.
 */
export type ColorStyle = {
  dot: string
  tint: string
  bgActive: string
  bgInactive: string
  border: string
  text: string
  ring: string
}

export const PROJECT_COLORS: Record<string, ColorStyle> = {
  slate: {
    dot: 'bg-slate-400',
    tint: 'bg-slate-500/15',
    bgActive: 'bg-slate-500/40',
    bgInactive: 'bg-slate-500/20',
    border: 'border-slate-400/70',
    text: 'text-slate-100',
    ring: 'ring-slate-400/60'
  },
  red: {
    dot: 'bg-red-400',
    tint: 'bg-red-500/15',
    bgActive: 'bg-red-500/40',
    bgInactive: 'bg-red-500/20',
    border: 'border-red-400/70',
    text: 'text-red-100',
    ring: 'ring-red-400/60'
  },
  amber: {
    dot: 'bg-amber-400',
    tint: 'bg-amber-500/15',
    bgActive: 'bg-amber-500/40',
    bgInactive: 'bg-amber-500/20',
    border: 'border-amber-400/70',
    text: 'text-amber-100',
    ring: 'ring-amber-400/60'
  },
  emerald: {
    dot: 'bg-emerald-400',
    tint: 'bg-emerald-500/15',
    bgActive: 'bg-emerald-500/40',
    bgInactive: 'bg-emerald-500/20',
    border: 'border-emerald-400/70',
    text: 'text-emerald-100',
    ring: 'ring-emerald-400/60'
  },
  sky: {
    dot: 'bg-sky-400',
    tint: 'bg-sky-500/15',
    bgActive: 'bg-sky-500/40',
    bgInactive: 'bg-sky-500/20',
    border: 'border-sky-400/70',
    text: 'text-sky-100',
    ring: 'ring-sky-400/60'
  },
  violet: {
    dot: 'bg-violet-400',
    tint: 'bg-violet-500/15',
    bgActive: 'bg-violet-500/40',
    bgInactive: 'bg-violet-500/20',
    border: 'border-violet-400/70',
    text: 'text-violet-100',
    ring: 'ring-violet-400/60'
  },
  pink: {
    dot: 'bg-pink-400',
    tint: 'bg-pink-500/15',
    bgActive: 'bg-pink-500/40',
    bgInactive: 'bg-pink-500/20',
    border: 'border-pink-400/70',
    text: 'text-pink-100',
    ring: 'ring-pink-400/60'
  }
}

export const PROJECT_COLOR_KEYS = Object.keys(PROJECT_COLORS)

export function colorStyles(key?: string): ColorStyle {
  return key && PROJECT_COLORS[key] ? PROJECT_COLORS[key] : PROJECT_COLORS.slate
}
