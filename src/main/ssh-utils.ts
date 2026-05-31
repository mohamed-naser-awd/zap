import { db } from './services/config-store'
import { getSecret } from './ipc/secrets'
import { buildAskpassEnv, knownHostsPath, type AskpassSecrets } from './services/askpass'
import type { Connection, RsyncPathStyle } from '@shared/types'

export function getConnection(id: string): Connection | undefined {
  return db.connections.list().find((c) => c.id === id)
}

export function requireConnection(id: string): Connection {
  const c = getConnection(id)
  if (!c) throw new Error(`unknown connection: ${id}`)
  return c
}

export type SshOpts = {
  extraArgs?: string[]
  remoteCommand?: string
  ttyAlloc?: 'force' | 'disable' | 'auto'
}

/**
 * Build the `PreferredAuthentications` value from whichever toggles are
 * enabled on the connection. Order matters — ssh tries methods left to right.
 */
function preferredAuthMethods(conn: Connection): string[] {
  const methods: string[] = []
  if (conn.useAgent || conn.identityKey) methods.push('publickey')
  if (conn.hasPassword) methods.push('password', 'keyboard-interactive')
  return Array.from(new Set(methods))
}

function needsAskpass(conn: Connection): boolean {
  return conn.hasPassword || !!conn.identityKey?.hasPassphrase
}

/**
 * Build an argv array for invoking the system `ssh` binary against a connection.
 * Password/passphrase delivery is handled out-of-band via the ASKPASS helper —
 * see `getConnectionSecretEnv`. The caller must merge that env into the spawn env.
 */
export function buildSshArgs(conn: Connection, opts: SshOpts = {}): { args: string[]; bin: string } {
  const settings = db.settings.get()
  const bin = settings.sshBinary
  const args: string[] = []

  args.push('-p', String(conn.port))
  if (opts.ttyAlloc === 'force') args.push('-tt')
  if (opts.ttyAlloc === 'disable') args.push('-T')
  args.push('-o', 'ServerAliveInterval=30')
  args.push('-o', 'ExitOnForwardFailure=yes')
  args.push('-o', 'StrictHostKeyChecking=accept-new')
  args.push('-o', `UserKnownHostsFile=${knownHostsPath()}`)

  if (conn.identityKey) {
    args.push('-i', conn.identityKey.path)
    args.push('-o', 'IdentitiesOnly=yes')
  }

  if (!conn.useAgent && !conn.identityKey) {
    args.push('-o', 'PubkeyAuthentication=no')
  }

  const methods = preferredAuthMethods(conn)
  if (methods.length) args.push('-o', `PreferredAuthentications=${methods.join(',')}`)

  // BatchMode disables both prompts AND ASKPASS. Only safe when there is no
  // secret we need to deliver. Pure-agent or pure-passwordless-key falls into
  // this category.
  if (!needsAskpass(conn)) args.push('-o', 'BatchMode=yes')

  if (opts.extraArgs) args.push(...opts.extraArgs)

  args.push(`${conn.user}@${conn.host}`)

  if (opts.remoteCommand) {
    args.push('--', opts.remoteCommand)
  }

  return { args, bin }
}

/**
 * Format a filesystem path for embedding inside the flattened `-e` ssh command
 * passed to rsync. On Windows the path is converted to forward slashes (accepted
 * by both Cygwin and native OpenSSH) so it carries no backslashes that Node's
 * argv quoting would turn into `\"` — a sequence Cygwin's rsync.exe mis-parses,
 * leaking literal backslashes into the path. Single-quote only when whitespace
 * is present; Node passes single quotes through verbatim and rsync's rsh
 * tokenizer honors them. (A literal single quote in the path is unsupported —
 * vanishingly rare for key/host-file paths.)
 */
function rshPathArg(p: string): string {
  const s = process.platform === 'win32' ? p.replace(/\\/g, '/') : p
  return /\s/.test(s) ? `'${s}'` : s
}

/**
 * Build the `-e "ssh ..."` string passed to rsync.
 */
