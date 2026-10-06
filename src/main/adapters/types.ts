/**
 * Adapter contract. Cogpit ships with a single adapter (Claude Code), but every
 * CLI-specific assumption lives behind this interface so another agent CLI can be
 * added later without touching the UI, the IPC layer or the session store.
 */

export type TitleSource = 'aiTitle' | 'summary' | 'firstMessage' | 'none'

/** Raw session metadata as parsed from disk (no user customisations merged in). */
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

export interface ResumeSpec {
  /** Executable to launch (resolved against PATH). */
  command: string
  /** Arguments passed to the executable. */
  args: string[]
  /** Working directory the process should start in. */
  cwd: string
  /** A copy/paste-friendly one-liner shown in the UI as a fallback. */
  display: string
}

/** Result of parsing a file: display metadata + a capped, lowercased blob of the
 *  conversation text used to power full-text search (kept out of ParsedSession so
 *  it never crosses to the renderer). */
export interface ParsedResult {
  session: ParsedSession
  searchText: string
}

export interface SessionAdapter {
  /** Stable identifier, e.g. "claude-code". */
  id: string
  /** Human label, e.g. "Claude Code". */
  label: string
  /** Absolute path to the directory that holds this CLI's session files. */
  rootDir(): string
  /** True when the given file name is a session this adapter understands. */
  isSessionFile(fileName: string): boolean
  /** Parse one session file into metadata + a search blob. */
  parse(filePath: string, projectDir: string): Promise<ParsedResult>
  /** How to resume an existing session in a terminal. */
  resumeSpec(session: ParsedSession): ResumeSpec
  /** How to start a brand new session for a project directory. */
  newSessionSpec(cwd: string): ResumeSpec
}
