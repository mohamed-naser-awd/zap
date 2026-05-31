import Store from 'electron-store'
import type {
  AppSettings,
  Command,
  Connection,
  Project,
  TunnelHistoryEntry,
  Workflow,
  WorkflowRun
} from '@shared/types'

type Schema = {
  connections: Connection[]
  projects: Project[]
  workflows: Workflow[]
  runs: WorkflowRun[]
  commands: Command[]
  tunnelHistory: TunnelHistoryEntry[]
  settings: AppSettings
}

const defaultSettings: AppSettings = {
  sshBinary: process.platform === 'win32' ? 'ssh.exe' : 'ssh',
  rsyncBinary: process.platform === 'win32' ? 'rsync.exe' : 'rsync',
  defaultRsyncFlags: ['-avz', '--progress'],
  theme: 'system',
  launchOnLogin: false,
  startMinimized: false,
  windowsRsyncPathStyle: 'auto'
}

let store: Store<Schema> | null = null
let connectionsMigrated = false

function getStore(): Store<Schema> {
  if (!store) {
    store = new Store<Schema>({
      name: 'zap',
      defaults: {
        connections: [],
        projects: [],
        workflows: [],
        runs: [],
        commands: [],
        tunnelHistory: [],
        settings: defaultSettings
      }
    })
  }
  return store
}

type LegacyAuth =
  | { type: 'key'; keyPath: string; hasPassphrase: boolean }
  | { type: 'password' }
  | { type: 'agent' }

type AnyConnection = Connection & { auth?: LegacyAuth }

function needsMigration(c: AnyConnection): boolean {
  if (c.auth !== undefined) return true
  if (typeof c.useAgent !== 'boolean') return true
  if (typeof c.hasPassword !== 'boolean') return true
  return false
}

function migrateConnection(c: AnyConnection): Connection {
  const out: Connection = {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    user: c.user,
    runOnConnect: c.runOnConnect,
    useAgent: typeof c.useAgent === 'boolean' ? c.useAgent : false,
    hasPassword: typeof c.hasPassword === 'boolean' ? c.hasPassword : false
  }
  if (c.identityKey) out.identityKey = c.identityKey
  if (c.auth?.type === 'key') {
    out.identityKey = { path: c.auth.keyPath, hasPassphrase: !!c.auth.hasPassphrase }
  } else if (c.auth?.type === 'password') {
    out.hasPassword = true
  } else if (c.auth?.type === 'agent') {
    out.useAgent = true
  }
  return out
}

function ensureConnectionsMigrated(s: Store<Schema>) {
  if (connectionsMigrated) return
  connectionsMigrated = true
  const raw = s.get('connections') as AnyConnection[]
  if (!raw.some(needsMigration)) return
  s.set('connections', raw.map(migrateConnection))
}

export const db = {
  connections: {
    list: (): Connection[] => {
      const s = getStore()
      ensureConnectionsMigrated(s)
      return s.get('connections')
    },
    set: (v: Connection[]) => getStore().set('connections', v)
  },
  workflows: {
    list: (): Workflow[] => getStore().get('workflows'),
    set: (v: Workflow[]) => getStore().set('workflows', v)
  },
  runs: {
    list: (): WorkflowRun[] => getStore().get('runs'),
    set: (v: WorkflowRun[]) => getStore().set('runs', v),
    push: (run: WorkflowRun, cap = 200) => {
      const all = getStore().get('runs')
      all.unshift(run)
      while (all.length > cap) all.pop()
      getStore().set('runs', all)
    },
    update: (id: string, patch: Partial<WorkflowRun>) => {
      const all = getStore().get('runs')
      const i = all.findIndex((r) => r.id === id)
      if (i >= 0) {
        all[i] = { ...all[i], ...patch }
        getStore().set('runs', all)
      }
    }
  },
  commands: {
    list: (): Command[] => getStore().get('commands'),
    set: (v: Command[]) => getStore().set('commands', v)
  },
  projects: {
    list: (): Project[] => getStore().get('projects'),
    set: (v: Project[]) => getStore().set('projects', v)
  },
  tunnelHistory: {
    list: (): TunnelHistoryEntry[] => getStore().get('tunnelHistory'),
    set: (v: TunnelHistoryEntry[]) => getStore().set('tunnelHistory', v)
  },
  settings: {
    get: (): AppSettings => ({ ...defaultSettings, ...getStore().get('settings') }),
    set: (v: AppSettings) => getStore().set('settings', v)
  }
}