export function buildRsyncSshOption(conn: Connection): string {
  const settings = db.settings.get()
  const parts = [
    rshPathArg(settings.sshBinary),
    // -T: no pty allocation. Without this, the remote shell may print a login
    //     banner / MOTD that corrupts rsync's protocol stream and causes the
    //     classic "connection unexpectedly closed (0 bytes received)" /
    //     "rsync error: error in rsync protocol data stream (code 12)".
    // LogLevel=ERROR: silences ssh's own "Welcome to …" diagnostic prints; real
    //     auth/network errors still surface.
    '-T',
    '-o LogLevel=ERROR',
    `-p ${conn.port}`,
    '-o ServerAliveInterval=30',
    '-o StrictHostKeyChecking=accept-new',
    `-o UserKnownHostsFile=${rshPathArg(knownHostsPath())}`
  ]
  if (conn.identityKey) {
    parts.push(`-i ${rshPathArg(conn.identityKey.path)}`)
    parts.push('-o IdentitiesOnly=yes')
  }
  if (!conn.useAgent && !conn.identityKey) {
    parts.push('-o PubkeyAuthentication=no')
  }
  const methods = preferredAuthMethods(conn)
  if (methods.length) parts.push(`-o PreferredAuthentications=${methods.join(',')}`)
  if (!needsAskpass(conn)) parts.push('-o BatchMode=yes')
  return parts.join(' ')
}

/**
 * Resolve the spawn env needed for ssh/rsync to authenticate non-interactively
 * against this connection. Returns `{}` when no secret is needed/stored.
 */
export async function getConnectionSecretEnv(conn: Connection): Promise<NodeJS.ProcessEnv> {
  const secrets: AskpassSecrets = {}
  if (conn.hasPassword) {
    const pw = await getSecret(conn.id, 'password')
    if (pw) secrets.password = pw
  }
  if (conn.identityKey?.hasPassphrase) {
    const pp = await getSecret(conn.id, 'passphrase')
    if (pp) secrets.passphrase = pp
  }
  return buildAskpassEnv(secrets)
}

/**
 * Inspect the configured rsync binary path and pick the most likely path-style
 * convention. Best-effort heuristic; user can override via Settings.
 */
function detectRsyncPathStyle(rsyncBinary: string): Exclude<RsyncPathStyle, 'auto'> {
  const bin = rsyncBinary.toLowerCase()
  if (bin.includes('wsl')) return 'wsl'
  // chocolatey's `rsync` package ships a Cygwin build (under
  // …\chocolatey\lib\rsync\tools\bin), so it needs `/cygdrive/c/…` too.
  if (bin.includes('cwrsync') || bin.includes('cygwin') || bin.includes('chocolatey'))
    return 'cygdrive'
  // Git Bash / MSYS2 / vanilla rsync.exe — `/c/…` is the most widely accepted form.
  return 'msys'
}

/**
 * Convert a Windows path (e.g. `C:\Users\dell\code`) into the POSIX form
 * rsync's argv parser accepts. No-op on non-Windows.
 *
 * Without this, rsync reads the first colon-before-slash as `host:` and
 * misclassifies a local path as a remote one — hence the "source and
 * destination cannot both be remote" errors users were seeing.
 */
export function toRsyncLocalPath(
  p: string,
  style: RsyncPathStyle,
  rsyncBinary: string
): string {
  if (process.platform !== 'win32') return p
  const effective: Exclude<RsyncPathStyle, 'auto'> =
    style === 'auto' ? detectRsyncPathStyle(rsyncBinary) : style
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p)
  if (!m) {
    // UNC paths or already-POSIX-ish inputs: just normalise slashes.
    return p.replace(/\\/g, '/')
  }
  const drive = m[1].toLowerCase()
  const rest = m[2].replace(/\\/g, '/')
  if (effective === 'wsl') return `/mnt/${drive}/${rest}`
  if (effective === 'msys') return `/${drive}/${rest}`
  return `/cygdrive/${drive}/${rest}`
}
