import { app } from 'electron'
import { writeFileSync, chmodSync } from 'fs'
import { join } from 'path'

let cachedPath: string | null = null

const WIN_SCRIPT =
  '@echo off\r\n' +
  'echo %~1 | findstr /i "passphrase" >nul\r\n' +
  'if %errorlevel%==0 (\r\n' +
  '  echo %ZAP_SSH_PASSPHRASE%\r\n' +
  ') else (\r\n' +
  '  echo %ZAP_SSH_PASSWORD%\r\n' +
  ')\r\n'

const POSIX_SCRIPT =
  '#!/bin/sh\n' +
  'case "$1" in\n' +
  '  *passphrase*|*Passphrase*) printf \'%s\\n\' "$ZAP_SSH_PASSPHRASE" ;;\n' +
  '  *) printf \'%s\\n\' "$ZAP_SSH_PASSWORD" ;;\n' +
  'esac\n'

/**
 * Returns the path to the askpass helper, always overwriting it on every call.
 * Cheap (a few hundred bytes) and ensures app updates ship a fresh helper.
 */
export function getAskpassPath(): string {
  if (cachedPath) return cachedPath
  const dir = app.getPath('userData')
  const isWin = process.platform === 'win32'
  const file = isWin ? 'askpass.cmd' : 'askpass.sh'
  const full = join(dir, file)
  writeFileSync(full, isWin ? WIN_SCRIPT : POSIX_SCRIPT, { encoding: 'utf8' })
  if (!isWin) {
    try {
      chmodSync(full, 0o700)
    } catch {
      /* ignore */
    }
  }
  cachedPath = full
  return full
}

export function knownHostsPath(): string {
  return join(app.getPath('userData'), 'known_hosts')
}

export type AskpassSecrets = { password?: string; passphrase?: string }

/**
 * Build the env additions that cause `ssh` (and rsync's ssh transport) to
 * pull either secret from our helper based on the prompt text. Returns `{}`
 * when both secrets are empty.
 */
export function buildAskpassEnv(secrets: AskpassSecrets): NodeJS.ProcessEnv {
  if (!secrets.password && !secrets.passphrase) return {}
  const env: NodeJS.ProcessEnv = {
    SSH_ASKPASS: getAskpassPath(),
    SSH_ASKPASS_REQUIRE: 'force'
  }
  if (secrets.password) env.ZAP_SSH_PASSWORD = secrets.password
  if (secrets.passphrase) env.ZAP_SSH_PASSPHRASE = secrets.passphrase
  if (process.platform !== 'win32') {
    env.DISPLAY = process.env.DISPLAY || ':0'
  }
  return env
}
