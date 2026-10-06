import { useEffect, useRef, useState } from 'react'
import { Star, Pin, FolderOpen, Trash2, Play, Pencil, Check, X, FileText, Info, GitBranch, Code2 } from 'lucide-react'
import type { SessionSummary } from '@shared/types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { TranscriptView } from './TranscriptView'
import { cn } from '@/lib/utils'
import { formatBytes, formatDateTime } from '@/lib/format'

type Tab = 'apercu' | 'infos'

interface Props {
  session: SessionSummary
  ideName: string | null
  onClose: () => void
  onResume: (s: SessionSummary) => void
  onPatch: (id: string, patch: Partial<SessionSummary>) => void
  onTrash: (s: SessionSummary) => void
  onDelete: (s: SessionSummary) => void
}

export function SessionPanel({ session, ideName, onClose, onResume, onPatch, onTrash, onDelete }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('apercu')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.displayTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditing(false)
    setDraft(session.displayTitle)
    setTab('apercu')
  }, [session.id])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const saveTitle = (): void => {
    const title = draft.trim()
    window.api.setCustom(session.id, { customTitle: title || null })
    onPatch(session.id, { customTitle: title || null, displayTitle: title || session.title })
    setEditing(false)
  }

  const toggle = (key: 'pinned' | 'favorite'): void => {
    const next = !session[key]
    window.api.setCustom(session.id, { [key]: next })
    onPatch(session.id, { [key]: next })
  }

  return (
    <aside className="flex h-full w-full animate-panel-in flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="rivets flex items-start gap-2 border-b border-border bg-background px-4 py-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="h-7 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveTitle}>
                <Check className="h-4 w-4 text-patina" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h2 className="truncate font-display text-sm text-foreground" title={session.displayTitle}>
                {session.displayTitle}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
                onClick={() => setEditing(true)}
                title="Renommer"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted">{session.projectName}</Badge>
            {session.gitBranch && session.gitBranch !== 'HEAD' && (
              <Badge variant="accent">
                <GitBranch className="h-3 w-3" /> {session.gitBranch}
              </Badge>
            )}
            {session.isAgent && <Badge variant="outline">sous-agent</Badge>}
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-background/40 px-3 py-2">
        <Button
          size="sm"
          data-testid="resume-btn"
          className="gap-1.5 uppercase tracking-wider"
          onClick={() => onResume(session)}
        >
          <Play className="h-3.5 w-3.5" /> Reprendre
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="Favori"
          onClick={() => toggle('favorite')}
        >
          <Star className={cn('h-4 w-4', session.favorite && 'fill-brass text-brass')} />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Épingler" onClick={() => toggle('pinned')}>
          <Pin className={cn('h-4 w-4', session.pinned && 'fill-brass text-brass')} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="Ouvrir le dossier"
          onClick={() => session.cwd && window.api.openPath(session.cwd)}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
        {ideName && session.cwd && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title={`Ouvrir dans ${ideName}`}
            onClick={() => window.api.openInIde(session.cwd as string)}
          >
            <Code2 className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          title="Mettre à la corbeille"
          onClick={() => onTrash(session)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background text-sm">
        <TabButton active={tab === 'apercu'} onClick={() => setTab('apercu')} icon={<FileText className="h-3.5 w-3.5" />}>
          Aperçu
        </TabButton>
        <TabButton active={tab === 'infos'} onClick={() => setTab('infos')} icon={<Info className="h-3.5 w-3.5" />}>
          Détails
        </TabButton>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        <div className={cn('absolute inset-0 overflow-y-auto', tab !== 'apercu' && 'hidden')}>
          <TranscriptView filePath={session.filePath} />
        </div>
        <div className={cn('absolute inset-0 overflow-y-auto p-4', tab !== 'infos' && 'hidden')}>
          <DetailsTab session={session} onDelete={() => onDelete(session)} />
        </div>
      </div>
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: JSX.Element
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2 font-mono text-[13px] transition-colors',
        active
          ? 'border-b-2 border-primary text-primary'
          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function DetailsTab({ session, onDelete }: { session: SessionSummary; onDelete: () => void }): JSX.Element {
  const rows: [string, string][] = [
    ['Projet', session.projectName],
    ['Dossier', session.cwd ?? '—'],
    ['Branche', session.gitBranch ?? '—'],
    ['Version Claude', session.version ?? '—'],
    ['Messages', String(session.messageCount)],
    ['Créée', formatDateTime(session.createdAt)],
    ['Modifiée', formatDateTime(session.updatedAt)],
    ['Taille', formatBytes(session.sizeBytes)],
    ['Titre', `${session.title} (${session.titleSource})`],
    ['ID', session.id],
    ['Fichier', session.filePath]
  ]
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-all font-mono text-xs leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="brass-divider" />
      <div>
        <div className="mb-1 text-sm font-medium text-destructive">Zone de danger</div>
        <p className="mb-2 text-xs text-muted-foreground">
          Supprime définitivement le fichier de session (sans passer par la corbeille).
        </p>
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Supprimer définitivement
        </Button>
      </div>
    </div>
  )
}
