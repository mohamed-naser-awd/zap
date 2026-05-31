import { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Select } from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { cn, colorStyles, PROJECT_COLOR_KEYS } from '@renderer/lib/utils'
import { XTerm } from '@renderer/components/XTerm'
import { useStore } from '@renderer/store'
import { usePrompt } from '@renderer/lib/usePrompt'

type Tab = {
  id: string
  /** Current label shown on the tab (renamable). */
  label: string
  /** Original label from the connection name, used for resets. */
  defaultLabel: string
  /** Tailwind color key (see PROJECT_COLORS). undefined = no tint. */
  color?: string
  connectionId?: string
  sessionName?: string
  /** Which project this tab belongs to. undefined = no project ("All"). */
  projectId?: string
}

const ALL_PROJECT = '__all__'
const NEW_PROJECT_SENTINEL = '__new_project__'

let counter = 0
const nextId = () => `tab-${++counter}`

export default function TerminalView() {
  const store = useStore()
  const prompt = usePrompt()
  const conns = store.connections
  const projects = store.projects
  const commands = store.commands

  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [activeProject, setActiveProject] = useState<string>(ALL_PROJECT)
  // Tab being edited via the modal dialog (rename + color).
  const [editTabId, setEditTabId] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('zap.activeProject')
    if (saved) setActiveProject(saved)
  }, [])

  useEffect(() => {
    localStorage.setItem('zap.activeProject', activeProject)
  }, [activeProject])

  const openTab = (opts: { connectionId?: string; label: string }) => {
    const id = nextId()
    setTabs((t) => [
      ...t,
      {
        id,
        label: opts.label,
        defaultLabel: opts.label,
        connectionId: opts.connectionId,
        sessionName: id,
        projectId: activeProject === ALL_PROJECT ? undefined : activeProject
      }
    ])
    setActive(id)
  }

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (active === id) setActive(next[next.length - 1]?.id ?? null)
      return next
    })
  }

  const updateTab = (id: string, patch: Partial<Tab>) => {
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  const onPickerChange = (v: string) => {
    if (!v) return
    if (v === '__local') openTab({ label: 'local' })
    else {
      const c = conns.find((x) => x.id === v)
      if (c) openTab({ connectionId: c.id, label: c.name })
    }
  }

  const onProjectPick = async (raw: string) => {
    if (raw === NEW_PROJECT_SENTINEL) {
      const name = (await prompt('New project name'))?.trim()
      if (!name) return
      try {
        const created = await store.createProject({ name })
        setActiveProject(created.id)
      } catch (e) {
        window.alert((e as Error).message)
      }
      return
    }
    setActiveProject(raw)
  }

  // Connections shown in the new-terminal picker: only those matching the
  // active project (or all when the All tab is selected).
  const visibleConns =
    activeProject === ALL_PROJECT
      ? conns
      : conns.filter((c) => c.projectId === activeProject)

  // Tabs shown in the strip + the xterm area: same filter.
  const visibleTabs =
    activeProject === ALL_PROJECT ? tabs : tabs.filter((t) => t.projectId === activeProject)

  // Project chip rendering
  const projectChip = (id: string) => {
    const p = projects.find((x) => x.id === id)
    return p
      ? { name: p.name, ...colorStyles(p.color) }
      : { name: 'All', ...colorStyles(undefined) }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Project switcher — top layer */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 bg-card/40">
        <button
          onClick={() => setActiveProject(ALL_PROJECT)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs',
            activeProject === ALL_PROJECT
              ? 'bg-secondary text-secondary-foreground border-border'
              : 'text-muted-foreground hover:bg-accent'
          )}
        >
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          All
        </button>
        {projects.map((p) => {
          const c = colorStyles(p.color)
          const isActive = activeProject === p.id
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer',
                isActive
                  ? `bg-secondary text-secondary-foreground border-border ${c.tint}`
                  : 'border-transparent text-muted-foreground hover:bg-accent'
              )}
              onClick={() => setActiveProject(p.id)}
            >
              <span className={`h-2 w-2 rounded-full ${c.dot}`} />
              {p.name}
            </div>
          )
        })}
        <Select
          value=""
          onChange={(e) => onProjectPick(e.target.value)}
          className="h-7 text-xs ml-1 w-36"
        >
          <option value="">project ▾</option>
          {projects.length > 0 && <option disabled>──────</option>}
          <option value={NEW_PROJECT_SENTINEL}>+ new project…</option>
        </Select>
      </div>

      {/* Terminal tabs */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 overflow-x-auto">
        {visibleTabs.map((t) => {
          const c = colorStyles(t.color)
          const isActive = active === t.id
          // When the tab has a color, fill the whole pill with it — strong for
          // the active tab, softer for inactive but still visible. When no
          // color is set, fall back to the original neutral styling.
          const colored = !!t.color
          const tabClasses = colored
            ? cn(
                'border',
                isActive ? c.bgActive : c.bgInactive,
                c.border,
                c.text,
                isActive && 'ring-1 ring-inset ring-foreground/20'
              )
            : cn(
                'border',
                isActive
                  ? 'bg-secondary text-secondary-foreground border-border'
                  : 'border-transparent text-muted-foreground hover:bg-accent'
              )
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-pointer shrink-0',
                tabClasses
              )}
              onClick={() => setActive(t.id)}
              onDoubleClick={() => setEditTabId(t.id)}
              title="Double-click to rename / color"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  colored ? 'bg-white/80 ring-1 ring-white/40' : c.dot
                )}
              />
              <span className="truncate max-w-[160px]">{t.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <Select
          value=""
          onChange={(e) => onPickerChange(e.target.value)}
          className="h-7 text-xs ml-1 w-44"
        >
          <option value="">+ new terminal…</option>
          <option value="__local">Local shell</option>
          {visibleConns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {activeProject !== ALL_PROJECT && visibleConns.length === 0 && (
          <span className="text-[11px] text-muted-foreground ml-2">
            <Plus size={10} className="inline -mt-0.5" /> assign connections to{' '}
            {projectChip(activeProject).name} on the Connections page
          </span>
        )}
      </div>

      {/* Terminal panes — render ALL tabs (regardless of active project) so
          switching projects doesn't unmount any xterm; visibility handled
          per-tab with `block`/`hidden`. */}
      <div className="flex-1 min-h-0">
        {tabs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Open a connection or a local shell to start.
          </div>
        ) : (
          tabs.map((t) => {
            const inProject =
              activeProject === ALL_PROJECT || t.projectId === activeProject
            const isActive = active === t.id && inProject
            return (
              <div key={t.id} className={cn('h-full w-full', isActive ? 'block' : 'hidden')}>
                <XTerm
                  connectionId={t.connectionId}
                  sessionName={t.sessionName}
                  commands={commands}
                  onClose={() => closeTab(t.id)}
                />
              </div>
            )
          })
        )}
      </div>

      {editTabId && (
        <TabSettingsModal
          tab={tabs.find((x) => x.id === editTabId)!}
          onClose={() => setEditTabId(null)}
          onSave={(patch) => {
            updateTab(editTabId, patch)
            setEditTabId(null)
          }}
        />
      )}
    </div>
  )
}

