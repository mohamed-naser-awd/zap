export type IdentityKey = {
  path: string
  hasPassphrase: boolean
}

export type Connection = {
  id: string
  name: string
  host: string
  port: number
  user: string
  useAgent: boolean
  identityKey?: IdentityKey
  hasPassword: boolean
  runOnConnect?: string
  /** undefined = unassigned (visible under the built-in "All" project). */
  projectId?: string
}

export type Project = {
  id: string
  name: string
  /** Tailwind-friendly color key (see PROJECT_COLORS in the renderer). */
  color?: string
}

export type WorkflowInput = {
  name: string
  label: string
  type: 'string' | 'secret' | 'select' | 'boolean'
  default?: string
  options?: string[]
  required?: boolean
}

export type TunnelKind = 'local' | 'remote' | 'dynamic'

export type TunnelSpec = {
  kind: TunnelKind
  localHost: string
  localPort: number
  remoteHost?: string
  remotePort?: number
}

export type StepBase = {
  id: string
  name: string
  continueOnError?: boolean
}

export type LocalShellStep = StepBase & {
  type: 'local-shell'
  shell: 'bash' | 'pwsh' | 'cmd' | 'other'
  interpreter?: string
  command: string
  cwd?: string
}

export type ScriptStep = StepBase & {
  type: 'script'
  interpreter: string
  scriptPath: string
  args: string[]
  cwd?: string
}

export type SshExecStep = StepBase & {
  type: 'ssh-exec'
  connectionId: string
  command: string
  captureOutput: boolean
}

export type TunnelStep = StepBase & {
  type: 'tunnel'
  action: 'start' | 'stop'
  connectionId: string
  spec: TunnelSpec
  holdOpen?: boolean
}

export type RsyncStep = StepBase & {
  type: 'rsync'
  connectionId: string
  direction: 'push' | 'pull'
  source: string
  dest: string
  flags: string[]
}

export type SendToTerminalStep = StepBase & {
  type: 'send-to-terminal'
  terminalName: string
  connectionId?: string
  text: string
  appendNewline: boolean
  openIfMissing: boolean
}

export type Step =
  | LocalShellStep
  | ScriptStep
  | SshExecStep
  | TunnelStep
  | RsyncStep
  | SendToTerminalStep

export type Workflow = {
  id: string
  name: string
  description?: string
  inputs: WorkflowInput[]
  steps: Step[]
}

export type StepRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export type StepRun = {
  stepId: string
  status: StepRunStatus
  stdout: string
  stderr: string
  exitCode?: number
  startedAt?: number
  endedAt?: number
}

export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'cancelled'

export type WorkflowRun = {
  id: string
  workflowId: string
  startedAt: number
  endedAt?: number
  status: WorkflowRunStatus
  vars: Record<string, string>
  steps: StepRun[]
}

export type CommandArg = {
  name: string // identifier used in {{ vars.NAME }}
  label: string // shown in the popup form
}

export type Command = {
  id: string
  slug: string
  label: string
  description?: string
  /** What happens when chosen. Absent = 'text' (back-compat for existing commands). */
  kind?: 'text' | 'workflow'
  /** kind 'text' — inserted at the prompt; may contain {{ vars.NAME }} tokens. */
  body: string
  /** kind 'text' — fields prompted before insertion. */
  args?: CommandArg[]
  /** kind 'workflow' — id of the workflow to run. */
  workflowId?: string
}

export type TunnelStatus = 'starting' | 'running' | 'stopped' | 'error'

export type Tunnel = {
  id: string
  connectionId: string
  spec: TunnelSpec
  status: TunnelStatus
  startedAt?: number
  error?: string
}

export type TunnelHistoryEntry = {
  id: string
  connectionId: string
  spec: TunnelSpec
  lastUsedAt: number
  pinned?: boolean
}

export type TerminalHistoryEntry = {
  id: string
  /** Undefined for local-shell tabs. */
  connectionId?: string
  /** Last-known user-renamed label (falls back to default on re-open). */
  label: string
  /** Last-known color key from PROJECT_COLORS. */
  color?: string
  /** Last-known project the tab lived under. */
  projectId?: string
  lastUsedAt: number
  pinned?: boolean
}

export type RsyncJobStatus = 'running' | 'done' | 'error' | 'cancelled'

export type RsyncProgress = {
  pct: number
  transferredBytes: number
  rate: string
  eta: string
  /** Current file name being transferred (when --progress / --info=name1 is on). */
  file?: string
}

export type RsyncJob = {
  id: string
  connectionId: string
  direction: 'push' | 'pull'
  source: string
  dest: string
  flags: string[]
  status: RsyncJobStatus
  progress?: RsyncProgress
  exitCode?: number
  /** Tail of stderr captured on completion (populated on error/cancel). */
  stderr?: string
  /** Path of the rsync binary that was actually spawned. */
  binary?: string
  /** Argv after path translation — what was ACTUALLY shipped to rsync. */
  argv?: string[]
}

export type RsyncPathStyle = 'auto' | 'cygdrive' | 'msys' | 'wsl'

export type AppSettings = {
  sshBinary: string
  rsyncBinary: string
  defaultRsyncFlags: string[]
  theme: 'light' | 'dark' | 'system'
  /** Register the app with Windows so it launches at user login. */
  launchOnLogin: boolean
  /** When launched, don't show the window — start in the system tray. */
  startMinimized: boolean
  /**
   * How to translate Windows `C:\…` paths into a form rsync's argv parser
   * accepts. `auto` inspects the rsync binary path to pick a style.
   */
  windowsRsyncPathStyle: RsyncPathStyle
}

export type SecretKind = 'password' | 'passphrase'

export type FsEntry = {
  name: string
  path: string
  isDir: boolean
  size?: number
  mtime?: number
}

export type TerminalSpawnOpts = {
  connectionId?: string
  name?: string
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}

export type WorkflowRunOpts = {
  id: string
  vars: Record<string, string>
}
