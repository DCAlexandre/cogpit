import { spawn, spawnSync } from 'child_process'
import { logger } from './logger'

/**
 * Optional IDE bridge. Running `claude` inside an IDE's integrated terminal is
 * what unlocks Claude Code's editor features (in-editor diff review, file/selection
 * context). Cogpit can't inject into another app's terminal, but it can open the
 * project in the IDE so the user resumes there. We just launch the editor at cwd.
 */
let cached: { cursor: boolean; code: boolean } | null = null

function onPath(cmd: string): boolean {
  try {
    const probe = process.platform === 'win32' ? spawnSync('where', [cmd]) : spawnSync('which', [cmd])
    return probe.status === 0
  } catch {
    return false
  }
}

export function detectIde(): { cursor: boolean; code: boolean } {
  if (!cached) cached = { cursor: onPath('cursor'), code: onPath('code') }
  return cached
}

export function openInIde(cwd: string): boolean {
  const ide = detectIde()
  const cmd = ide.cursor ? 'cursor' : ide.code ? 'code' : null
  if (!cmd) return false
  try {
    const child = spawn(cmd, [cwd], { detached: true, stdio: 'ignore', shell: true })
    child.unref()
    logger.info('ide', 'open', { cmd, cwd })
    return true
  } catch (err) {
    logger.error('ide', 'open failed', String(err))
    return false
  }
}
