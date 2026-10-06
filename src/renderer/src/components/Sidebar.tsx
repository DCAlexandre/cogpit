import { useMemo, useState } from 'react'
import { Layers, Star, Bot, Eye, ChevronRight, Folder, FolderGit2, SlidersHorizontal } from 'lucide-react'
import type { ProjectSummary } from '@shared/types'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/format'
import { useT } from '@/lib/i18n'

export interface Filters {
  favoritesOnly: boolean
  showAgents: boolean
  showHidden: boolean
}

interface Props {
  projects: ProjectSummary[]
  counts: Map<string, number>
  totalSessions: number
  activeProject: string | null
  filters: Filters
  onSelectProject: (key: string | null) => void
  onFilterChange: (patch: Partial<Filters>) => void
  onRevealProject: (key: string) => void
  onProjectContextMenu: (project: ProjectSummary, x: number, y: number) => void
}

interface TreeNode {
  name: string
  id: string
  project?: ProjectSummary
  children: TreeNode[]
  count: number
}

function segmentsOf(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean)
}

/** Build a folder tree from project cwds, stripping the shared root prefix so the
 *  tree mirrors the user's own directory layout — whatever it is. */
function buildTree(projects: ProjectSummary[], counts: Map<string, number>, othersLabel: string): TreeNode[] {
  const withCwd = projects.filter((p) => p.cwd)
  const others = projects.filter((p) => !p.cwd)

  const paths = withCwd.map((p) => segmentsOf(p.cwd as string))
  let prefixLen = 0
  if (paths.length > 0) {
    const minLen = Math.min(...paths.map((s) => s.length))
    let common = paths[0].length
    for (const segs of paths) {
      let i = 0
      while (i < common && i < segs.length && paths[0][i] === segs[i]) i++
      common = i
    }
    // keep at least the last segment of the shallowest project as a node
    prefixLen = Math.max(0, Math.min(common, minLen - 1))
  }

  const root: TreeNode = { name: '', id: '', children: [], count: 0 }
  // Match by name only so a node can be BOTH a project and a parent of sub-projects.
  const child = (parent: TreeNode, name: string): TreeNode => {
    let c = parent.children.find((n) => n.name === name)
    if (!c) {
      c = { name, id: `${parent.id}/${name}`, children: [], count: 0 }
      parent.children.push(c)
    }
    return c
  }

  for (const p of withCwd) {
    const segs = segmentsOf(p.cwd as string).slice(prefixLen)
    let node = root
    for (const seg of segs) node = child(node, seg)
    node.project = p
  }

  if (others.length > 0) {
    const bucket: TreeNode = { name: othersLabel, id: '/__others', children: [], count: 0 }
    for (const p of others) bucket.children.push({ name: p.name, id: p.key, project: p, children: [], count: 0 })
    root.children.push(bucket)
  }

  const annotate = (n: TreeNode): number => {
    const own = n.project ? (counts.get(n.project.key) ?? 0) : 0
    n.count = own + n.children.reduce((s, c) => s + annotate(c), 0)
    n.children.sort((a, b) => a.name.localeCompare(b.name))
    return n.count
  }
  root.children.forEach(annotate)
  root.children.sort((a, b) => a.name.localeCompare(b.name))
  return root.children
}

