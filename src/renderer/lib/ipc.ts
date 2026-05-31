import type { ZapApi } from '@shared/api'

declare global {
  interface Window {
    zap: ZapApi
  }
}

export const zap: ZapApi = window.zap

export async function unwrap<T>(p: Promise<{ ok: true; value: T } | { ok: false; error: string }>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.value
}