function TabSettingsModal({
  tab,
  onSave,
  onClose
}: {
  tab: Tab
  onSave: (patch: Partial<Tab>) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(tab.label)
  const [color, setColor] = useState<string | undefined>(tab.color)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const submit = () => {
    onSave({ label: label.trim() || tab.defaultLabel, color })
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="w-[460px] max-w-[90vw] shadow-2xl">
        <CardHeader>
          <CardTitle>Terminal tab</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              autoFocus
              value={label}
              placeholder={tab.defaultLabel}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <div className="text-[11px] text-muted-foreground">
              Leave blank to reset to <span className="mono">{tab.defaultLabel}</span>.
            </div>
          </div>

          <div className="space-y-1">
            <Label>Color</Label>
            <div className="grid grid-cols-8 gap-1.5 pt-1">
              <button
                type="button"
                title="No color"
                onClick={() => setColor(undefined)}
                className={cn(
                  'h-8 w-8 rounded-md border bg-transparent flex items-center justify-center',
                  color === undefined
                    ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/50 border-border'
                    : 'border-border hover:bg-accent'
                )}
              >
                <X size={14} className="text-muted-foreground" />
              </button>
              {PROJECT_COLOR_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  title={k}
                  onClick={() => setColor(k)}
                  className={cn(
                    'h-8 w-8 rounded-md border',
                    colorStyles(k).bgActive,
                    colorStyles(k).border,
                    color === k
                      ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/50'
                      : ''
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