export function Sidebar({
  projects,
  counts,
  totalSessions,
  activeProject,
  filters,
  onSelectProject,
  onFilterChange,
  onRevealProject,
  onProjectContextMenu
}: Props): JSX.Element {
  const t = useT()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const anyFilter = filters.favoritesOnly || filters.showAgents || filters.showHidden

  // Only projects that still have matching sessions under the active filters.
  const shown = useMemo(
    () => projects.filter((p) => (filters.showHidden || !p.hidden) && (counts.get(p.key) ?? 0) > 0),
    [projects, filters.showHidden, counts]
  )

  const othersLabel = t('sidebar.others')
  const tree = useMemo(() => buildTree(shown, counts, othersLabel), [shown, counts, othersLabel])

  const toggle = (id: string): void =>
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <nav className="relative flex h-full w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="hud-label">{t('sidebar.projects')}</span>
        <div className="flex items-center gap-2">
          <span className="hud-label text-primary/70">{shown.length}</span>
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            title={t('sidebar.filters')}
            aria-label={t('sidebar.filters')}
            aria-expanded={filtersOpen}
            className={cn(
              'relative flex h-6 w-6 items-center justify-center rounded-md transition-colors',
              filtersOpen ? 'bg-muted text-primary' : 'text-muted-foreground hover:bg-muted hover:text-primary'
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {anyFilter && <span className="led led-active absolute -right-0.5 -top-0.5 h-1.5 w-1.5" />}
          </button>
        </div>
      </div>

      {filtersOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setFiltersOpen(false)} />
          <div className="panel absolute right-2 top-11 z-30 w-56 animate-fade-in p-1.5">
            <div className="px-2 pb-1 pt-0.5">
              <span className="hud-label">{t('sidebar.filtersTitle')}</span>
            </div>
            <Switch
              icon={<Star className="h-3.5 w-3.5" />}
              label={t('sidebar.favoritesOnly')}
              active={filters.favoritesOnly}
              onClick={() => onFilterChange({ favoritesOnly: !filters.favoritesOnly })}
            />
            <Switch
              icon={<Bot className="h-3.5 w-3.5" />}
              label={t('sidebar.subAgents')}
              active={filters.showAgents}
              onClick={() => onFilterChange({ showAgents: !filters.showAgents })}
            />
            <Switch
              icon={<Eye className="h-3.5 w-3.5" />}
              label={t('sidebar.hidden')}
              active={filters.showHidden}
              onClick={() => onFilterChange({ showHidden: !filters.showHidden })}
            />
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <button
          onClick={() => onSelectProject(null)}
          className={cn(
            'mb-1 flex w-full items-center gap-2.5 rounded-md py-2 pl-3 pr-2 text-left transition-colors',
            activeProject === null ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Layers className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[13px] font-medium">{t('sidebar.allProjects')}</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">{totalSessions}</span>
        </button>

        <div className="brass-divider my-2" />

        <div className="space-y-0.5">
          {tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              activeProject={activeProject}
              collapsed={collapsed}
              onToggle={toggle}
              onSelect={onSelectProject}
              onReveal={onRevealProject}
              onContextMenu={onProjectContextMenu}
            />
          ))}
        </div>
      </div>

    </nav>
  )
}

function TreeRow({
  node,
  depth,
  activeProject,
  collapsed,
  onToggle,
  onSelect,
  onReveal,
  onContextMenu
}: {
  node: TreeNode
  depth: number
  activeProject: string | null
  collapsed: Set<string>
  onToggle: (id: string) => void
  onSelect: (key: string) => void
  onReveal: (key: string) => void
  onContextMenu: (project: ProjectSummary, x: number, y: number) => void
}): JSX.Element {
  const t = useT()
  const hasChildren = node.children.length > 0
  const isOpen = !collapsed.has(node.id)
  const proj = node.project
  const active = !!proj && activeProject === proj.key
  const dim = proj?.hidden

  const onClick = (): void => {
    if (proj) onSelect(proj.key)
    else if (hasChildren) onToggle(node.id)
  }

  return (
    <>
      <div
        onContextMenu={(e) => {
          if (proj) {
            e.preventDefault()
            onContextMenu(proj, e.clientX, e.clientY)
          }
        }}
        className={cn(
          'group flex items-center gap-1 rounded-md pr-2 transition-colors',
          active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
        style={{ paddingLeft: depth * 12 + 2 }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-primary"
            aria-label={isOpen ? t('sidebar.collapse') : t('sidebar.expand')}
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
          {proj ? (
            <FolderGit2 className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : dim ? 'opacity-40' : 'text-copper')} />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          )}
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-[13px]', dim && 'opacity-50', !proj && 'text-muted-foreground')}>
              {node.name}
            </span>
            {proj && (
              <span className="block truncate text-[10px] text-muted-foreground/50">{formatRelative(proj.lastActivity)}</span>
            )}
          </span>
        </button>

        {dim ? (
          <Eye
            className="h-3.5 w-3.5 shrink-0 cursor-pointer opacity-0 group-hover:opacity-70"
            onClick={() => proj && onReveal(proj.key)}
          />
        ) : (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/60">{node.count}</span>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="space-y-0.5">
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              activeProject={activeProject}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
              onReveal={onReveal}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </>
  )
}

function Switch({
  icon,
  label,
  active,
  onClick
}: {
  icon: JSX.Element
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
      )}
      aria-pressed={active}
    >
      <span className={cn(active ? 'text-primary' : 'opacity-70')}>{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={cn('led', active && 'led-active')} />
    </button>
  )
}
