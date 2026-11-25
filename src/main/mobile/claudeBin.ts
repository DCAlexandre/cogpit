/** Locate the `claude` CLI (so the Agent SDK works even if it's not on the
 *  Electron process PATH), report its version, and offer install/update. */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const pexec = promisify(execFile)
const isWin = process.platform === 'win32'

export interface ClaudeInfo {
  found: boolean
  path: string | null
  version: string | null
}

function candidates(): string[] {
  const home = homedir()
  if (isWin) {
    const list = [join(home, '.claude', 'local', 'claude.exe'), join(home, '.local', 'bin', 'claude.exe')]
    if (process.env.LOCALAPPDATA) list.push(join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'))
    if (process.env.APPDATA) list.push(join(process.env.APPDATA, 'npm', 'claude.cmd'))
    return list
  }
  return [join(home, '.claude', 'local', 'claude'), join(home, '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude']
}

async function whichClaude(): Promise<string | null> {
  try {
    const { stdout } = await pexec(isWin ? 'where' : 'which', ['claude'], { timeout: 10000, windowsHide: true })
    const lines = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!isWin) return lines[0] || null
    // `where claude` lists the extensionless npm *shell* shim first, which the
    // Agent SDK cannot spawn on Windows (it mis-detects it as a native binary and
    // fails to launch). Prefer a real launchable executable: .exe, then .cmd/.bat.
    const byExt = (re: RegExp): string | undefined => lines.find((l) => re.test(l))
    return byExt(/\.exe$/i) || byExt(/\.(cmd|bat)$/i) || lines[0] || null
  } catch {
    return null
  }
}

async function tryVersion(path: string): Promise<string | null> {
  try {
    const { stdout } = await pexec(path, ['--version'], { timeout: 10000, shell: true, windowsHide: true })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function resolveClaude(): Promise<ClaudeInfo> {
  let path = await whichClaude()
  if (!path) path = candidates().find((p) => p && existsSync(p)) ?? null
  if (!path) return { found: false, path: null, version: null }
  return { found: true, path, version: await tryVersion(path) }
}

export async function installClaude(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await pexec('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      timeout: 600000,
      shell: true,
      windowsHide: true
    })
    return { ok: true, output: (stdout + stderr).slice(-4000) }
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, output: String(err?.stderr ?? err?.message ?? e).slice(-4000) }
  }
}

export async function updateClaude(): Promise<{ ok: boolean; output: string }> {
  const info = await resolveClaude()
  if (!info.path) return { ok: false, output: 'claude introuvable' }
  try {
    const { stdout, stderr } = await pexec(info.path, ['update'], { timeout: 600000, shell: true, windowsHide: true })
    return { ok: true, output: (stdout + stderr).slice(-4000) }
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, output: String(err?.stderr ?? err?.message ?? e).slice(-4000) }
  }
}
