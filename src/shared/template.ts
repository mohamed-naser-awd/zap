import type { StepRun } from './types'

export type ResolveContext = {
  vars: Record<string, string>
  steps: Record<string, Pick<StepRun, 'stdout' | 'stderr' | 'exitCode'>>
}

export type ResolveWarning = { token: string; reason: string }

export type ResolveResult = {
  text: string
  warnings: ResolveWarning[]
}

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g

function lookup(path: string, ctx: ResolveContext): { value?: string; warning?: string } {
  const parts = path.split('.')
  if (parts.length < 2) return { warning: `unknown token shape: ${path}` }

  if (parts[0] === 'vars') {
    const name = parts[1]
    if (!(name in ctx.vars)) return { warning: `missing var: ${name}` }
    return { value: ctx.vars[name] }
  }

  if (parts[0] === 'steps') {
    if (parts.length !== 3) return { warning: `expected steps.<id>.<field>: ${path}` }
    const [, stepId, field] = parts
    const step = ctx.steps[stepId]
    if (!step) return { warning: `unknown step id: ${stepId}` }
    if (field === 'stdout') return { value: trimTrailingNewline(step.stdout) }
    if (field === 'stderr') return { value: trimTrailingNewline(step.stderr) }
    if (field === 'exitCode') return { value: step.exitCode == null ? '' : String(step.exitCode) }
    return { warning: `unknown step field: ${field}` }
  }

  return { warning: `unknown namespace: ${parts[0]}` }
}

function trimTrailingNewline(s: string): string {
  if (s.endsWith('\r\n')) return s.slice(0, -2)
  if (s.endsWith('\n')) return s.slice(0, -1)
  return s
}

export function resolve(input: string, ctx: ResolveContext): ResolveResult {
  const warnings: ResolveWarning[] = []
  const text = input.replace(TOKEN, (_, raw: string) => {
    const path = raw.trim()
    const r = lookup(path, ctx)
    if (r.warning) {
      warnings.push({ token: path, reason: r.warning })
      return ''
    }
    return r.value ?? ''
  })
  return { text, warnings }
}

export function resolveArray(items: string[], ctx: ResolveContext): ResolveResult {
  const warnings: ResolveWarning[] = []
  const out: string[] = []
  for (const it of items) {
    const r = resolve(it, ctx)
    warnings.push(...r.warnings)
    out.push(r.text)
  }
  return { text: out.join(' '), warnings }
}

export function resolveEach(items: string[], ctx: ResolveContext): { values: string[]; warnings: ResolveWarning[] } {
  const warnings: ResolveWarning[] = []
  const values: string[] = []
  for (const it of items) {
    const r = resolve(it, ctx)
    warnings.push(...r.warnings)
    values.push(r.text)
  }
  return { values, warnings }
}
