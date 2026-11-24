/** MIRROR of src/shared/mobile/messages.ts — keep in sync. */
import type { ProjectSummary, SessionSummary, Stats, TranscriptMessage } from './types'

export interface ScanPayload {
  sessions: SessionSummary[]
  projects: ProjectSummary[]
  stats: Stats
  generatedAt: string
}

export type ClientMsg =
  | { t: 'scan' }
  | { t: 'transcript'; file: string }
  | { t: 'subscribe'; file: string }
  | { t: 'unsubscribe' }
  | { t: 'send'; file: string; sessionId: string; cwd: string | null; text: string }
  | { t: 'permission'; id: string; allow: boolean }
  | { t: 'interrupt' }

export interface AgentEvent {
  kind: 'assistant' | 'tool' | 'result' | 'status' | 'error'
  text?: string
  tool?: string
  final?: boolean
}

export type ServerMsg =
  | { t: 'hello'; host: string; adapter: string; interactive: boolean }
  | { t: 'scan'; data: ScanPayload }
  | { t: 'transcript'; file: string; messages: TranscriptMessage[] }
  | { t: 'append'; file: string; message: TranscriptMessage }
  | { t: 'sessions-changed' }
  | { t: 'error'; message: string }
  | { t: 'event'; event: AgentEvent }
  | { t: 'permission'; id: string; tool: string; input: unknown }
  | { t: 'busy'; busy: boolean }
