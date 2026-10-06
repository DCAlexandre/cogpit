import { readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { guessProjectLabel } from './claudePaths'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { ParsedSession, SessionAdapter } from '../adapters/types'
import { getCached, putCached, pruneCache, flushCache } from './cache'
import { getCustom, getHiddenProjects, loadMeta, type SessionCustom } from './meta'
import { logger } from './logger'

export interface SessionSummary extends ParsedSession, SessionCustom {
  displayTitle: string
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

/** Run async mapper over items with a bounded concurrency pool. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

/** In-memory full-text index (sessionId -> lowercased conversation blob),
 *  rebuilt on every scan. Never sent to the renderer; queried via contentSearch. */
let contentIndex = new Map<string, string>()

/** Return the ids of sessions whose conversation text contains the query. */
export function contentSearch(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: string[] = []
  for (const [id, text] of contentIndex) {
    if (text.includes(q)) out.push(id)
  }
  return out
}

async function listProjectDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function scanAll(adapter: SessionAdapter): Promise<ScanResult> {
  const t0 = Date.now()
  await loadMeta()
  const root = adapter.rootDir()
  const projectDirs = await listProjectDirs(root)
  const hiddenProjects = new Set(await getHiddenProjects())
  logger.debug('scan', 'start', { root, projectDirs: projectDirs.length })

  // Collect every session file across every project.
  const files: { filePath: string; projectDir: string }[] = []
  for (const projectDir of projectDirs) {
    const dirPath = join(root, projectDir)
    let names: string[] = []
    try {
      names = await readdir(dirPath)
    } catch {
      continue
    }
    for (const name of names) {
      if (adapter.isSessionFile(name)) {
        files.push({ filePath: join(dirPath, name), projectDir })
      }
    }
  }

  const livePaths = new Set(files.map((f) => f.filePath))

  const parsed = await mapPool(files, 8, async ({ filePath, projectDir }) => {
    try {
      const st = await stat(filePath)
      const cached = getCached(filePath, st.mtimeMs, st.size)
      if (cached) return cached
      const res = await adapter.parse(filePath, projectDir)
      putCached(filePath, st.mtimeMs, st.size, res.session, res.searchText)
      return { data: res.session, searchText: res.searchText }
    } catch {
      return null
    }
  })

  pruneCache(livePaths)
  await flushCache()

  // A cwd-less session inherits a sibling's real cwd (same encoded dir), so it
  // joins the right project instead of spawning a phantom named from the dir.
  const dirToCwd = new Map<string, string>()
  for (const p of parsed) {
    if (p?.data.cwd && !dirToCwd.has(p.data.projectDir)) dirToCwd.set(p.data.projectDir, p.data.cwd)
  }

  const index = new Map<string, string>()
  const sessions: SessionSummary[] = []
  for (const p of parsed) {
    if (!p) continue
    index.set(p.data.id, p.searchText)
    const custom = getCustom(p.data.id)
    const resolvedCwd = p.data.cwd || dirToCwd.get(p.data.projectDir) || null
    const projectKey = resolvedCwd || `dir:${p.data.projectDir}`
    const projectName = resolvedCwd ? basename(resolvedCwd) : guessProjectLabel(p.data.projectDir)
    sessions.push({
      ...p.data,
      ...custom,
      projectName,
      displayTitle: custom.customTitle || p.data.title,
      projectKey
    })
  }
  contentIndex = index

  // Build per-project rollups, keyed by the real cwd (merges duplicate dirs).
  const projectMap = new Map<string, ProjectSummary>()
  for (const s of sessions) {
    let proj = projectMap.get(s.projectKey)
    if (!proj) {
      proj = {
        key: s.projectKey,
        projectDir: s.projectDir,
        name: s.projectName,
        cwd: s.projectKey.startsWith('dir:') ? null : s.projectKey,
        count: 0,
        agentCount: 0,
        lastActivity: null,
        sizeBytes: 0,
        hidden: hiddenProjects.has(s.projectKey)
      }
      projectMap.set(s.projectKey, proj)
    }
    if (s.isAgent) proj.agentCount++
    else proj.count++
    proj.sizeBytes += s.sizeBytes
    if (s.updatedAt && (!proj.lastActivity || s.updatedAt > proj.lastActivity)) {
      proj.lastActivity = s.updatedAt
    }
  }

  const projects = [...projectMap.values()].sort((a, b) =>
    (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')
  )

  const stats: Stats = {
    totalSessions: sessions.filter((s) => !s.isAgent).length,
    totalAgents: sessions.filter((s) => s.isAgent).length,
    totalBytes: sessions.reduce((n, s) => n + s.sizeBytes, 0),
    projectCount: projects.length,
    lastActivity: projects[0]?.lastActivity ?? null
  }

  logger.info('scan', 'done', {
    files: files.length,
    sessions: stats.totalSessions,
    agents: stats.totalAgents,
    projects: projects.length,
    ms: Date.now() - t0
  })

  return {
    sessions,
    projects,
    stats,
    generatedAt: new Date().toISOString(),
    adapter: adapter.id
  }
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string | null
  tools: string[]
}

/**
 * Read a session into a lightweight, display-ready transcript: user/assistant
 * turns with their text and the names of any tools the assistant invoked.
 * Capped so an enormous session can't freeze the UI.
 */
export async function readTranscript(filePath: string, maxMessages = 2000): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = []
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const line of rl) {
      if (!line || messages.length >= maxMessages) continue
      let d: Record<string, unknown>
      try {
        d = JSON.parse(line)
      } catch {
        continue
      }
      const type = d.type as string | undefined
      if (type !== 'user' && type !== 'assistant') continue
      const msg = d.message as Record<string, unknown> | undefined
      if (!msg) continue

      const texts: string[] = []
      const tools: string[] = []
      const content = msg.content
      if (typeof content === 'string') {
        texts.push(content)
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue
          const b = block as Record<string, unknown>
          if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
          else if (b.type === 'tool_use' && typeof b.name === 'string') tools.push(b.name)
          else if (b.type === 'tool_result') texts.push('[tool result]')
        }
      }
      const text = texts.join('\n').trim()
      if (!text && tools.length === 0) continue
      messages.push({
        role: type,
        text,
        timestamp: typeof d.timestamp === 'string' ? d.timestamp : null,
        tools
      })
    }
  } finally {
    rl.close()
  }
  return messages
}
