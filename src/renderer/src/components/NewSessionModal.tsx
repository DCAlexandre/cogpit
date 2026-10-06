import { useMemo, useState } from 'react'
import { FolderGit2, Play, FolderSearch } from 'lucide-react'
import type { ProjectSummary } from '@shared/types'
import { Modal } from './ui/modal'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  projects: ProjectSummary[]
  onLaunch: (cwd: string) => void
}

export function NewSessionModal({ open, onClose, projects, onLaunch }: Props): JSX.Element {
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const withCwd = projects.filter((p) => p.cwd)
    const needle = q.trim().toLowerCase()
    if (!needle) return withCwd
    return withCwd.filter((p) => p.name.toLowerCase().includes(needle) || (p.cwd ?? '').toLowerCase().includes(needle))
  }, [projects, q])

  const launch = (cwd: string): void => {
    onLaunch(cwd)
    onClose()
  }

  const browse = async (): Promise<void> => {
    const dir = await window.api.pickFolder()
    if (dir) launch(dir)
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle session" className="max-w-lg">
      <p className="mb-3 text-sm text-muted-foreground">
        Lance <code className="text-primary">claude</code> dans le dossier de ton choix.
      </p>

      <Button onClick={browse} className="mb-4 w-full gap-2 uppercase tracking-wider">
        <FolderSearch className="h-4 w-4" /> Parcourir un dossier…
      </Button>

      {projects.some((p) => p.cwd) && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="hud-label">projets récents</span>
            <span className="brass-divider flex-1" />
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filtrer…"
            className="mb-2"
          />
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {list.map((p) => (
              <button
                key={p.key}
                onClick={() => p.cwd && launch(p.cwd)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted'
                )}
              >
                <FolderGit2 className="h-4 w-4 shrink-0 text-copper" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground/60">{p.cwd}</span>
                </span>
                <Play className="h-4 w-4 shrink-0 text-primary opacity-0 group-hover:opacity-100" />
              </button>
            ))}
            {list.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">Aucun projet ne correspond.</div>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
