import { useEffect, useState } from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { PathInput } from '@renderer/components/PathInput'
import { exeFilter, formatBytes } from '@renderer/lib/utils'
import { zap, unwrap } from '@renderer/lib/ipc'
import type { AppSettings } from '@shared/types'
import { useStore } from '@renderer/store'

export default function SettingsView() {
  const store = useStore()
  // Local draft mirrors the cached settings so the form can edit without
  // immediately pushing every keystroke through the store.
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [flagsRaw, setFlagsRaw] = useState('')
  const [status, setStatus] = useState<string>('')
  const [logInfo, setLogInfo] = useState<{ path: string; dir: string; size: number } | null>(null)
  // Autostart only makes sense for the packaged build; the dev binary refuses
  // to register itself with Windows. UI grays out the toggles accordingly.
  const [isPackaged, setIsPackaged] = useState<boolean>(true)

  useEffect(() => {
    if (store.settings && !draft) {
      setDraft(store.settings)
      setFlagsRaw(store.settings.defaultRsyncFlags.join(' '))
    }
  }, [store.settings, draft])

  useEffect(() => {
    unwrap(zap.logs.getPath()).then(setLogInfo).catch(() => undefined)
    unwrap(zap.app.isPackaged()).then(setIsPackaged).catch(() => undefined)
  }, [])

  const refreshLogInfo = () => {
    unwrap(zap.logs.getPath()).then(setLogInfo).catch(() => undefined)
  }

  if (!draft) return null
  const settings = draft
  const setSettings = (next: AppSettings) => setDraft(next)

  const save = async () => {
    const next: AppSettings = {
      ...settings,
      defaultRsyncFlags: flagsRaw.split(/\s+/).filter(Boolean)
    }
    try {
      await store.saveSettings(next)
      setStatus('Saved.')
      setTimeout(() => setStatus(''), 1500)
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`)
    }
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <Card>
          <CardHeader>
            <CardTitle>Binaries</CardTitle>
            <CardDescription>Paths to the external tools zap shells out to.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>ssh binary</Label>
              <PathInput
                mode="file"
                value={settings.sshBinary}
                title="Pick ssh binary"
                filters={exeFilter()}
                onChange={(v) => setSettings({ ...settings, sshBinary: v })}
              />
              <div className="text-[11px] text-muted-foreground">e.g. <code>ssh</code> on PATH, or absolute path.</div>
            </div>
            <div className="space-y-1">
              <Label>rsync binary</Label>
              <PathInput
                mode="file"
                value={settings.rsyncBinary}
                title="Pick rsync binary"
                filters={exeFilter()}
                onChange={(v) => setSettings({ ...settings, rsyncBinary: v })}
              />
              <div className="text-[11px] text-muted-foreground">
                On Windows: install via WSL, cwRsync, or Git Bash and provide the absolute path.
              </div>
            </div>
            <div className="space-y-1">
              <Label>Default rsync flags</Label>
              <Input value={flagsRaw} onChange={(e) => setFlagsRaw(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Windows path style for rsync</Label>
              <Select
                value={settings.windowsRsyncPathStyle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    windowsRsyncPathStyle: e.target.value as AppSettings['windowsRsyncPathStyle']
                  })
                }
              >
                <option value="auto">Auto-detect (from rsync binary path)</option>
                <option value="cygdrive">cygdrive — /cygdrive/c/… (cwRsync, Cygwin)</option>
                <option value="msys">msys — /c/… (Git Bash, MSYS2)</option>
                <option value="wsl">wsl — /mnt/c/… (WSL rsync)</option>
              </Select>
              <div className="text-[11px] text-muted-foreground">
                Only used on Windows. Converts <code>C:\…</code> paths into a form rsync's
                argv parser doesn't mistake for a remote host.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>Theme</Label>
              <Select
                value={settings.theme}
                onChange={(e) =>
                  setSettings({ ...settings, theme: e.target.value as AppSettings['theme'] })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Startup &amp; tray</CardTitle>
            <CardDescription>
              When zap launches. The X button always hides to the tray —
              use the tray icon's <em>Quit</em> menu to fully exit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!isPackaged && (
              <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                Autostart toggles are available in the installed build (MSI). In
                dev mode they're disabled because launching the dev electron
                binary from Windows startup would not load this project.
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!isPackaged}
                checked={settings.launchOnLogin}
                onChange={(e) => setSettings({ ...settings, launchOnLogin: e.target.checked })}
              />
              <span>
                <span className="font-medium">Launch zap when Windows starts</span>
                <div className="text-[11px] text-muted-foreground">
                  Registers a Run-key entry so the app starts at login.
                </div>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!isPackaged}
                checked={settings.startMinimized}
                onChange={(e) => setSettings({ ...settings, startMinimized: e.target.checked })}
              />
              <span>
                <span className="font-medium">Start minimized to system tray</span>
                <div className="text-[11px] text-muted-foreground">
                  No window on launch — open from the tray icon (use the "show
                  hidden icons" arrow on Windows).
                </div>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Diagnostic events from the app (rsync, ssh, workflows, errors).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {logInfo ? (
              <>
                <div className="space-y-1">
                  <Label>Log file</Label>
                  <Input value={logInfo.path} readOnly className="mono text-xs" />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  size: {formatBytes(logInfo.size)} · directory: <code>{logInfo.dir}</code>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => zap.logs.open().then(refreshLogInfo)}>
                    <FileText size={14} /> Open log
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => zap.logs.reveal()}>
                    <FolderOpen size={14} /> Show in folder
                  </Button>
                  <Button size="sm" variant="ghost" onClick={refreshLogInfo}>
                    Refresh
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">resolving log path…</div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={save}>Save</Button>
          {status && <div className="text-xs text-muted-foreground">{status}</div>}
        </div>
      </div>
    </div>
  )
}
