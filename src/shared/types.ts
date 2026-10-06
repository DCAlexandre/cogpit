/**
 * The renderer <-> main contract. These are the shapes that cross the IPC
 * boundary (serialised as JSON), consumed by the preload bridge and the React UI.
 * The main process produces structurally-matching objects.
 */

export type TitleSource = 'aiTitle' | 'summary' | 'firstMessage' | 'none'

export interface ParsedSession {
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
}

export interface SessionCustom {
  customTitle?: string | null
  pinned?: boolean
  favorite?: boolean
  hidden?: boolean
}

export interface SessionSummary extends ParsedSession, SessionCustom {
  displayTitle: string
  /** Stable project identity = real cwd (falls back to the encoded dir). Groups
   *  sessions of the same folder even when Claude filed them under two dirs. */
  projectKey: string
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

export interface ScanResult {
  sessions: SessionSummary[]
  projects: ProjectSummary[]
  stats: Stats
  generatedAt: string
  adapter: string
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string | null
  tools: string[]
}

export type ThemeMode = 'system' | 'dark' | 'light'
export type TerminalMode = 'integrated' | 'external'
export type Palette = 'amber' | 'pipboy' | 'rose'
export type DisplayFont = 'oxanium' | 'orbitron' | 'chakra' | 'pressstart' | 'vt323'
export type FontScale = 'sm' | 'md' | 'lg'

export interface Settings {
  theme: ThemeMode
  palette: Palette
  displayFont: DisplayFont
  fontScale: FontScale
  showAgents: boolean
  showHidden: boolean
  terminalMode: TerminalMode
  groupByProject: boolean
  confirmPermanentDelete: boolean
}

export interface TrashEntry {
  trashId: string
  originalPath: string
  fileName: string
  projectDir: string
  title: string
  cwd: string | null
  sizeBytes: number
  trashedAt: string
}

export interface ResumeSpec {
  command: string
  args: string[]
  cwd: string
  display: string
}

export interface LaunchResult {
  ok: boolean
  via: string
}

export interface PtyStatus {
  available: boolean
  error: string | null
}

export interface AppInfo {
  platform: string
  version: string
  adapter: string
  adapterLabel: string
  claudeRoot: string
  pty: PtyStatus
  ide: { cursor: boolean; code: boolean }
}

export interface TerminalTarget {
  kind: 'resume' | 'new'
  session?: SessionSummary
  cwd?: string
}

export interface TrashPayload {
  filePath: string
  projectDir: string
  title: string
  cwd: string | null
  sizeBytes: number
}

export interface PtyDataEvent {
  id: string
  data: string
}
export interface PtyExitEvent {
  id: string
  code: number
}

export interface CogpitApi {
  info(): Promise<AppInfo>
  scan(): Promise<ScanResult>
  transcript(filePath: string): Promise<TranscriptMessage[]>
  /** Full-text search in conversation content; returns matching session ids. */
  contentSearch(query: string): Promise<string[]>
  trashSession(payload: TrashPayload): Promise<TrashEntry>
  deletePermanent(filePath: string): Promise<void>
  trash: {
    list(): Promise<TrashEntry[]>
    restore(trashId: string): Promise<void>
    delete(trashId: string): Promise<void>
    empty(): Promise<void>
  }
  setCustom(id: string, patch: SessionCustom): Promise<SessionCustom>
  setProjectHidden(projectDir: string, hidden: boolean): Promise<void>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  terminalSpec(target: TerminalTarget): Promise<ResumeSpec>
  openExternal(target: TerminalTarget): Promise<LaunchResult>
  pty: {
    status(): Promise<PtyStatus>
    create(target: TerminalTarget, size?: { cols: number; rows: number }): Promise<{ id: string } | null>
    write(id: string, data: string): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    kill(id: string): Promise<void>
    onData(cb: (e: PtyDataEvent) => void): () => void
    onExit(cb: (e: PtyExitEvent) => void): () => void
  }
  openPath(path: string): Promise<string>
  showItem(path: string): Promise<void>
  openInIde(cwd: string): Promise<boolean>
  pickFolder(): Promise<string | null>
  clipboard: {
    read(): Promise<string>
    write(text: string): Promise<void>
  }
  win: {
    minimize(): Promise<void>
    maximizeToggle(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximized(cb: (maximized: boolean) => void): () => void
  }
  onSessionsChanged(cb: () => void): () => void
  /** Fire-and-forget debug log forwarded to the main-process log file (dev). */
  log(level: 'debug' | 'info' | 'warn' | 'error', scope: string, msg: string, data?: unknown): void
}
