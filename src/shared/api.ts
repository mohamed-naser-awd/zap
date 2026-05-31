import type {
  AppSettings,
  Command,
  Connection,
  FsEntry,
  Project,
  RsyncJob,
  RsyncProgress,
  SecretKind,
  TerminalSpawnOpts,
  Tunnel,
  TunnelHistoryEntry,
  TunnelSpec,
  Workflow,
  WorkflowRun,
  WorkflowRunOpts
} from './types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type Unsubscribe = () => void

export interface ZapApi {
  connections: {
    list(): Promise<Result<Connection[]>>
    get(id: string): Promise<Result<Connection>>
    create(data: Omit<Connection, 'id'>): Promise<Result<Connection>>
    update(data: Connection): Promise<Result<Connection>>
    delete(id: string): Promise<Result<boolean>>
  }
  projects: {
    list(): Promise<Result<Project[]>>
    get(id: string): Promise<Result<Project>>
    create(data: Omit<Project, 'id'>): Promise<Result<Project>>
    update(data: Project): Promise<Result<Project>>
    delete(id: string): Promise<Result<boolean>>
  }
  secrets: {
    set(id: string, kind: SecretKind, value: string): Promise<Result<boolean>>
    get(id: string, kind: SecretKind): Promise<Result<string | null>>
    delete(id: string, kind: SecretKind): Promise<Result<boolean>>
  }
  settings: {
    get(): Promise<Result<AppSettings>>
    set(s: AppSettings): Promise<Result<AppSettings>>
  }
  app: {
    isPackaged(): Promise<Result<boolean>>
  }
  commands: {
    list(): Promise<Result<Command[]>>
    get(id: string): Promise<Result<Command>>
    create(data: Omit<Command, 'id'>): Promise<Result<Command>>
    update(data: Command): Promise<Result<Command>>
    delete(id: string): Promise<Result<boolean>>
  }
  terminal: {
    spawn(opts: TerminalSpawnOpts): Promise<Result<{ id: string; name: string | null }>>
    write(id: string, data: string): Promise<Result<boolean>>
    resize(id: string, cols: number, rows: number): Promise<Result<boolean>>
    kill(id: string): Promise<Result<boolean>>
    listNamed(): Promise<Result<Array<{ id: string; name?: string; cols: number; rows: number }>>>
    onData(cb: (p: { id: string; data: string }) => void): Unsubscribe
    onExit(cb: (p: { id: string; exitCode: number; signal?: string }) => void): Unsubscribe
  }
  tunnels: {
    start(opts: { connectionId: string; spec: TunnelSpec }): Promise<Result<Tunnel>>
    stop(id: string): Promise<Result<boolean>>
    list(): Promise<Result<Tunnel[]>>
    onStatus(cb: (t: Tunnel) => void): Unsubscribe
  }
  tunnelHistory: {
    list(): Promise<Result<TunnelHistoryEntry[]>>
    upsert(connectionId: string, spec: TunnelSpec): Promise<Result<TunnelHistoryEntry>>
    delete(id: string): Promise<Result<boolean>>
    setPinned(id: string, pinned: boolean): Promise<Result<TunnelHistoryEntry>>
  }
  rsync: {
    start(opts: {
      connectionId: string
      direction: 'push' | 'pull'
      source: string
      dest: string
      flags: string[]
    }): Promise<Result<RsyncJob>>
    cancel(id: string): Promise<Result<boolean>>
    list(): Promise<Result<RsyncJob[]>>
    onProgress(cb: (p: { id: string; progress: RsyncProgress }) => void): Unsubscribe
    onDone(cb: (p: { id: string; status: string; exitCode?: number; stderr?: string }) => void): Unsubscribe
  }
  sftp: {
    list(connectionId: string, path: string): Promise<Result<FsEntry[]>>
    mkdir(connectionId: string, path: string): Promise<Result<boolean>>
    delete(connectionId: string, path: string, isDir: boolean): Promise<Result<boolean>>
    rename(connectionId: string, from: string, to: string): Promise<Result<boolean>>
  }
  fs: {
    home(): Promise<Result<string>>
    list(path: string): Promise<Result<{ path: string; sep: string; entries: FsEntry[] }>>
    mkdir(path: string): Promise<Result<boolean>>
    delete(path: string, isDir: boolean): Promise<Result<boolean>>
    rename(from: string, to: string): Promise<Result<boolean>>
  }
  dialog: {
    open(opts: {
      mode: 'file' | 'directory'
      title?: string
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }): Promise<Result<string | null>>
  }
  logs: {
    getPath(): Promise<Result<{ path: string; dir: string; size: number }>>
    reveal(): Promise<Result<boolean>>
    open(): Promise<Result<boolean>>
  }
  dragout: {
    fromLocal(paths: string[]): Promise<Result<boolean>>
    fromRemote(
      connectionId: string,
      items: Array<{ path: string; isDir: boolean }>
    ): Promise<Result<{ localPaths: string[]; startedDrag: boolean; dir: string }>>
  }
  workflows: {
    list(): Promise<Result<Workflow[]>>
    get(id: string): Promise<Result<Workflow>>
    create(data: Omit<Workflow, 'id'>): Promise<Result<Workflow>>
    update(data: Workflow): Promise<Result<Workflow>>
    delete(id: string): Promise<Result<boolean>>
    run(opts: WorkflowRunOpts): Promise<Result<{ runId: string }>>
    cancelRun(id: string): Promise<Result<boolean>>
    getRun(id: string): Promise<Result<WorkflowRun>>
    listRuns(workflowId?: string): Promise<Result<WorkflowRun[]>>
    onRunStatus(cb: (p: { runId: string; status: string }) => void): Unsubscribe
    onStepStatus(
      cb: (p: { runId: string; stepId: string; status: string; exitCode?: number }) => void
    ): Unsubscribe
    onStepOutput(
      cb: (p: { runId: string; stepId: string; kind: 'stdout' | 'stderr'; chunk: string }) => void
    ): Unsubscribe
  }
}
