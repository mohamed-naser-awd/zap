import { ipcMain } from 'electron'
import { IpcChannels, ok, err } from '@shared/ipc'
import { terminalSpawnOptsSchema } from '@shared/schemas'
import * as termreg from '../services/terminal-registry'
import { buildSshArgs, getConnection, getConnectionSecretEnv } from '../ssh-utils'

function defaultShell(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: process.env.COMSPEC || 'cmd.exe', args: [] }
  }
  return { command: process.env.SHELL || '/bin/bash', args: ['-l'] }
}

export function register() {
  ipcMain.handle(IpcChannels.terminalSpawn, async (_e, raw: unknown) => {
    const parsed = terminalSpawnOptsSchema.safeParse(raw ?? {})
    if (!parsed.success) return err(parsed.error.message)
    const opts = parsed.data

    let command: string
    let args: string[]
    let env: NodeJS.ProcessEnv = {}

    if (opts.connectionId) {
      const conn = getConnection(opts.connectionId)
      if (!conn) return err(`unknown connection: ${opts.connectionId}`)
      const built = buildSshArgs(conn, { ttyAlloc: 'force' })
      command = built.bin
      args = built.args
      env = await getConnectionSecretEnv(conn)
    } else if (opts.shell) {
      command = opts.shell
      args = []
    } else {
      const d = defaultShell()
      command = d.command
      args = d.args
    }

    try {
      const entry = termreg.spawn({
        command,
        args,
        cwd: opts.cwd,
        name: opts.name,
        cols: opts.cols,
        rows: opts.rows,
        env
      })
      return ok({ id: entry.id, name: entry.name ?? null })
    } catch (e) {
      return err(`spawn failed: ${(e as Error).message}`)
    }
  })

  ipcMain.handle(IpcChannels.terminalWrite, (_e, raw: { id: string; data: string }) => {
    if (!raw?.id || typeof raw.data !== 'string') return err('invalid args')
    return ok(termreg.write(raw.id, raw.data))
  })

  ipcMain.handle(IpcChannels.terminalResize, (_e, raw: { id: string; cols: number; rows: number }) => {
    if (!raw?.id) return err('invalid args')
    return ok(termreg.resize(raw.id, raw.cols, raw.rows))
  })

  ipcMain.handle(IpcChannels.terminalKill, (_e, id: string) => {
    return ok(termreg.kill(id))
  })

  ipcMain.handle(IpcChannels.terminalListNamed, () => ok(termreg.list()))
}
