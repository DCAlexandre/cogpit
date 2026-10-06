import { app } from 'electron'
import { join } from 'path'
import { readJson, writeJson } from './jsonFile'
import type { ParsedSession } from '../adapters/types'

/**
 * Parsing every .jsonl on each launch is wasteful (hundreds of multi-MB files).
 * We cache parsed metadata keyed by path+mtime+size, so only changed or new
 * sessions are re-read. The cache is disposable — deleting it just forces a
 * one-off full rescan.
 */
interface CacheEntry {
  mtimeMs: number
  size: number
  data: ParsedSession
  searchText: string
}

export interface CacheHit {
  data: ParsedSession
  searchText: string
}

type CacheStore = Record<string, CacheEntry>

/** Bump when the parse shape changes so stale entries are dropped on load.
 *  v2: session cwd now captured from the FIRST message (resume fix). */
const CACHE_VERSION = 2

interface CacheFile {
  version: number
  entries: CacheStore
}

let store: CacheStore | null = null
let dirty = false

function cachePath(): string {
  return join(app.getPath('userData'), 'parse-cache.json')
}

export async function loadCache(): Promise<void> {
  const file = await readJson<Partial<CacheFile>>(cachePath(), {})
  store = file.version === CACHE_VERSION && file.entries ? file.entries : {}
}

export function getCached(filePath: string, mtimeMs: number, size: number): CacheHit | null {
  const e = store?.[filePath]
  if (e && e.mtimeMs === mtimeMs && e.size === size) {
    return { data: e.data, searchText: e.searchText ?? '' }
  }
  return null
}

export function putCached(
  filePath: string,
  mtimeMs: number,
  size: number,
  data: ParsedSession,
  searchText: string
): void {
  if (!store) store = {}
  store[filePath] = { mtimeMs, size, data, searchText }
  dirty = true
}

export function dropFromCache(filePath: string): void {
  if (store && store[filePath]) {
    delete store[filePath]
    dirty = true
  }
}

/** Remove cache entries whose files no longer exist in the given set. */
export function pruneCache(livePaths: Set<string>): void {
  if (!store) return
  for (const p of Object.keys(store)) {
    if (!livePaths.has(p)) {
      delete store[p]
      dirty = true
    }
  }
}

export async function flushCache(): Promise<void> {
  if (dirty && store) {
    await writeJson(cachePath(), { version: CACHE_VERSION, entries: store } satisfies CacheFile)
    dirty = false
  }
}
