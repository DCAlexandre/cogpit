import { ipcMain, shell, app, dialog, clipboard, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { access } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import { claudeCodeAdapter } from './adapters/claudeCode'
import type { ParsedSession, SessionAdapter } from './adapters/types'
import { scanAll, readTranscript, contentSearch } from './lib/sessions'
import {
  trashSession,
  deleteSessionPermanently,
  listTrash,
  restoreTrash,
  deleteFromTrash,
  emptyTrash
} from './lib/trash'
import { setCustom, setProjectHidden, getSettings, setSettings, type SessionCustom, type Settings } from './lib/meta'
import { openExternalTerminal } from './lib/terminal'
import { createPty, writePty, resizePty, killPty, ptyStatus } from './lib/pty'
import { detectIde, openInIde } from './lib/ide'
import { logger } from './lib/logger'

/** Single adapter today; swap/extend here when another CLI is supported. */
function adapter(): SessionAdapter {
  return claudeCodeAdapter
}

interface TrashPayload {
  filePath: string
  projectDir: string
  title: string
  cwd: string | null
  sizeBytes: number
}

type TerminalKind = 'resume' | 'new'
interface TerminalTarget {
  kind: TerminalKind
  session?: ParsedSession
  cwd?: string
}

function specFor(target: TerminalTarget): ReturnType<SessionAdapter['resumeSpec']> {
  const a = adapter()
  if (target.kind === 'new') return a.newSessionSpec(target.cwd || process.cwd())
  if (!target.session) throw new Error('resume: session manquante')
  return a.resumeSpec(target.session)
}

// Channels whose payload is too chatty/sensitive to log on every call.
const NOISY = new Set(['pty:write', 'pty:resize'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarize(channel: string, args: any[], r: any): unknown {
  switch (channel) {
    case 'sessions:scan':
      return { sessions: r?.sessions?.length, projects: r?.projects?.length, bytes: r?.stats?.totalBytes }
    case 'content:search':
      return { q: args[0], hits: Array.isArray(r) ? r.length : 0 }
    case 'sessions:transcript':
      return { msgs: Array.isArray(r) ? r.length : 0 }
    case 'session:trash':
      return { file: args[0]?.filePath }
    case 'session:deletePermanent':
      return { file: args[0] }
    case 'pty:create':
      return { kind: args[0]?.kind, id: r?.id ?? null }
    case 'pty:kill':
      return { id: args[0] }
    case 'terminal:external':
      return { kind: args[0]?.kind, ok: r?.ok, via: r?.via }
    case 'meta:setCustom':
      return { id: args[0], patch: args[1] }
    case 'settings:set':
      return args[0]
    default:
      return undefined
  }
}

/** ipcMain.handle with automatic debug logging (timing, summary, errors). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handle(channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (e, ...args) => {
    const t = Date.now()
    try {
      const r = await fn(e, ...args)
      if (!NOISY.has(channel)) logger.debug('ipc', `${channel} (${Date.now() - t}ms)`, summarize(channel, args, r))
      return r
    } catch (err) {
      logger.error('ipc', `${channel} FAILED`, err instanceof Error ? (err.stack ?? err.message) : String(err))
      throw err
    }
  })
}

export function registerIpc(): void {
  handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
    adapter: adapter().id,
    adapterLabel: adapter().label,
    claudeRoot: adapter().rootDir(),
    pty: ptyStatus(),
    ide: detectIde()
  }))

  handle('sessions:scan', () => scanAll(adapter()))
  handle('sessions:transcript', (_e, filePath: string) => readTranscript(filePath))
  handle('content:search', (_e, query: string) => contentSearch(query))

  handle('session:trash', (_e, p: TrashPayload) =>
    trashSession(p.filePath, { projectDir: p.projectDir, title: p.title, cwd: p.cwd, sizeBytes: p.sizeBytes })
  )
  handle('session:deletePermanent', (_e, filePath: string) => deleteSessionPermanently(filePath))

  handle('trash:list', () => listTrash())
  handle('trash:restore', (_e, trashId: string) => restoreTrash(trashId))
  handle('trash:delete', (_e, trashId: string) => deleteFromTrash(trashId))
  handle('trash:empty', () => emptyTrash())

  handle('meta:setCustom', (_e, id: string, patch: SessionCustom) => setCustom(id, patch))
  handle('meta:setProjectHidden', (_e, projectDir: string, hidden: boolean) => setProjectHidden(projectDir, hidden))

  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, patch: Partial<Settings>) => setSettings(patch))

  handle('terminal:spec', (_e, target: TerminalTarget) => specFor(target))
  handle('terminal:external', (_e, target: TerminalTarget) => openExternalTerminal(specFor(target)))

  handle('pty:status', () => ptyStatus())
  handle('pty:create', (e: IpcMainInvokeEvent, target: TerminalTarget, size?: { cols: number; rows: number }) => {
    const spec = specFor(target)
    const sender = e.sender
    logger.info('pty', 'create', { kind: target.kind, cwd: spec.cwd, cmd: spec.display, size })
    const res = createPty({
      cwd: spec.cwd,
      initialCommand: spec.display,
      cols: size?.cols,
      rows: size?.rows,
      onData: (id, data) => {
        if (!sender.isDestroyed()) sender.send('pty:data', { id, data })
      },
      onExit: (id, code) => {
        logger.info('pty', 'exit', { id, code })
        if (!sender.isDestroyed()) sender.send('pty:exit', { id, code })
      }
    })
    return res
  })
  handle('pty:write', (_e, id: string, data: string) => writePty(id, data))
  handle('pty:resize', (_e, id: string, cols: number, rows: number) => resizePty(id, cols, rows))
  handle('pty:kill', (_e, id: string) => killPty(id))

  handle('shell:openPath', (_e, p: string) =>
    shell.openPath(p.startsWith('~') ? join(homedir(), p.slice(1)) : p)
  )
  handle('shell:showItem', (_e, path: string) => shell.showItemInFolder(path))
  // Only http(s) — never hand arbitrary schemes from terminal output to the OS.
  handle('shell:openUrl', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })
  // Resolve a terminal-detected path candidate (absolute, ~, or cwd-relative) and
  // return its absolute path IF it exists — so only real files/dirs become links.
  handle('fs:resolvePath', async (_e, cwd: string | null, candidate: string): Promise<string | null> => {
    try {
      let p = candidate.startsWith('~') ? join(homedir(), candidate.slice(1)) : candidate
      if (!isAbsolute(p)) {
        if (!cwd) return null
        p = join(cwd, p)
      }
      // NEVER probe UNC / network paths: a dead SMB share makes the fs call block for
      // ~21s and freeze the whole app (this fires on every terminal hover). Reject them.
      if (p.startsWith('\\\\') || p.startsWith('//')) return null
      // Async existence check with a hard timeout, so a slow/offline local path can
      // never stall the main process either.
      const exists = await Promise.race([
        access(p).then(
          () => true,
          () => false
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 400))
      ])
      return exists ? p : null
    } catch {
      return null
    }
  })
  handle('ide:open', (_e, cwd: string) => openInIde(cwd))

  handle('clipboard:read', () => clipboard.readText())
  handle('clipboard:write', (_e, text: string) => clipboard.writeText(text))

  handle('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  handle('window:maximizeToggle', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) (w.isMaximized() ? w.unmaximize() : w.maximize())
  })
  handle('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  handle('window:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

  handle('dialog:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose a folder for the new session'
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  // Fire-and-forget logging from the renderer.
  ipcMain.on('log:renderer', (_e, level: string, scope: string, msg: string, data?: unknown) => {
    const fn =
      level === 'error'
        ? logger.error
        : level === 'warn'
          ? logger.warn
          : level === 'info'
            ? logger.info
            : logger.debug
    fn(`renderer:${scope}`, msg, data)
  })
}
