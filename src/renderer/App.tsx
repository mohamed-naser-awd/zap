import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Terminal as TerminalIcon, Cable, Folder, Workflow as WorkflowIcon, Settings as SettingsIcon, Server, Slash } from 'lucide-react'
import { cn } from './lib/utils'
import ConnectionsView from './routes/Connections'
import TerminalView from './routes/Terminal'
import TunnelsView from './routes/Tunnels'
import FilesView from './routes/Files'
import WorkflowsView from './routes/Workflows'
import CommandsView from './routes/Commands'
import SettingsView from './routes/Settings'

type Route =
  | { name: 'connections' }
  | { name: 'terminal' }
  | { name: 'commands' }
  | { name: 'tunnels' }
  | { name: 'files' }
  | { name: 'workflows' }
  | { name: 'settings' }

const NAV: { id: Route['name']; label: string; icon: LucideIcon }[] = [
  { id: 'connections', label: 'Connections', icon: Server },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  { id: 'commands', label: 'Commands', icon: Slash },
  { id: 'tunnels', label: 'Tunnels', icon: Cable },
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
]

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'connections' })

  return (
    <div className="flex h-full w-full">
      <aside className="w-44 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-3 text-sm font-semibold">Zap</div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map((n) => {
            const Icon = n.icon
            const active = route.name === n.id
            return (
              <button
                key={n.id}
                onClick={() => setRoute({ name: n.id } as Route)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  active
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon size={14} />
                {n.label}
              </button>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden relative">
        {route.name === 'connections' && <ConnectionsView />}
        {route.name === 'commands' && <CommandsView />}
        {route.name === 'tunnels' && <TunnelsView />}
        {route.name === 'files' && <FilesView />}
        {route.name === 'workflows' && <WorkflowsView />}
        {route.name === 'settings' && <SettingsView />}
        {/*
          TerminalView stays mounted across route changes so ptys + xterm
          scrollback survive. Other routes are cheap and stay conditional.
        */}
        <div className={cn('absolute inset-0', route.name === 'terminal' ? 'block' : 'hidden')}>
          <TerminalView />
        </div>
      </main>
    </div>
  )
}
