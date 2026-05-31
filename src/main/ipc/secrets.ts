import { ipcMain } from 'electron'
import keytar from 'keytar'
import { IpcChannels, ok, err } from '@shared/ipc'
import { secretKindSchema } from '@shared/schemas'
import type { SecretKind } from '@shared/types'

const SERVICE = 'zap'

function account(id: string, kind: SecretKind) {
  return `${id}:${kind}`
}

export function register() {
  ipcMain.handle(IpcChannels.secretsSet, async (_e, raw: { id: string; kind: SecretKind; value: string }) => {
    const k = secretKindSchema.safeParse(raw?.kind)
    if (!k.success) return err('invalid secret kind')
    if (!raw.id || typeof raw.value !== 'string') return err('invalid args')
    await keytar.setPassword(SERVICE, account(raw.id, k.data), raw.value)
    return ok(true)
  })

  ipcMain.handle(IpcChannels.secretsGet, async (_e, raw: { id: string; kind: SecretKind }) => {
    const k = secretKindSchema.safeParse(raw?.kind)
    if (!k.success) return err('invalid secret kind')
    const v = await keytar.getPassword(SERVICE, account(raw.id, k.data))
    return ok(v)
  })

  ipcMain.handle(IpcChannels.secretsDelete, async (_e, raw: { id: string; kind: SecretKind }) => {
    const k = secretKindSchema.safeParse(raw?.kind)
    if (!k.success) return err('invalid secret kind')
    const removed = await keytar.deletePassword(SERVICE, account(raw.id, k.data))
    return ok(removed)
  })
}

export async function getSecret(id: string, kind: SecretKind): Promise<string | null> {
  return keytar.getPassword(SERVICE, account(id, kind))
}
