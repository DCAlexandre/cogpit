import { spawn } from 'child_process'
import type { ResumeSpec } from '../adapters/types'

export interface LaunchResult {
  ok: boolean
  via: string
}

function innerCommand(spec: ResumeSpec): string {
  return [spec.command, ...spec.args].join(' ').trim()
}

/** Spawn a detached child and resolve once it either starts or errors. */
function trySpawn(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean) => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false })
      child.on('error', () => done(false))
      child.on('spawn', () => {
        child.unref()
        done(true)
      })
      // Safety net if neither event fires promptly.
      setTimeout(() => done(true), 600)
    } catch {
      done(false)
    }
  })
}

async function openWindows(cwd: string, inner: string): Promise<LaunchResult> {
  // 1) Windows Terminal, if installed — nicest experience, honours -d for cwd.
  if (await trySpawn('wt.exe', ['-d', cwd, 'powershell', '-NoExit', '-NoLogo', '-Command', inner])) {
    return { ok: true, via: 'windows-terminal' }
  }
  // 2) Fallback: a fresh PowerShell window via `cmd /c start`. The empty-string
  //    arg becomes `""` (the window title), which keeps `start` from mistaking
  //    the next token for the program to run.
  const psCmd = `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${inner}`
  if (await trySpawn('cmd.exe', ['/c', 'start', '', 'powershell', '-NoExit', '-NoLogo', '-Command', psCmd])) {
    return { ok: true, via: 'powershell' }
  }
  return { ok: false, via: 'none' }
}

async function openMac(cwd: string, inner: string): Promise<LaunchResult> {
  const script = `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\"')} && ${inner.replace(/"/g, '\\"')}"`
  if (await trySpawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'])) {
    return { ok: true, via: 'terminal.app' }
  }
  return { ok: false, via: 'none' }
}

async function openLinux(cwd: string, inner: string): Promise<LaunchResult> {
  const hold = `${inner}; exec $SHELL`
  const candidates: [string, string[]][] = [
    ['x-terminal-emulator', ['-e', `bash -lc '${hold}'`]],
    ['gnome-terminal', [`--working-directory=${cwd}`, '--', 'bash', '-lc', hold]],
    ['konsole', ['--workdir', cwd, '-e', 'bash', '-lc', hold]],
    ['xterm', ['-e', `bash -lc 'cd "${cwd}"; ${hold}'`]]
  ]
  for (const [cmd, args] of candidates) {
    if (await trySpawn(cmd, args)) return { ok: true, via: cmd }
  }
  return { ok: false, via: 'none' }
}

/** Open the user's native terminal running the given resume command. */
export function openExternalTerminal(spec: ResumeSpec): Promise<LaunchResult> {
  const inner = innerCommand(spec)
  if (process.platform === 'win32') return openWindows(spec.cwd, inner)
  if (process.platform === 'darwin') return openMac(spec.cwd, inner)
  return openLinux(spec.cwd, inner)
}
