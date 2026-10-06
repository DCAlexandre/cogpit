import { app } from 'electron'
import { join, basename } from 'path'
import { rename, copyFile, unlink, mkdir, readdir } from 'fs/promises'
import { readJson, writeJson } from './jsonFile'
import { dropFromCache } from './cache'

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

type TrashIndex = Record<string, TrashEntry>

function trashDir(): string {
  return join(app.getPath('userData'), 'trash')
}
function indexPath(): string {
  return join(trashDir(), 'index.json')
}

async function loadIndex(): Promise<TrashIndex> {
  return readJson<TrashIndex>(indexPath(), {})
}
async function saveIndex(idx: TrashIndex): Promise<void> {
  await writeJson(indexPath(), idx)
}

/** Move a file, falling back to copy+unlink when rename crosses a volume. */
async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(join(to, '..'), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await unlink(from)
  }
}

/** Move a session file into Cogpit's reversible trash. */
export async function trashSession(
  filePath: string,
  meta: { projectDir: string; title: string; cwd: string | null; sizeBytes: number }
): Promise<TrashEntry> {
  const fileName = basename(filePath)
  const trashId = `${meta.projectDir}__${fileName}`
  const dest = join(trashDir(), trashId)
  await moveFile(filePath, dest)
  const entry: TrashEntry = {
    trashId,
    originalPath: filePath,
    fileName,
    projectDir: meta.projectDir,
    title: meta.title,
    cwd: meta.cwd,
    sizeBytes: meta.sizeBytes,
    trashedAt: new Date().toISOString()
  }
  const idx = await loadIndex()
  idx[trashId] = entry
  await saveIndex(idx)
  dropFromCache(filePath)
  return entry
}

export async function listTrash(): Promise<TrashEntry[]> {
  const idx = await loadIndex()
  return Object.values(idx).sort((a, b) => b.trashedAt.localeCompare(a.trashedAt))
}

/** Put a trashed session back where it came from. */
export async function restoreTrash(trashId: string): Promise<void> {
  const idx = await loadIndex()
  const entry = idx[trashId]
  if (!entry) return
  await moveFile(join(trashDir(), trashId), entry.originalPath)
  delete idx[trashId]
  await saveIndex(idx)
}

export async function deleteFromTrash(trashId: string): Promise<void> {
  const idx = await loadIndex()
  if (!idx[trashId]) return
  try {
    await unlink(join(trashDir(), trashId))
  } catch {
    /* already gone */
  }
  delete idx[trashId]
  await saveIndex(idx)
}

export async function emptyTrash(): Promise<void> {
  const dir = trashDir()
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    names
      .filter((n) => n !== 'index.json')
      .map((n) => unlink(join(dir, n)).catch(() => {}))
  )
  await saveIndex({})
}

/** Delete an active session file outright, skipping the trash. */
export async function deleteSessionPermanently(filePath: string): Promise<void> {
  await unlink(filePath)
  dropFromCache(filePath)
}
