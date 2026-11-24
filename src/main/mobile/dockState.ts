/** Which sessions are currently open in the desktop terminal dock (pushed by the
 *  renderer). The mobile bridge refuses to drive these, to keep a single writer
 *  per session. A tiny standalone module to avoid a bridge↔interaction cycle. */
let liveDock = new Set<string>()

export function setLiveDockSessions(ids: string[]): void {
  liveDock = new Set(ids)
}

export function isDockLive(id: string): boolean {
  return liveDock.has(id)
}
