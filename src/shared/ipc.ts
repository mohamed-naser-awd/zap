export type IpcOk<T> = { ok: true; value: T }
export type IpcErr = { ok: false; error: string }
export type IpcResult<T> = IpcOk<T> | IpcErr

export const ok = <T>(value: T): IpcOk<T> => ({ ok: true, value })
export const err = (error: string): IpcErr => ({ ok: false, error })

export const IpcChannels = {
  // connections
  connectionsList: 'connections:list',
  connectionsGet: 'connections:get',
  connectionsCreate: 'connections:create',
  connectionsUpdate: 'connections:update',
  connectionsDelete: 'connections:delete',

  // projects
  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsDelete: 'projects:delete',

  // secrets
  secretsSet: 'secrets:set',
  secretsGet: 'secrets:get',
  secretsDelete: 'secrets:delete',

  // settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // misc app info
  appIsPackaged: 'app:isPackaged',

  // commands
  commandsList: 'commands:list',
  commandsGet: 'commands:get',
  commandsCreate: 'commands:create',
  commandsUpdate: 'commands:update',
  commandsDelete: 'commands:delete',

  // terminal
  terminalSpawn: 'terminal:spawn',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalListNamed: 'terminal:listNamed',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',

  // tunnels
  tunnelsStart: 'tunnels:start',
  tunnelsStop: 'tunnels:stop',
  tunnelsList: 'tunnels:list',

  // tunnel history (LRU recents)
  tunnelHistoryList: 'history:tunnels:list',
  tunnelHistoryUpsert: 'history:tunnels:upsert',
  tunnelHistoryDelete: 'history:tunnels:delete',
  tunnelHistorySetPinned: 'history:tunnels:setPinned',
  tunnelsStatus: 'tunnels:status',

  // rsync
  rsyncStart: 'rsync:start',
  rsyncCancel: 'rsync:cancel',
  rsyncList: 'rsync:list',
  rsyncProgress: 'rsync:progress',
  rsyncDone: 'rsync:done',

  // sftp
  sftpList: 'sftp:list',
  sftpMkdir: 'sftp:mkdir',
  sftpDelete: 'sftp:delete',
  sftpRename: 'sftp:rename',

  // dialogs (OS open file/dir)
  dialogOpen: 'dialog:open',

  // logs
  logsGetPath: 'logs:getPath',
  logsReveal: 'logs:reveal',
  logsOpen: 'logs:open',

  // drag-out (initiates an OS-level drag from a renderer dragstart)
  dragoutFromLocal: 'dragout:fromLocal',
  dragoutFromRemote: 'dragout:fromRemote',

  // local fs
  fsList: 'fs:list',
  fsMkdir: 'fs:mkdir',
  fsDelete: 'fs:delete',
  fsRename: 'fs:rename',
  fsHome: 'fs:home',

  // workflows
  workflowsList: 'workflows:list',
  workflowsGet: 'workflows:get',
  workflowsCreate: 'workflows:create',
  workflowsUpdate: 'workflows:update',
  workflowsDelete: 'workflows:delete',
  workflowsRun: 'workflows:run',
  workflowsCancelRun: 'workflows:cancelRun',
  workflowsGetRun: 'workflows:getRun',
  workflowsListRuns: 'workflows:listRuns',
  workflowsRunStatus: 'workflows:run-status',
  workflowsStepStatus: 'workflows:step-status',
  workflowsStepOutput: 'workflows:step-output'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
