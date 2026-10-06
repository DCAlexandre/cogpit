import { Fragment } from 'react'
import { Play, Trash2, Star, Pin, GitBranch, MessageSquare, Bot, EyeOff } from 'lucide-react'
import type { SessionSummary } from '@shared/types'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { formatBytes, formatRelative } from '@/lib/format'

interface Props {
  sessions: SessionSummary[]
  groupBy: boolean
  selectedId: string | null
  checked: Set<string>
  liveIds: Set<string>
  onOpen: (s: SessionSummary) => void
  onToggleCheck: (id: string) => void
  onResume: (s: SessionSummary) => void
  onTrash: (s: SessionSummary) => void
  onHideProject?: (projectDir: string) => void
  onContextMenu: (s: SessionSummary, x: number, y: number) => void
}

export function SessionList({
  sessions,
  groupBy,
  selectedId,
  checked,
  liveIds,
  onOpen,
  onToggleCheck,
  onResume,
  onTrash,
  onHideProject,
  onContextMenu
}: Props): JSX.Element {
  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Bot className="h-8 w-8 opacity-30" />
        <p className="font-mono text-sm">Aucune session ne correspond.</p>
        <p className="hud-label">ajuste la recherche ou les filtres</p>
      </div>
    )
  }

  if (!groupBy) {
    return (
      <div>
        {sessions.map((s) => (
          <Row
            key={s.filePath}
            s={s}
            showProject
            selected={selectedId === s.id}
            isChecked={checked.has(s.id)}
            isLive={liveIds.has(s.id)}
            onOpen={onOpen}
            onToggleCheck={onToggleCheck}
            onResume={onResume}
            onTrash={onTrash}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    )
  }

  const groups = new Map<string, SessionSummary[]>()
  for (const s of sessions) {
    const arr = groups.get(s.projectKey) ?? []
    arr.push(s)
    groups.set(s.projectKey, arr)
  }

  return (
    <div>
      {[...groups.entries()].map(([projectKey, items]) => (
        <Fragment key={projectKey}>
          <div className="group sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-1.5 backdrop-blur">
            <span className="led led-active" />
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {items[0].projectName}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/70">[{items.length}]</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground/40">{items[0].cwd}</span>
            <div className="flex-1" />
            {onHideProject && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 hover:text-primary group-hover:opacity-100"
                title="Masquer ce projet"
                onClick={() => onHideProject(projectKey)}
              >
                <EyeOff className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div>
            {items.map((s) => (
              <Row
                key={s.filePath}
                s={s}
                selected={selectedId === s.id}
                isChecked={checked.has(s.id)}
                isLive={liveIds.has(s.id)}
                onOpen={onOpen}
                onToggleCheck={onToggleCheck}
                onResume={onResume}
                onTrash={onTrash}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function Row({
  s,
  showProject,
  selected,
  isChecked,
  isLive,
  onOpen,
  onToggleCheck,
  onResume,
  onTrash,
  onContextMenu
}: {
  s: SessionSummary
  showProject?: boolean
  selected: boolean
  isChecked: boolean
  isLive: boolean
  onOpen: (s: SessionSummary) => void
  onToggleCheck: (id: string) => void
  onResume: (s: SessionSummary) => void
  onTrash: (s: SessionSummary) => void
  onContextMenu: (s: SessionSummary, x: number, y: number) => void
}): JSX.Element {
  return (
    <div
      data-testid="session-row"
      onClick={() => onOpen(s)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(s, e.clientX, e.clientY)
      }}
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 border-b border-border/40 py-2.5 pl-4 pr-3 transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-primary/[0.04]'
      )}
    >
      {selected && <span className="absolute left-0 top-0 h-full w-[2px] bg-primary shadow-glow-sm" />}

      <input
        type="checkbox"
        checked={isChecked}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleCheck(s.id)}
        aria-label="Sélectionner"
        className={cn(
          'h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-[2px] border border-muted-foreground/40 bg-transparent transition-all checked:border-primary checked:bg-primary checked:shadow-glow-sm',
          !isChecked && 'opacity-0 group-hover:opacity-100'
        )}
      />

      {/* status gutter */}
      <span
        className={cn(
          'led shrink-0 transition-all',
          isLive
            ? 'led-live animate-led-pulse'
            : selected
              ? 'led-active'
              : 'opacity-50 group-hover:bg-primary group-hover:opacity-100'
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="shrink-0 rounded-sm border border-live/50 bg-live/15 px-1 py-px font-mono text-[9px] uppercase tracking-wider text-live">
              live
            </span>
          )}
          {s.pinned && <Pin className="h-3 w-3 shrink-0 fill-primary text-primary" />}
          {s.favorite && <Star className="h-3 w-3 shrink-0 fill-primary text-primary" />}
          {s.isAgent && <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span
            className={cn(
              'truncate font-display text-[13px] font-medium transition-colors',
              selected ? 'text-primary' : 'text-foreground group-hover:text-primary'
            )}
            title={s.displayTitle}
          >
            {s.displayTitle}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
          {showProject && <span className="truncate text-copper">{s.projectName}</span>}
          {s.gitBranch && s.gitBranch !== 'HEAD' && (
            <span className="flex items-center gap-0.5">
              <GitBranch className="h-3 w-3" />
              {s.gitBranch}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {s.messageCount}
          </span>
          <span>{formatBytes(s.sizeBytes)}</span>
        </div>
      </div>

      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 group-hover:opacity-0">
        {formatRelative(s.updatedAt)}
      </span>
      <div className="absolute right-3 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="glow-hover h-7 w-7 hover:text-primary"
          title="Reprendre"
          aria-label="Reprendre la session"
          onClick={(e) => {
            e.stopPropagation()
            onResume(s)
          }}
        >
          <Play className="h-3.5 w-3.5 text-primary" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:bg-destructive/10"
          title="Corbeille"
          aria-label="Mettre à la corbeille"
          onClick={(e) => {
            e.stopPropagation()
            onTrash(s)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
