/** Subset of src/shared/types.ts needed by the mobile app (keep in sync). */

export type TitleSource = 'aiTitle' | 'summary' | 'firstMessage' | 'none'

export interface SessionSummary {
  id: string
  filePath: string
  projectDir: string
  cwd: string | null
  projectName: string
  title: string
  titleSource: TitleSource
  gitBranch: string | null
  version: string | null
  messageCount: number
  createdAt: string | null
  updatedAt: string | null
  sizeBytes: number
  isAgent: boolean
  firstPrompt: string | null
  displayTitle: string
  projectKey: string
  pinned?: boolean
  favorite?: boolean
  hidden?: boolean
}

export interface ProjectSummary {
  key: string
  projectDir: string
  name: string
  cwd: string | null
  count: number
  agentCount: number
  lastActivity: string | null
  sizeBytes: number
  hidden: boolean
}

export interface Stats {
  totalSessions: number
  totalAgents: number
  totalBytes: number
  projectCount: number
  lastActivity: string | null
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string | null
  tools: string[]
}
