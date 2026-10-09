import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Trash2, X, Play, Plus, Pin, Star, Pencil, FolderOpen, Code2, Eye, EyeOff } from 'lucide-react'
import type { AppInfo, ProjectSummary, ScanResult, Settings, SessionSummary, TerminalTarget } from '@shared/types'
import { applyTheme, applyAppearance } from './lib/theme'
import { LocaleContext, resolveLocale, deviceLocale, translate, type TFunc } from './lib/i18n'
import { setFormatLocale } from './lib/format'
import { TopBar, type SortKey } from './components/TopBar'
import { Sidebar, type Filters } from './components/Sidebar'
import { SessionList } from './components/SessionList'
import { SessionPanel } from './components/SessionPanel'
import { StatsBar } from './components/StatsBar'
import { SettingsModal } from './components/SettingsModal'
import { TrashModal } from './components/TrashModal'
import { NewSessionModal } from './components/NewSessionModal'
import { TerminalDock, type OpenTerminal } from './components/TerminalDock'
import { LiveStrip } from './components/LiveStrip'
import { BootSequence } from './components/BootSequence'
import { RenameModal } from './components/RenameModal'
import { ContextMenu, type MenuItem } from './components/ui/context-menu'
import { Button } from './components/ui/button'

function basename(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function toPayload(s: SessionSummary): { filePath: string; projectDir: string; title: string; cwd: string | null; sizeBytes: number } {
  return { filePath: s.filePath, projectDir: s.projectDir, title: s.displayTitle, cwd: s.cwd, sizeBytes: s.sizeBytes }
}

export default function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ favoritesOnly: false, showAgents: false, showHidden: false })

  const [selected, setSelected] = useState<SessionSummary | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [contentIds, setContentIds] = useState<Set<string> | null>(null)

  const [showSettings, setShowSettings] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [renaming, setRenaming] = useState<SessionSummary | null>(null)
  const [menu, setMenu] = useState<
    | { kind: 'session'; session: SessionSummary; x: number; y: number }
    | { kind: 'project'; project: ProjectSummary; x: number; y: number }
    | null
  >(null)

  // Open terminal sessions (parallel), shown in the bottom dock.
  const [terminals, setTerminals] = useState<OpenTerminal[]>([])
  const [activeTermKey, setActiveTermKey] = useState<string | null>(null)
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const terminalsRef = useRef<OpenTerminal[]>([])
  terminalsRef.current = terminals
  const termCounter = useRef(0)

  // Active locale: the explicit setting, or the device language when "auto".
  const locale = settings ? resolveLocale(settings.language) : deviceLocale()
  const t: TFunc = (key, params) => translate(locale, key, params)
  useEffect(() => {
    setFormatLocale(locale)
    document.documentElement.lang = locale
  }, [locale])



  const rescan = useCallback(async () => {
    setScanning(true)
    try {
      const res = await window.api.scan()
      setScan(res)
      setSelected((cur) => (cur ? res.sessions.find((s) => s.id === cur.id) ?? null : null))
    } finally {
      setScanning(false)
    }
  }, [])

  // Initial load.
  useEffect(() => {
    window.api.info().then(setAppInfo)
    window.api.getSettings().then((s) => {
      setSettings(s)
      applyAppearance(s)
      setFilters((f) => ({ ...f, showAgents: s.showAgents, showHidden: s.showHidden }))
    })
    void rescan()
  }, [rescan])

  // Re-apply the theme when the OS scheme changes and we're following the system.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      if (settings?.theme === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings?.theme])

  // Live refresh when the Claude folder changes.
  useEffect(
    () =>
      window.api.onSessionsChanged(() => {
        window.api.log('debug', 'watcher', 'rescan from folder change')
        void rescan()
      }),
    [rescan]
  )

  // Deep full-text search in conversation content (debounced), merged with the
  // instant metadata match below.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setContentIds(null)
      return
    }
    const t = setTimeout(() => {
      window.api.contentSearch(q).then((ids) => setContentIds(new Set(ids)))
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = cur ? { ...cur, ...patch } : cur
      if (next) applyAppearance(next)
      return next
    })
    void window.api.setSettings(patch)
    if (patch.showAgents !== undefined || patch.showHidden !== undefined) {
      setFilters((f) => ({
        ...f,
        showAgents: patch.showAgents ?? f.showAgents,
        showHidden: patch.showHidden ?? f.showHidden
      }))
    }
  }, [])

  const onFilterChange = useCallback(
    (patch: Partial<Filters>) => {
      setFilters((f) => ({ ...f, ...patch }))
      if (patch.showAgents !== undefined) void window.api.setSettings({ showAgents: patch.showAgents })
      if (patch.showHidden !== undefined) void window.api.setSettings({ showHidden: patch.showHidden })
    },
    []
  )

  const patchSession = useCallback((id: string, patch: Partial<SessionSummary>) => {
    setScan((cur) =>
      cur ? { ...cur, sessions: cur.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : cur
    )
    setSelected((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur))
  }, [])

  const removeLocally = useCallback((ids: Set<string>) => {
    setScan((cur) => (cur ? { ...cur, sessions: cur.sessions.filter((s) => !ids.has(s.id)) } : cur))
    setSelected((cur) => (cur && ids.has(cur.id) ? null : cur))
    setChecked(new Set())
  }, [])

  const effectiveIntegrated = !!appInfo?.pty.available && settings?.terminalMode === 'integrated'
  const ideName = appInfo?.ide.cursor ? 'Cursor' : appInfo?.ide.code ? 'VS Code' : null

  const openTerminal = useCallback((target: TerminalTarget, title: string, sessionId?: string) => {
    const cur = terminalsRef.current
    if (sessionId) {
      const existing = cur.find((t) => t.sessionId === sessionId)
      if (existing) {
        setActiveTermKey(existing.key)
        setDockCollapsed(false)
        return
      }
    }
    const key = `term-${++termCounter.current}`
    setTerminals([...cur, { key, target, title, sessionId }])
    setActiveTermKey(key)
    setDockCollapsed(false)
  }, [])

  const activateTerminal = useCallback((key: string) => {
    setActiveTermKey(key)
    setDockCollapsed(false)
  }, [])

  const closeTerminal = useCallback((key: string) => {
    const cur = terminalsRef.current
    const idx = cur.findIndex((t) => t.key === key)
    const next = cur.filter((t) => t.key !== key)
    setTerminals(next)
    setActiveTermKey((active) => {
      if (active !== key) return active
      if (next.length === 0) return null
      return next[Math.min(idx, next.length - 1)].key
    })
  }, [])

  const resume = useCallback(
    async (s: SessionSummary) => {
      window.api.log('info', 'resume', s.id, { integrated: effectiveIntegrated, project: s.projectName })
      if (effectiveIntegrated) {
        openTerminal({ kind: 'resume', session: s }, s.displayTitle, s.id)
        return
      }
      const res = await window.api.openExternal({ kind: 'resume', session: s })
      if (!res.ok) {
        window.api.log('error', 'resume', 'external terminal launch failed', { id: s.id })
        alert(t('app.terminalOpenFailed'))
      }
    },
    [effectiveIntegrated, openTerminal]
  )

  const launchNew = useCallback(
    (cwd: string) => {
      window.api.log('info', 'new-session', cwd, { integrated: effectiveIntegrated })
      if (effectiveIntegrated) openTerminal({ kind: 'new', cwd }, basename(cwd))
      else void window.api.openExternal({ kind: 'new', cwd })
    },
    [effectiveIntegrated, openTerminal]
  )

  const liveIds = useMemo(
    () => new Set(terminals.map((t) => t.sessionId).filter(Boolean) as string[]),
    [terminals]
  )

  const trashOne = useCallback(
    async (s: SessionSummary) => {
      window.api.log('info', 'trash', s.id, { project: s.projectName })
      await window.api.trashSession(toPayload(s))
      removeLocally(new Set([s.id]))
    },
    [removeLocally]
  )

  const trashChecked = useCallback(async () => {
    if (!scan) return
    const targets = scan.sessions.filter((s) => checked.has(s.id))
    for (const s of targets) await window.api.trashSession(toPayload(s))
    removeLocally(new Set(targets.map((s) => s.id)))
  }, [scan, checked, removeLocally])

  const deleteOne = useCallback(
    async (s: SessionSummary) => {
      if (settings?.confirmPermanentDelete && !window.confirm(t('app.confirmDelete', { title: s.displayTitle }))) return
      window.api.log('warn', 'delete', s.id, { file: s.filePath })
      await window.api.deletePermanent(s.filePath)
      removeLocally(new Set([s.id]))
    },
    [settings, removeLocally]
  )

  const hideProject = useCallback(
    (key: string) => {
      void window.api.setProjectHidden(key, true)
      setScan((cur) =>
        cur ? { ...cur, projects: cur.projects.map((p) => (p.key === key ? { ...p, hidden: true } : p)) } : cur
      )
      if (activeProject === key) setActiveProject(null)
    },
    [activeProject]
  )

  const revealProject = useCallback((key: string) => {
    void window.api.setProjectHidden(key, false)
    setScan((cur) =>
      cur ? { ...cur, projects: cur.projects.map((p) => (p.key === key ? { ...p, hidden: false } : p)) } : cur
    )
  }, [])

  const setCustomFlag = useCallback(
    (s: SessionSummary, key: 'pinned' | 'favorite') => {
      const next = !s[key]
      void window.api.setCustom(s.id, { [key]: next })
      patchSession(s.id, { [key]: next })
    },
    [patchSession]
  )

  const renameSession = useCallback(
    (s: SessionSummary, title: string) => {
      void window.api.setCustom(s.id, { customTitle: title || null })
      patchSession(s.id, { customTitle: title || null, displayTitle: title || s.title })
    },
    [patchSession]
  )

  const trashProject = useCallback(
    async (p: ProjectSummary) => {
      const targets = (scan?.sessions ?? []).filter((s) => s.projectKey === p.key)
      if (targets.length === 0) return
      if (!window.confirm(t('app.confirmTrashProject', { count: targets.length, name: p.name }))) return
      for (const s of targets) await window.api.trashSession(toPayload(s))
      removeLocally(new Set(targets.map((s) => s.id)))
    },
    [scan, removeLocally]
  )

  const toggleCheck = useCallback((id: string) => {
    setChecked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const hiddenKeys = useMemo(
    () => new Set((scan?.projects ?? []).filter((p) => p.hidden).map((p) => p.key)),
    [scan]
  )

  // Matches every active filter EXCEPT the selected project — so the sidebar can
  // count/show which projects still have matches regardless of the current selection.
  const baseMatch = useCallback(
    (s: SessionSummary): boolean => {
      if (!filters.showAgents && s.isAgent) return false
      if (!filters.showHidden && s.hidden) return false
      if (!filters.showHidden && hiddenKeys.has(s.projectKey)) return false
      if (filters.favoritesOnly && !s.favorite) return false
      const needle = query.trim().toLowerCase()
      if (needle) {
        const hay = `${s.displayTitle} ${s.projectName} ${s.gitBranch ?? ''} ${s.firstPrompt ?? ''} ${s.cwd ?? ''}`.toLowerCase()
        if (!hay.includes(needle) && !(contentIds?.has(s.id) ?? false)) return false
      }
      return true
    },
    [filters, query, hiddenKeys, contentIds]
  )

  // Per-project counts under the current filters (drives sidebar counts + hiding).
  const projectCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of scan?.sessions ?? []) {
      if (baseMatch(s)) m.set(s.projectKey, (m.get(s.projectKey) ?? 0) + 1)
    }
    return m
  }, [scan, baseMatch])

  const totalFiltered = useMemo(
    () => [...projectCounts.values()].reduce((a, b) => a + b, 0),
    [projectCounts]
  )

  const visible = useMemo(() => {
    if (!scan) return []
    const list = scan.sessions.filter((s) => baseMatch(s) && (!activeProject || s.projectKey === activeProject))
    const cmp = (a: SessionSummary, b: SessionSummary): number => {
      const aLive = liveIds.has(a.id)
      const bLive = liveIds.has(b.id)
      if (aLive !== bLive) return aLive ? -1 : 1
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      switch (sort) {
        case 'created':
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        case 'title':
          return a.displayTitle.localeCompare(b.displayTitle)
        case 'size':
          return b.sizeBytes - a.sizeBytes
        case 'messages':
          return b.messageCount - a.messageCount
        default:
          return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      }
    }
    return list.sort(cmp)
  }, [scan, baseMatch, activeProject, sort, liveIds])

  const sessionCwd = (s: SessionSummary): string | null =>
    s.cwd ?? (s.projectKey.startsWith('dir:') ? null : s.projectKey)

  const menuItems = (): MenuItem[] => {
    if (!menu) return []
    if (menu.kind === 'session') {
      const s = menu.session
      const cwd = sessionCwd(s)
      return [
        { label: t('menu.resume'), icon: <Play className="h-3.5 w-3.5" />, onClick: () => resume(s) },
        { label: t('menu.newConversation'), icon: <Plus className="h-3.5 w-3.5" />, onClick: () => cwd && launchNew(cwd), disabled: !cwd },
        { separator: true },
        { label: t('menu.rename'), icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => setRenaming(s) },
        { label: s.pinned ? t('menu.unpin') : t('menu.pin'), icon: <Pin className="h-3.5 w-3.5" />, onClick: () => setCustomFlag(s, 'pinned') },
        { label: s.favorite ? t('menu.unfavorite') : t('menu.favorite'), icon: <Star className="h-3.5 w-3.5" />, onClick: () => setCustomFlag(s, 'favorite') },
        { separator: true },
        { label: t('menu.openFolder'), icon: <FolderOpen className="h-3.5 w-3.5" />, onClick: () => cwd && window.api.openPath(cwd), disabled: !cwd },
        ...(ideName ? [{ label: t('menu.openInIde', { ide: ideName }), icon: <Code2 className="h-3.5 w-3.5" />, onClick: () => cwd && window.api.openInIde(cwd), disabled: !cwd }] : []),
        { separator: true },
        { label: t('menu.trash'), icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => trashOne(s) },
        { label: t('menu.deletePermanent'), icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => deleteOne(s) }
      ]
    }
    const p = menu.project
    return [
      { label: t('menu.newConversation'), icon: <Plus className="h-3.5 w-3.5" />, onClick: () => p.cwd && launchNew(p.cwd), disabled: !p.cwd },
      { separator: true },
      { label: t('menu.openFolder'), icon: <FolderOpen className="h-3.5 w-3.5" />, onClick: () => p.cwd && window.api.openPath(p.cwd), disabled: !p.cwd },
      ...(ideName ? [{ label: t('menu.openInIde', { ide: ideName }), icon: <Code2 className="h-3.5 w-3.5" />, onClick: () => p.cwd && window.api.openInIde(p.cwd as string), disabled: !p.cwd }] : []),
      { separator: true },
      {
        label: p.hidden ? t('menu.showProject') : t('menu.hideProject'),
        icon: p.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />,
        onClick: () => (p.hidden ? revealProject(p.key) : hideProject(p.key))
      },
      { label: t('menu.trashProject'), icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => trashProject(p) }
    ]
  }

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('app.booting')}
      </div>
    )
  }

  return (
    <LocaleContext.Provider value={locale}>
    <div className="app-shell flex flex-col overflow-hidden bg-background">
      <div className="crt-overlay" aria-hidden />
      <BootSequence />
      <TopBar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        onNewSession={() => setShowNew(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={scan?.projects ?? []}
          counts={projectCounts}
          totalSessions={totalFiltered}
          activeProject={activeProject}
          filters={filters}
          onSelectProject={setActiveProject}
          onFilterChange={onFilterChange}
          onRevealProject={revealProject}
          onProjectContextMenu={(p, x, y) => setMenu({ kind: 'project', project: p, x, y })}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {checked.size > 0 && (
            <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-1.5 text-sm">
              <span className="font-mono text-foreground">{t('app.selected', { count: checked.size })}</span>
              <div className="flex-1" />
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={trashChecked}>
                <Trash2 className="h-3.5 w-3.5" /> {t('menu.trash')}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setChecked(new Set())}>
                <X className="h-3.5 w-3.5" /> {t('app.cancel')}
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {terminals.length > 0 && (
              <LiveStrip
                terminals={terminals}
                activeKey={activeTermKey}
                onActivate={activateTerminal}
                onClose={closeTerminal}
              />
            )}
            {!scan ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('app.scanning')}
              </div>
            ) : (
              <SessionList
                sessions={visible}
                groupBy={settings.groupByProject && !activeProject}
                selectedId={selected?.id ?? null}
                checked={checked}
                liveIds={liveIds}
                onOpen={setSelected}
                onToggleCheck={toggleCheck}
                onResume={resume}
                onTrash={trashOne}
                onHideProject={hideProject}
                onContextMenu={(s, x, y) => setMenu({ kind: 'session', session: s, x, y })}
              />
            )}
          </div>
        </main>

        {selected && (
          <div className="w-[460px] shrink-0">
            <SessionPanel
              session={selected}
              ideName={ideName}
              onClose={() => setSelected(null)}
              onResume={resume}
              onPatch={patchSession}
              onTrash={trashOne}
              onDelete={deleteOne}
            />
          </div>
        )}
      </div>

      {terminals.length > 0 && (
        <TerminalDock
          terminals={terminals}
          activeKey={activeTermKey}
          collapsed={dockCollapsed}
          onActivate={activateTerminal}
          onClose={closeTerminal}
          onToggleCollapse={() => setDockCollapsed((c) => !c)}
        />
      )}

      <StatsBar stats={scan?.stats ?? { totalSessions: 0, totalAgents: 0, totalBytes: 0, projectCount: 0, lastActivity: null }} />

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        appInfo={appInfo}
        scanning={scanning}
        onChange={patchSettings}
        onRescan={() => void rescan()}
        onOpenTrash={() => {
          setShowSettings(false)
          setShowTrash(true)
        }}
      />
      <TrashModal open={showTrash} onClose={() => setShowTrash(false)} onChanged={() => void rescan()} />
      <NewSessionModal
        open={showNew}
        onClose={() => setShowNew(false)}
        projects={scan?.projects ?? []}
        onLaunch={launchNew}
      />
      <RenameModal session={renaming} onClose={() => setRenaming(null)} onSave={renameSession} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
    </div>
    </LocaleContext.Provider>
  )
}
