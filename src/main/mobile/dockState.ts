/** Which sessions are currently open in the desktop terminal dock (pushed by the
 *  renderer). The mobile bridge uses this to coordinate takeover and to list the
 *  "running on the PC" sessions first on the phone. A tiny standalone module to
 *  avoid a bridge↔interaction cycle. */
let liveDock = new Set<string>()
let notify: ((ids: string[]) => void) | null = null

/** Wired from index.ts to broadcast dock changes to connected phones. */
export function setLiveDockNotifier(fn: (ids: string[]) => void): void {
  notify = fn
}

export function setLiveDockSessions(ids: string[]): void {
  liveDock = new Set(ids)
  notify?.([...liveDock])
}

export function isDockLive(id: string): boolean {
  return liveDock.has(id)
}

export function liveDockSessions(): string[] {
  return [...liveDock]
}
