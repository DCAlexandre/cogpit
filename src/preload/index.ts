import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  CogpitApi,
  PtyDataEvent,
  PtyExitEvent,
  SessionCustom,
  Settings,
  TerminalTarget,
  TrashPayload
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CogpitApi = {
  info: () => ipcRenderer.invoke('app:info'),
  scan: () => ipcRenderer.invoke('sessions:scan'),
  transcript: (filePath) => ipcRenderer.invoke('sessions:transcript', filePath),
  contentSearch: (query) => ipcRenderer.invoke('content:search', query),
  trashSession: (payload: TrashPayload) => ipcRenderer.invoke('session:trash', payload),
  deletePermanent: (filePath) => ipcRenderer.invoke('session:deletePermanent', filePath),
  trash: {
    list: () => ipcRenderer.invoke('trash:list'),
    restore: (trashId) => ipcRenderer.invoke('trash:restore', trashId),
    delete: (trashId) => ipcRenderer.invoke('trash:delete', trashId),
    empty: () => ipcRenderer.invoke('trash:empty')
  },
  setCustom: (id, patch: SessionCustom) => ipcRenderer.invoke('meta:setCustom', id, patch),
  setProjectHidden: (projectDir, hidden) => ipcRenderer.invoke('meta:setProjectHidden', projectDir, hidden),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:set', patch),
  terminalSpec: (target: TerminalTarget) => ipcRenderer.invoke('terminal:spec', target),
  openExternal: (target: TerminalTarget) => ipcRenderer.invoke('terminal:external', target),
  pty: {
    status: () => ipcRenderer.invoke('pty:status'),
    create: (target, size) => ipcRenderer.invoke('pty:create', target, size),
    write: (id, data) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('pty:kill', id),
    onData: (cb: (e: PtyDataEvent) => void) => subscribe('pty:data', cb),
    onExit: (cb: (e: PtyExitEvent) => void) => subscribe('pty:exit', cb)
  },
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  showItem: (path) => ipcRenderer.invoke('shell:showItem', path),
  openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url),
  resolvePath: (cwd, candidate) => ipcRenderer.invoke('fs:resolvePath', cwd, candidate),
  openInIde: (cwd) => ipcRenderer.invoke('ide:open', cwd),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read'),
    write: (text: string) => ipcRenderer.invoke('clipboard:write', text)
  },
  win: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb: (maximized: boolean) => void) => subscribe('window:maximized', cb)
  },
  onSessionsChanged: (cb: () => void) => subscribe('sessions:changed', cb),
  log: (level, scope, msg, data) => ipcRenderer.send('log:renderer', level, scope, msg, data)
}

contextBridge.exposeInMainWorld('api', api)
