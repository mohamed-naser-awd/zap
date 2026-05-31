# Zap

Workflow-driven SSH/ops desktop app. Electron + React.

- Named multi-step workflows (local shell, scripts with custom interpreter, SSH exec, tunnel start/stop, rsync, send-to-terminal)
- Saved connections; secrets in OS keychain
- xterm.js terminal with a Claude-style `/` command palette
- Dual-pane local/remote browser driving rsync

## Develop

```
npm install
npm run dev
```

## Package

```
npm run dist:win    # builds both NSIS .exe and MSI under release/
```

The first MSI build will download WiX Toolset 3.x automatically via
electron-builder. If your machine blocks that download:

```
winget install WiXToolset.WiXToolset
```

Install the produced `release/Zap-<version>-x64.msi` like any normal Windows
installer; the app lands in `Program Files\Zap\` and gets a Start Menu entry.

## Requirements

- Windows: OpenSSH (built in on Win 10+). For rsync, install via WSL / cwRsync / Git Bash and point Settings → rsync binary at it.
- macOS / Linux: ssh and rsync available on PATH.

## Startup & system tray (Windows)

The window's **X button always hides zap to the system tray** (visible
behind the "show hidden icons" arrow). The process keeps running so active
tunnels, rsync transfers, and terminal sessions stay alive. Use the tray
icon's right-click → **Quit** to fully exit — that's the only path that
kills the running subprocesses.

Settings → **Startup & tray** has two opt-in autostart toggles (installed
build only — see below):

- **Launch zap when Windows starts** — registers a Run-key entry so the app
  comes up automatically on login.
- **Start minimized to system tray** — no window appears on launch; open
  from the tray icon.

Toggles apply immediately — no relaunch needed.

### Autostart works only in the installed build

`npm run dev` cannot self-register for Windows startup because Windows would
relaunch `node_modules/electron/dist/electron.exe` with no project context.
The toggles are disabled in dev with an inline note; running the installed
MSI (`Zap.exe`) enables them.

### Recovery if autostart was enabled from an earlier broken build

Delete the stale Run-key entry, then launch the installed app normally:

```
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v zap /f
```

(Use `Zap` instead of `zap` if that was the case in the registry.) Your data
is at `%APPDATA%\zap\zap.json` and is never touched by this process.
