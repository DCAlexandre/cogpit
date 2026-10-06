/**
 * Integrated terminal backed by @homebridge/node-pty-prebuilt-multiarch — a
 * drop-in node-pty fork that ships N-API prebuilt binaries, so it loads in
 * Electron with no C++ toolchain and no rebuild step on any supported platform.
 * If the prebuilt still can't load (unsupported arch), every call here degrades
 * gracefully and the UI falls back to launching an external terminal instead.
 */
import { logger } from './logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ptyModule: any = null
let triedLoad = false
let loadError: string | null = null

function loadPty(): unknown {
  if (triedLoad) return ptyModule
  triedLoad = true
  try {
    // Resolved at runtime (externalized from the bundle); may be absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    ptyModule = require('@homebridge/node-pty-prebuilt-multiarch')
  } catch (err) {
    ptyModule = null
    loadError = err instanceof Error ? err.message : String(err)
    logger.warn('pty', 'backend failed to load → external terminal fallback', loadError)
  }
  return ptyModule
}

export function ptyStatus(): { available: boolean; error: string | null } {
  return { available: !!loadPty(), error: loadError }
}

export interface CreatePtyOptions {
  cwd: string
  initialCommand?: string
  cols?: number
  rows?: number
  onData: (id: string, data: string) => void
  onExit: (id: string, code: number) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const terms = new Map<string, any>()
let counter = 0

function defaultShell(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return { shell: process.env.COMSPEC || 'powershell.exe', args: [] }
  }
  return { shell: process.env.SHELL || '/bin/bash', args: [] }
}

export function createPty(opts: CreatePtyOptions): { id: string } | null {
  const pty = loadPty() as { spawn: (...a: unknown[]) => unknown } | null
  if (!pty) return null
  const { shell, args } = defaultShell()
  const id = `pty-${++counter}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc: any = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cwd: opts.cwd,
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    env: process.env as Record<string, string>
  })
  terms.set(id, proc)
  proc.onData((d: string) => opts.onData(id, d))
  proc.onExit((e: { exitCode: number }) => {
    terms.delete(id)
    opts.onExit(id, e.exitCode)
  })
  if (opts.initialCommand) {
    const nl = process.platform === 'win32' ? '\r' : '\n'
    proc.write(opts.initialCommand + nl)
  }
  logger.debug('pty', 'spawned', { id, shell, pid: proc.pid, cwd: opts.cwd, cols: opts.cols, rows: opts.rows })
  return { id }
}

export function writePty(id: string, data: string): void {
  terms.get(id)?.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  try {
    terms.get(id)?.resize(cols, rows)
  } catch {
    /* terminal gone */
  }
}

export function killPty(id: string): void {
  const p = terms.get(id)
  if (p) {
    logger.debug('pty', 'kill', { id, pid: p.pid })
    try {
      p.kill()
    } catch {
      /* already dead */
    }
    terms.delete(id)
  }
}

export function killAllPty(): void {
  for (const p of terms.values()) {
    try {
      p.kill()
    } catch {
      /* ignore */
    }
  }
  terms.clear()
}
