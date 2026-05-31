import { z } from 'zod'

export const identityKeySchema = z.object({
  path: z.string().min(1),
  hasPassphrase: z.boolean()
})

export const connectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  useAgent: z.boolean(),
  identityKey: identityKeySchema.optional(),
  hasPassword: z.boolean(),
  runOnConnect: z.string().optional(),
  projectId: z.string().optional()
})

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().optional()
})

// tunnelSpecSchema is declared later in the file; the history schema is defined
// alongside it (see end of file).

export const workflowInputSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid identifier'),
  label: z.string(),
  type: z.enum(['string', 'secret', 'select', 'boolean']),
  default: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional()
})

export const tunnelSpecSchema = z.object({
  kind: z.enum(['local', 'remote', 'dynamic']),
  localHost: z.string().min(1),
  localPort: z.number().int().min(1).max(65535),
  remoteHost: z.string().optional(),
  remotePort: z.number().int().min(1).max(65535).optional()
})

export const tunnelHistoryEntrySchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  spec: tunnelSpecSchema,
  lastUsedAt: z.number(),
  pinned: z.boolean().optional()
})

const baseStep = {
  id: z.string(),
  name: z.string(),
  continueOnError: z.boolean().optional()
}

export const stepSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseStep,
    type: z.literal('local-shell'),
    shell: z.enum(['bash', 'pwsh', 'cmd', 'other']),
    interpreter: z.string().optional(),
    command: z.string(),
    cwd: z.string().optional()
  }),
  z.object({
    ...baseStep,
    type: z.literal('script'),
    interpreter: z.string().min(1),
    scriptPath: z.string().min(1),
    args: z.array(z.string()),
    cwd: z.string().optional()
  }),
  z.object({
    ...baseStep,
    type: z.literal('ssh-exec'),
    connectionId: z.string(),
    command: z.string(),
    captureOutput: z.boolean()
  }),
  z.object({
    ...baseStep,
    type: z.literal('tunnel'),
    action: z.enum(['start', 'stop']),
    connectionId: z.string(),
    spec: tunnelSpecSchema,
    holdOpen: z.boolean().optional()
  }),
  z.object({
    ...baseStep,
    type: z.literal('rsync'),
    connectionId: z.string(),
    direction: z.enum(['push', 'pull']),
    source: z.string(),
    dest: z.string(),
    flags: z.array(z.string())
  }),
  z.object({
    ...baseStep,
    type: z.literal('send-to-terminal'),
    terminalName: z.string(),
    connectionId: z.string().optional(),
    text: z.string(),
    appendNewline: z.boolean(),
    openIfMissing: z.boolean()
  })
])

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  inputs: z.array(workflowInputSchema),
  steps: z.array(stepSchema)
})

export const commandArgSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid identifier'),
  label: z.string()
})

export const commandSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'slug must be alphanumeric, dash, or underscore'),
  label: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['text', 'workflow']).optional(),
  body: z.string().default(''),
  args: z.array(commandArgSchema).optional(),
  workflowId: z.string().optional()
})

export const appSettingsSchema = z.object({
  sshBinary: z.string(),
  rsyncBinary: z.string(),
  defaultRsyncFlags: z.array(z.string()),
  theme: z.enum(['light', 'dark', 'system']),
  launchOnLogin: z.boolean().default(false),
  startMinimized: z.boolean().default(false),
  windowsRsyncPathStyle: z.enum(['auto', 'cygdrive', 'msys', 'wsl']).default('auto')
})

export const secretKindSchema = z.enum(['password', 'passphrase'])

export const terminalSpawnOptsSchema = z.object({
  connectionId: z.string().optional(),
  name: z.string().optional(),
  shell: z.string().optional(),
  cwd: z.string().optional(),
  cols: z.number().int().optional(),
  rows: z.number().int().optional()
})

export const workflowRunOptsSchema = z.object({
  id: z.string(),
  vars: z.record(z.string(), z.string())
})

export const rsyncStartOptsSchema = z.object({
  connectionId: z.string(),
  direction: z.enum(['push', 'pull']),
  source: z.string(),
  dest: z.string(),
  flags: z.array(z.string())
})

export const tunnelStartOptsSchema = z.object({
  connectionId: z.string(),
  spec: tunnelSpecSchema
})
