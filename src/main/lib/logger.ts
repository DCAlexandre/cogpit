import { app } from 'electron'
import { createWriteStream, mkdirSync, type WriteStream } from 'fs'
import { join } from 'path'

/**
 * Lightweight file logger, active in development (or when COGPIT_DEBUG=1).
 * Writes to <projectRoot>/logs in dev and <userData>/logs when packaged.
 * Logging must NEVER throw into the app — every call is wrapped.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

let stream: WriteStream | null = null
let enabled = false
let dir = ''

export function logDir(): string {
  return dir
}

function safe(data: unknown): string {
  if (data === undefined) return ''
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data)
    return s.length > 2000 ? s.slice(0, 2000) + '…' : s
  } catch {
    return String(data)
  }
}

export function initLogger(): void {
  enabled = !app.isPackaged || process.env.COGPIT_DEBUG === '1'
  if (!enabled) return
  try {
    dir = app.isPackaged ? join(app.getPath('userData'), 'logs') : join(app.getAppPath(), 'logs')
    mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    stream = createWriteStream(join(dir, `cogpit-${day}.log`), { flags: 'a' })
    write('info', 'app', `--- session start (pid ${process.pid}, v${app.getVersion()}) ---`)
    write('info', 'logger', `writing to ${dir}`)
  } catch {
    enabled = false
  }
}

export function write(level: Level, scope: string, msg: string, data?: unknown): void {
  if (!enabled) return
  const line = `${new Date().toISOString()} [${level.toUpperCase().padEnd(5)}] [${scope}] ${msg}${
    data !== undefined ? ' ' + safe(data) : ''
  }`
  try {
    stream?.write(line + '\n')
  } catch {
    /* ignore */
  }
  if (!app.isPackaged) {
    // eslint-disable-next-line no-console
    console.log(line)
  }
}

export const logger = {
  debug: (scope: string, msg: string, data?: unknown) => write('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) => write('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => write('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => write('error', scope, msg, data),
  isEnabled: (): boolean => enabled
}
