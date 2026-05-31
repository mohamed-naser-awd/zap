import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { zap, unwrap } from '@renderer/lib/ipc'
import type {
  AppSettings,
  Command,
  Connection,
  Project,
  TunnelHistoryEntry,
  TunnelSpec,
  Workflow
} from '@shared/types'

type StoreState = {
  connections: Connection[]
  projects: Project[]
  workflows: Workflow[]
  commands: Command[]
  tunnelHistory: TunnelHistoryEntry[]
  settings: AppSettings | null
  ready: boolean
}

type StoreActions = {
  refresh: () => Promise<void>

  createConnection(data: Omit<Connection, 'id'>): Promise<Connection>
  updateConnection(data: Connection): Promise<Connection>
  deleteConnection(id: string): Promise<void>

  createProject(data: Omit<Project, 'id'>): Promise<Project>
  updateProject(data: Project): Promise<Project>
  deleteProject(id: string): Promise<void>

  createWorkflow(data: Omit<Workflow, 'id'>): Promise<Workflow>
  updateWorkflow(data: Workflow): Promise<Workflow>
  deleteWorkflow(id: string): Promise<void>

  createCommand(data: Omit<Command, 'id'>): Promise<Command>
  updateCommand(data: Command): Promise<Command>
  deleteCommand(id: string): Promise<void>

  upsertTunnelHistory(connectionId: string, spec: TunnelSpec): Promise<TunnelHistoryEntry>
  deleteTunnelHistory(id: string): Promise<void>
  setTunnelHistoryPinned(id: string, pinned: boolean): Promise<TunnelHistoryEntry>

  saveSettings(next: AppSettings): Promise<AppSettings>
}

const initialState: StoreState = {
  connections: [],
  projects: [],
  workflows: [],
  commands: [],
  tunnelHistory: [],
  settings: null,
  ready: false
}

type StoreValue = StoreState & StoreActions

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>(initialState)

  const refresh = useCallback(async () => {
    const [connections, projects, workflows, commands, tunnelHistory, settings] = await Promise.all([
      unwrap(zap.connections.list()),
      unwrap(zap.projects.list()),
      unwrap(zap.workflows.list()),
      unwrap(zap.commands.list()),
      unwrap(zap.tunnelHistory.list()),
      unwrap(zap.settings.get())
    ])
    setState({ connections, projects, workflows, commands, tunnelHistory, settings, ready: true })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const actions = useMemo<StoreActions>(
    () => ({
      refresh,

      // ── Connections ───────────────────────────────────────────────────────
      async createConnection(data) {
        const saved = await unwrap(zap.connections.create(data))
        setState((s) => ({ ...s, connections: [...s.connections, saved] }))
        return saved
      },
      async updateConnection(data) {
        const saved = await unwrap(zap.connections.update(data))
        setState((s) => ({
          ...s,
          connections: s.connections.map((c) => (c.id === saved.id ? saved : c))
        }))
        return saved
      },
      async deleteConnection(id) {
        await unwrap(zap.connections.delete(id))
        setState((s) => ({
          ...s,
          connections: s.connections.filter((c) => c.id !== id)
        }))
      },

      // ── Projects ──────────────────────────────────────────────────────────
      async createProject(data) {
        const saved = await unwrap(zap.projects.create(data))
        setState((s) => ({ ...s, projects: [...s.projects, saved] }))
        return saved
      },
      async updateProject(data) {
        const saved = await unwrap(zap.projects.update(data))
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) => (p.id === saved.id ? saved : p))
        }))
        return saved
      },
      async deleteProject(id) {
        await unwrap(zap.projects.delete(id))
        setState((s) => ({
          ...s,
          projects: s.projects.filter((p) => p.id !== id),
          // Main also detaches connections on delete; mirror that in the cache.
          connections: s.connections.map((c) =>
            c.projectId === id ? { ...c, projectId: undefined } : c
          )
        }))
      },

      // ── Workflows ─────────────────────────────────────────────────────────
      async createWorkflow(data) {
        const saved = await unwrap(zap.workflows.create(data))
        setState((s) => ({ ...s, workflows: [...s.workflows, saved] }))
        return saved
      },
      async updateWorkflow(data) {
        const saved = await unwrap(zap.workflows.update(data))
        setState((s) => ({
          ...s,
          workflows: s.workflows.map((w) => (w.id === saved.id ? saved : w))
        }))
        return saved
      },
      async deleteWorkflow(id) {
        await unwrap(zap.workflows.delete(id))
        setState((s) => ({
          ...s,
          workflows: s.workflows.filter((w) => w.id !== id)
        }))
      },

      // ── Commands ──────────────────────────────────────────────────────────
      async createCommand(data) {
        const saved = await unwrap(zap.commands.create(data))
        setState((s) => ({ ...s, commands: [...s.commands, saved] }))
        return saved
      },
      async updateCommand(data) {
        const saved = await unwrap(zap.commands.update(data))
        setState((s) => ({
          ...s,
          commands: s.commands.map((c) => (c.id === saved.id ? saved : c))
        }))
        return saved
      },
      async deleteCommand(id) {
        await unwrap(zap.commands.delete(id))
        setState((s) => ({
          ...s,
          commands: s.commands.filter((c) => c.id !== id)
        }))
      },

      // ── Tunnel history ────────────────────────────────────────────────────
      async upsertTunnelHistory(connectionId, spec) {
        const saved = await unwrap(zap.tunnelHistory.upsert(connectionId, spec))
        // Main owns the LRU/dedup/sort logic; re-fetch the list rather than
        // trying to mirror it here.
        const list = await unwrap(zap.tunnelHistory.list())
        setState((s) => ({ ...s, tunnelHistory: list }))
        return saved
      },
      async deleteTunnelHistory(id) {
        await unwrap(zap.tunnelHistory.delete(id))
        setState((s) => ({
          ...s,
          tunnelHistory: s.tunnelHistory.filter((e) => e.id !== id)
        }))
      },
      async setTunnelHistoryPinned(id, pinned) {
        const saved = await unwrap(zap.tunnelHistory.setPinned(id, pinned))
        const list = await unwrap(zap.tunnelHistory.list())
        setState((s) => ({ ...s, tunnelHistory: list }))
        return saved
      },

      // ── Settings ──────────────────────────────────────────────────────────
      async saveSettings(next) {
        const saved = await unwrap(zap.settings.set(next))
        setState((s) => ({ ...s, settings: saved }))
        return saved
      }
    }),
    [refresh]
  )

  const value = useMemo<StoreValue>(() => ({ ...state, ...actions }), [state, actions])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
