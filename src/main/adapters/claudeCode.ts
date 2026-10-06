import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { createInterface } from 'readline'
import { basename } from 'path'
import { claudeProjectsDir, projectNameFromCwd } from '../lib/claudePaths'
import type { ParsedResult, ParsedSession, ResumeSpec, SessionAdapter, TitleSource } from './types'

const MAX_PROMPT_LEN = 200
/** Upper bound on the per-session search blob (chars). Keeps the index small. */
const MAX_SEARCH_LEN = 16000

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const block of content) {
      if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>
        if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
      }
    }
    if (texts.length) return texts.join('\n')
  }
  return null
}

/**
 * Stream a session file and distil just the metadata we display. We read the
 * whole file (titles/summaries can appear late and we need the last timestamp +
 * a message count), but line-by-line so memory stays flat on multi-MB sessions.
 */
async function parse(filePath: string, projectDir: string): Promise<ParsedResult> {
  const st = await stat(filePath)
  const id = basename(filePath).replace(/\.jsonl$/i, '')
  const isAgent = /^agent-/i.test(basename(filePath))

  let aiTitle: string | null = null
  let summary: string | null = null
  let firstPrompt: string | null = null
  let cwd: string | null = null
  let gitBranch: string | null = null
  let version: string | null = null
  let createdAt: string | null = null
  let updatedAt: string | null = null
  let messageCount = 0
  const searchParts: string[] = []
  let searchLen = 0

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  try {
    for await (const line of rl) {
      if (!line) continue
      let d: Record<string, unknown>
      try {
        d = JSON.parse(line)
      } catch {
        continue
      }

      const type = d.type as string | undefined

      if (typeof d.aiTitle === 'string' && d.aiTitle.trim()) aiTitle = d.aiTitle.trim()
      if (type === 'summary' && typeof d.summary === 'string' && d.summary.trim()) {
        summary = d.summary.trim()
      }
      // Keep the FIRST cwd: it's the launch dir Claude used to name the project
      // folder, so `claude --resume <id>` run from it finds the session. The cwd
      // can change mid-session (cd into a subdir); using the last one would make
      // resume look in the wrong project folder → "No conversation found".
      if (!cwd && typeof d.cwd === 'string' && d.cwd) cwd = d.cwd
      if (typeof d.gitBranch === 'string' && d.gitBranch) gitBranch = d.gitBranch
      if (typeof d.version === 'string' && d.version) version = d.version

      const ts = typeof d.timestamp === 'string' ? d.timestamp : null
      if (ts) {
        if (!createdAt) createdAt = ts
        updatedAt = ts
      }

      if (type === 'user' || type === 'assistant') {
        messageCount++
        const msg = d.message as Record<string, unknown> | undefined
        const text = msg ? extractText(msg.content) : null
        if (type === 'user' && !firstPrompt && text && !text.startsWith('<')) {
          firstPrompt = text.slice(0, MAX_PROMPT_LEN)
        }
        if (text && searchLen < MAX_SEARCH_LEN) {
          const chunk = text.slice(0, MAX_SEARCH_LEN - searchLen)
          searchParts.push(chunk)
          searchLen += chunk.length
        }
      }
    }
  } finally {
    rl.close()
  }

  let title = ''
  let titleSource: TitleSource = 'none'
  if (aiTitle) {
    title = aiTitle
    titleSource = 'aiTitle'
  } else if (summary) {
    title = summary
    titleSource = 'summary'
  } else if (firstPrompt) {
    title = firstPrompt
    titleSource = 'firstMessage'
  } else {
    title = isAgent ? 'Sous-agent' : 'Session sans titre'
    titleSource = 'none'
  }

  const session: ParsedSession = {
    id,
    filePath,
    projectDir,
    cwd,
    projectName: projectNameFromCwd(cwd, projectDir),
    title,
    titleSource,
    gitBranch,
    version,
    messageCount,
    createdAt,
    updatedAt: updatedAt ?? new Date(st.mtimeMs).toISOString(),
    sizeBytes: st.size,
    isAgent,
    firstPrompt
  }
  return { session, searchText: searchParts.join(' ').toLowerCase() }
}

function resumeSpec(session: ParsedSession): ResumeSpec {
  const cwd = session.cwd || process.cwd()
  return {
    command: 'claude',
    args: ['--resume', session.id],
    cwd,
    display: `claude --resume ${session.id}`
  }
}

function newSessionSpec(cwd: string): ResumeSpec {
  return {
    command: 'claude',
    args: [],
    cwd,
    display: 'claude'
  }
}

export const claudeCodeAdapter: SessionAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  rootDir: claudeProjectsDir,
  isSessionFile: (fileName) => /\.jsonl$/i.test(fileName),
  parse,
  resumeSpec,
  newSessionSpec
}
