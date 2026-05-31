import * as connections from './connections'
import * as projects from './projects'
import * as secrets from './secrets'
import * as settings from './settings'
import * as commands from './commands'
import * as terminal from './terminal'
import * as tunnels from './tunnels'
import * as rsync from './rsync'
import * as sftp from './sftp'
import * as fsLocal from './fs-local'
import * as dialog from './dialog'
import * as logs from './logs'
import * as dragout from './dragout'
import * as history from './history'
import * as workflows from './workflows'

export function registerIpc() {
  connections.register()
  projects.register()
  secrets.register()
  settings.register()
  commands.register()
  terminal.register()
  tunnels.register()
  rsync.register()
  sftp.register()
  fsLocal.register()
  dialog.register()
  logs.register()
  dragout.register()
  history.register()
  workflows.register()
}
