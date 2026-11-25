/**
 * The mobile <-> PC application protocol, carried INSIDE the encrypted channel
 * (every ServerMsg/ClientMsg is JSON, sealed by SecureChannel before it hits the
 * wire). Shared contract — keep in sync with apps/mobile/src/protocol/messages.ts
 */
import type { ProjectSummary, SessionSummary, Stats, TranscriptMessage } from '../types'

export interface ScanPayload {
  sessions: SessionSummary[]
  projects: ProjectSummary[]
  stats: Stats
  generatedAt: string
}

/** Phone -> PC. */
export type ClientMsg =
  | { t: 'scan' }
  | { t: 'transcript'; file: string }
  | { t: 'subscribe'; file: string }
  | { t: 'unsubscribe' }
  // interaction (best-effort, Agent SDK)
  | { t: 'send'; file: string; sessionId: string; cwd: string | null; text: string }
  | { t: 'permission'; id: string; allow: boolean }
  | { t: 'interrupt' }

/** A streamed interaction event (Agent SDK), kept loose on purpose. */
export interface AgentEvent {
  kind: 'assistant' | 'tool' | 'result' | 'status' | 'error'
  text?: string
  tool?: string
  final?: boolean
}

/** PC -> phone. */
export type ServerMsg =
  | { t: 'hello'; host: string; adapter: string; interactive: boolean }
  | { t: 'scan'; data: ScanPayload }
  | { t: 'transcript'; file: string; messages: TranscriptMessage[] }
  | { t: 'append'; file: string; message: TranscriptMessage }
  | { t: 'sessions-changed' }
  | { t: 'error'; message: string }
  // interaction
  | { t: 'event'; event: AgentEvent }
  | { t: 'permission'; id: string; tool: string; input: unknown }
  | { t: 'busy'; busy: boolean }
  // control handoff: 'mobile' = this phone took the session over (desktop tab
  // paused); 'desktop' = the PC reclaimed it (phone goes read-only until it
  // sends again, which takes control back).
  | { t: 'control'; file: string; controlledBy: 'mobile' | 'desktop' }
