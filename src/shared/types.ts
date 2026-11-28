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
export type LanguageSetting = 'auto' | 'fr' | 'en'

export interface Settings {
  theme: ThemeMode
  palette: Palette
  displayFont: DisplayFont
  fontScale: FontScale
  language: LanguageSetting
  showAgents: boolean
  showHidden: boolean
  terminalMode: TerminalMode
  groupByProject: boolean
  confirmPermanentDelete: boolean
  /** Mobile companion bridge: serve the phone app + encrypted WS on the LAN. */
  mobileAccess: boolean
  mobilePort: number
}

/** Status of the mobile companion bridge, surfaced in Settings. */
export interface MobileStatus {
  running: boolean
  port: number | null
  /** Pairing URLs (one per LAN address); the first backs the QR code. */
  urls: string[]
  /** data: URL of the pairing QR (points at urls[0]), or null. */
  qrDataUrl: string | null
  clients: number
  interactive: boolean
}

/** A session control handoff between the desktop dock and a phone. */
export interface MobileControlEvent {
  sessionId: string
  /** 'mobile' = a phone took the session over (pause the tab); 'desktop' = reclaimed (reload it). */
  controlledBy: 'mobile' | 'desktop'
  /** phone label (e.g. "mobile 192.168.1.42"), set when controlledBy === 'mobile'. */
  device?: string
}

/** The `claude` CLI as resolved on this machine (for interactive mobile use). */
export interface ClaudeInfo {
  found: boolean
  path: string | null
  version: string | null
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

/** A dock terminal persisted across restarts/reloads — enough to re-create it. */
export interface PersistedTerminal {
  key: string
  kind: 'resume' | 'new'
  sessionId?: string
  cwd?: string
  title: string
}

export interface TerminalState {
  list: PersistedTerminal[]
  activeKey: string | null
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
  terminals: {
    get(): Promise<TerminalState>
    save(state: TerminalState): Promise<void>
  }
  terminalSpec(target: TerminalTarget): Promise<ResumeSpec>
  openExternal(target: TerminalTarget): Promise<LaunchResult>
  pty: {
    status(): Promise<PtyStatus>
    create(target: TerminalTarget, size?: { cols: number; rows: number }): Promise<{ id: string } | null>
    write(id: string, data: string): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    kill(id: string): Promise<void>
    killAll(): Promise<void>
    onData(cb: (e: PtyDataEvent) => void): () => void
    onExit(cb: (e: PtyExitEvent) => void): () => void
  }
  openPath(path: string): Promise<string>
  showItem(path: string): Promise<void>
  openUrl(url: string): Promise<void>
  /** Resolve a path candidate against cwd; returns the absolute path if it exists. */
  resolvePath(cwd: string | null, candidate: string): Promise<string | null>
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
  /** Mobile companion bridge control (LAN-only, E2E encrypted). */
  mobile: {
    status(): Promise<MobileStatus>
    enable(port?: number): Promise<MobileStatus>
    disable(): Promise<MobileStatus>
    rotate(): Promise<MobileStatus>
    claudeInfo(): Promise<ClaudeInfo>
    claudeInstall(): Promise<{ ok: boolean; output: string }>
    claudeUpdate(): Promise<{ ok: boolean; output: string }>
    /** Push the ids of sessions open in the dock, so the bridge can coordinate takeover. */
    setLiveSessions(ids: string[]): void
    /** Reclaim a session a phone took over; the renderer reloads its dock tab. */
    reclaim(sessionId: string): void
    /** Control handoffs from the bridge: a phone took a session over, or the desktop reclaimed it. */
    onControl(cb: (e: MobileControlEvent) => void): () => void
  }
  /** Fire-and-forget debug log forwarded to the main-process log file (dev). */
  log(level: 'debug' | 'info' | 'warn' | 'error', scope: string, msg: string, data?: unknown): void
}
