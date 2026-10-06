import { app } from 'electron'
import { join } from 'path'
import { readJson, writeJson } from './jsonFile'

/** User customisations we attach to a session WITHOUT touching its .jsonl file. */
export interface SessionCustom {
  customTitle?: string | null
  pinned?: boolean
  favorite?: boolean
  hidden?: boolean
}

export type ThemeMode = 'system' | 'dark' | 'light'
export type TerminalMode = 'integrated' | 'external'
export type Palette = 'amber' | 'pipboy' | 'rose'
export type DisplayFont = 'oxanium' | 'orbitron' | 'chakra' | 'pressstart' | 'vt323'
export type FontScale = 'sm' | 'md' | 'lg'
/** UI language: an explicit choice, or follow the device/OS language. */
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
}

interface MetaStore {
  version: 1
  sessions: Record<string, SessionCustom>
  hiddenProjects: string[]
  settings: Settings
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  palette: 'amber',
  displayFont: 'oxanium',
  fontScale: 'md',
  language: 'auto',
  showAgents: false,
  showHidden: false,
  // Integrated by default; the UI auto-falls back to external if the pty backend
  // can't load on this platform.
  terminalMode: 'integrated',
  groupByProject: true,
  confirmPermanentDelete: true
}

let store: MetaStore | null = null

function metaPath(): string {
  return join(app.getPath('userData'), 'meta.json')
}

export async function loadMeta(): Promise<MetaStore> {
  if (store) return store
  const loaded = await readJson<Partial<MetaStore>>(metaPath(), {})
  store = {
    version: 1,
    sessions: loaded.sessions ?? {},
    hiddenProjects: loaded.hiddenProjects ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) }
  }
  return store
}

async function persist(): Promise<void> {
  if (store) await writeJson(metaPath(), store)
}

export function getCustom(id: string): SessionCustom {
  return store?.sessions[id] ?? {}
}

export async function setCustom(id: string, patch: SessionCustom): Promise<SessionCustom> {
  const s = await loadMeta()
  const next = { ...(s.sessions[id] ?? {}), ...patch }
  // Drop empty keys so the store stays tidy.
  for (const k of Object.keys(next) as (keyof SessionCustom)[]) {
    const v = next[k]
    if (v === null || v === undefined || v === false || v === '') delete next[k]
  }
  if (Object.keys(next).length === 0) delete s.sessions[id]
  else s.sessions[id] = next
  await persist()
  return next
}

export async function getHiddenProjects(): Promise<string[]> {
  return (await loadMeta()).hiddenProjects
}

export async function setProjectHidden(projectDir: string, hidden: boolean): Promise<void> {
  const s = await loadMeta()
  const set = new Set(s.hiddenProjects)
  if (hidden) set.add(projectDir)
  else set.delete(projectDir)
  s.hiddenProjects = [...set]
  await persist()
}

export async function getSettings(): Promise<Settings> {
  return (await loadMeta()).settings
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = await loadMeta()
  s.settings = { ...s.settings, ...patch }
  await persist()
  return s.settings
}
