import { homedir } from 'os'
import { join, basename } from 'path'

/** Root of Claude Code's per-project session store: ~/.claude/projects */
export function claudeProjectsDir(): string {
  // CLAUDE_CONFIG_DIR lets power users relocate ~/.claude; honour it when set.
  const base = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude')
  return join(base, 'projects')
}

/**
 * Folder names under projects/ are a lossy encoding of the cwd (every
 * non-alphanumeric char becomes "-"), so they cannot be decoded back reliably.
 * We only use this as a *fallback* label — the real cwd is read from inside the
 * session file. This best-effort guess just strips the leading drive token.
 */
export function guessProjectLabel(projectDir: string): string {
  const parts = projectDir.split('-').filter(Boolean)
  const tail = parts.slice(-2).join('-')
  return tail || projectDir
}

/** Prefer the real cwd's basename; fall back to the encoded dir guess. */
export function projectNameFromCwd(cwd: string | null, projectDir: string): string {
  if (cwd) return basename(cwd) || cwd
  return guessProjectLabel(projectDir)
}
