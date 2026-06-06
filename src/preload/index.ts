import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { ZapApi } from '@shared/api'
import type {
  AppSettings,
  Command,
  Connection,
  FsEntry,
  Project,
  RsyncJob,
  SecretKind,
  TerminalSpawnOpts,
  Tunnel,
  TunnelHistoryEntry,
  TunnelSpec,
  Workflow,
  WorkflowRun,
  WorkflowRunOpts
} from '@shared/types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, ...args)
}

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_e: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: ZapApi = {
  connections: {
    list: () => invoke<Connection[]>(IpcChannels.connectionsList),
    get: (id: string) => invoke<Connection>(IpcChannels.connectionsGet, id),
    create: (data: Omit<Connection, 'id'>) => invoke<Connection>(IpcChannels.connectionsCreate, data),
    update: (data: Connection) => invoke<Connection>(IpcChannels.connectionsUpdate, data),
    delete: (id: string) => invoke<boolean>(IpcChannels.connectionsDelete, id)
  },
  projects: {
    list: () => invoke<Project[]>(IpcChannels.projectsList),
    get: (id: string) => invoke<Project>(IpcChannels.projectsGet, id),
    create: (data: Omit<Project, 'id'>) => invoke<Project>(IpcChannels.projectsCreate, data),
    update: (data: Project) => invoke<Project>(IpcChannels.projectsUpdate, data),
    delete: (id: string) => invoke<boolean>(IpcChannels.projectsDelete, id)
  },
  secrets: {
    set: (id: string, kind: SecretKind, value: string) =>
      invoke<boolean>(IpcChannels.secretsSet, { id, kind, value }),
    get: (id: string, kind: SecretKind) => invoke<string | null>(IpcChannels.secretsGet, { id, kind }),
    delete: (id: string, kind: SecretKind) => invoke<boolean>(IpcChannels.secretsDelete, { id, kind })
  },
  settings: {
    get: () => invoke<AppSettings>(IpcChannels.settingsGet),
    set: (s: AppSettings) => invoke<AppSettings>(IpcChannels.settingsSet, s)
  },
  app: {
    isPackaged: () => invoke<boolean>(IpcChannels.appIsPackaged)
  },
  commands: {
    list: () => invoke<Command[]>(IpcChannels.commandsList),
    get: (id: string) => invoke<Command>(IpcChannels.commandsGet, id),
    create: (data: Omit<Command, 'id'>) => invoke<Command>(IpcChannels.commandsCreate, data),
    update: (data: Command) => invoke<Command>(IpcChannels.commandsUpdate, data),
    delete: (id: string) => invoke<boolean>(IpcChannels.commandsDelete, id)
  },
  terminal: {
    spawn: (opts: TerminalSpawnOpts) => invoke<{ id: string; name: string | null }>(IpcChannels.terminalSpawn, opts),
    write: (id: string, data: string) => invoke<boolean>(IpcChannels.terminalWrite, { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      invoke<boolean>(IpcChannels.terminalResize, { id, cols, rows }),
    kill: (id: string) => invoke<boolean>(IpcChannels.terminalKill, id),
    listNamed: () => invoke<Array<{ id: string; name?: string; cols: number; rows: number }>>(IpcChannels.terminalListNamed),
    onData: (cb: (p: { id: string; data: string }) => void) => on(IpcChannels.terminalData, cb),
    onExit: (cb: (p: { id: string; exitCode: number; signal?: string }) => void) => on(IpcChannels.terminalExit, cb)
  },
  tunnels: {
    start: (opts: { connectionId: string; spec: TunnelSpec }) => invoke<Tunnel>(IpcChannels.tunnelsStart, opts),
    stop: (id: string) => invoke<boolean>(IpcChannels.tunnelsStop, id),
    list: () => invoke<Tunnel[]>(IpcChannels.tunnelsList),
    onStatus: (cb: (t: Tunnel) => void) => on(IpcChannels.tunnelsStatus, cb)
  },
  tunnelHistory: {
    list: () => invoke<TunnelHistoryEntry[]>(IpcChannels.tunnelHistoryList),
    upsert: (connectionId: string, spec: TunnelSpec) =>
      invoke<TunnelHistoryEntry>(IpcChannels.tunnelHistoryUpsert, { connectionId, spec }),
    delete: (id: string) => invoke<boolean>(IpcChannels.tunnelHistoryDelete, id),
    setPinned: (id: string, pinned: boolean) =>
      invoke<TunnelHistoryEntry>(IpcChannels.tunnelHistorySetPinned, { id, pinned })
  },
  rsync: {
    start: (opts: { connectionId: string; direction: 'push' | 'pull'; source: string; dest: string; flags: string[] }) =>
      invoke<RsyncJob>(IpcChannels.rsyncStart, opts),
    cancel: (id: string) => invoke<boolean>(IpcChannels.rsyncCancel, id),
    list: () => invoke<RsyncJob[]>(IpcChannels.rsyncList),
    onProgress: (cb: (p: { id: string; progress: { pct: number; rate: string; eta: string; transferredBytes: number } }) => void) =>
      on(IpcChannels.rsyncProgress, cb),
    onDone: (cb: (p: { id: string; status: string; exitCode?: number; stderr?: string; direction: 'push' | 'pull' }) => void) =>
      on(IpcChannels.rsyncDone, cb)
  },
  sftp: {
    list: (connectionId: string, path: string) => invoke<FsEntry[]>(IpcChannels.sftpList, { connectionId, path }),
    mkdir: (connectionId: string, path: string) => invoke<boolean>(IpcChannels.sftpMkdir, { connectionId, path }),
    delete: (connectionId: string, path: string, isDir: boolean) =>
      invoke<boolean>(IpcChannels.sftpDelete, { connectionId, path, isDir }),
    rename: (connectionId: string, from: string, to: string) =>
      invoke<boolean>(IpcChannels.sftpRename, { connectionId, from, to })
  },
  fs: {
    home: () => invoke<string>(IpcChannels.fsHome),
    list: (path: string) => invoke<{ path: string; sep: string; entries: FsEntry[] }>(IpcChannels.fsList, path),
    mkdir: (path: string) => invoke<boolean>(IpcChannels.fsMkdir, path),
    delete: (path: string, isDir: boolean) => invoke<boolean>(IpcChannels.fsDelete, { path, isDir }),
    rename: (from: string, to: string) => invoke<boolean>(IpcChannels.fsRename, { from, to })
  },
  dialog: {
    open: (opts: {
      mode: 'file' | 'directory'
      title?: string
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => invoke<string | null>(IpcChannels.dialogOpen, opts)
  },
  logs: {
    getPath: () => invoke<{ path: string; dir: string; size: number }>(IpcChannels.logsGetPath),
    reveal: () => invoke<boolean>(IpcChannels.logsReveal),
    open: () => invoke<boolean>(IpcChannels.logsOpen)
  },
  dragout: {
    fromLocal: (paths: string[]) => invoke<boolean>(IpcChannels.dragoutFromLocal, { paths }),
    fromRemote: (connectionId: string, items: Array<{ path: string; isDir: boolean }>) =>
      invoke<{ localPaths: string[]; startedDrag: boolean; dir: string }>(
        IpcChannels.dragoutFromRemote,
        { connectionId, items }
      )
  },
  workflows: {
    list: () => invoke<Workflow[]>(IpcChannels.workflowsList),
    get: (id: string) => invoke<Workflow>(IpcChannels.workflowsGet, id),
    create: (data: Omit<Workflow, 'id'>) => invoke<Workflow>(IpcChannels.workflowsCreate, data),
    update: (data: Workflow) => invoke<Workflow>(IpcChannels.workflowsUpdate, data),
    delete: (id: string) => invoke<boolean>(IpcChannels.workflowsDelete, id),
    run: (opts: WorkflowRunOpts) => invoke<{ runId: string }>(IpcChannels.workflowsRun, opts),
    cancelRun: (id: string) => invoke<boolean>(IpcChannels.workflowsCancelRun, id),
    getRun: (id: string) => invoke<WorkflowRun>(IpcChannels.workflowsGetRun, id),
    listRuns: (workflowId?: string) => invoke<WorkflowRun[]>(IpcChannels.workflowsListRuns, workflowId),
    onRunStatus: (cb: (p: { runId: string; status: string }) => void) => on(IpcChannels.workflowsRunStatus, cb),
    onStepStatus: (cb: (p: { runId: string; stepId: string; status: string; exitCode?: number }) => void) =>
      on(IpcChannels.workflowsStepStatus, cb),
    onStepOutput: (cb: (p: { runId: string; stepId: string; kind: 'stdout' | 'stderr'; chunk: string }) => void) =>
      on(IpcChannels.workflowsStepOutput, cb)
  }
}

contextBridge.exposeInMainWorld('zap', api)

