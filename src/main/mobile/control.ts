/**
 * Session control handoff between the desktop dock and a phone.
 *
 * A Claude Code session has a single writer: the `claude` CLI in a desktop dock
 * pty, OR a phone driving it through the Agent SDK. Two at once corrupt the
 * transcript. Instead of forbidding the phone, we let control move: when a phone
 * sends to a session that's open on the desktop, it TAKES OVER — the desktop tab
 * is paused (its pty killed) and shown as "controlled from <device>". The desktop
 * reclaims it (user clicks "Reprendre", or the phone disconnects) by reloading the
 * tab with `claude --resume`, which picks up everything the phone added.
 *
 * The main process is the authority: it tracks who controls what, notifies the
 * renderer (pause / reload the tab) and the controlling phone (read-only). Kept
 * as a tiny standalone module to avoid an interaction<->bridge<->ipc cycle.
 */

export interface Controller {
  /** the bridge connection id that currently drives the session */
  connId: number
  /** human label for the phone (e.g. "mobile 192.168.1.42"), shown on the tab */
  device: string
  /** abort the phone's in-flight Agent SDK query */
  abort: () => void
  /** tell the phone it lost control (desktop reclaimed) */
  notifyPhone: () => void
}

export interface ControlEvent {
  sessionId: string
  controlledBy: 'mobile' | 'desktop'
  /** phone label, set when controlledBy === 'mobile' */
  device?: string
}

// sessionId -> who drives it. Absence = the desktop owns it (normal).
const bySession = new Map<string, Controller>()

let notifyRenderer: ((e: ControlEvent) => void) | null = null

/** Wired once from index.ts to push control changes to the renderer. */
export function setControlNotifier(fn: (e: ControlEvent) => void): void {
  notifyRenderer = fn
}

export function controllerConnId(sessionId: string): number | undefined {
  return bySession.get(sessionId)?.connId
}

/** A phone takes over a session that's open on the desktop → pause the dock tab. */
export function mobileTakeControl(sessionId: string, c: Controller): void {
  bySession.set(sessionId, c)
  notifyRenderer?.({ sessionId, controlledBy: 'mobile', device: c.device })
}

/**
 * The desktop reclaims the session: drop the lock, stop the phone's query, tell
 * it (unless it already left), and ask the renderer to reload the tab. Called
 * from the "Reprendre" IPC and when the controlling phone disconnects.
 */
export function desktopReclaim(sessionId: string, opts: { notifyPhone: boolean }): void {
  const c = bySession.get(sessionId)
  if (!c) return
  bySession.delete(sessionId)
  try {
    c.abort()
  } catch {
    /* already finished */
  }
  if (opts.notifyPhone) {
    try {
      c.notifyPhone()
    } catch {
      /* conn gone */
    }
  }
  notifyRenderer?.({ sessionId, controlledBy: 'desktop' })
}

/** The controlling phone disconnected → auto-reclaim every session it held. */
export function releaseByConn(connId: number): void {
  const held: string[] = []
  for (const [sid, c] of bySession) if (c.connId === connId) held.push(sid)
  for (const sid of held) desktopReclaim(sid, { notifyPhone: false })
}
