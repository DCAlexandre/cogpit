import { useCallback, useEffect, useState } from 'react'
import { ArchiveRestore, Trash2, Loader2 } from 'lucide-react'
import type { TrashEntry } from '@shared/types'
import { Modal } from './ui/modal'
import { Button } from './ui/button'
import { formatBytes, formatRelative } from '@/lib/format'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export function TrashModal({ open, onClose, onChanged }: Props): JSX.Element {
  const t = useT()
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)

  const reload = useCallback(() => {
    setEntries(null)
    window.api.trash.list().then(setEntries)
  }, [])

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  const restore = async (id: string): Promise<void> => {
    await window.api.trash.restore(id)
    reload()
    onChanged()
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.trash.delete(id)
    reload()
  }
  const empty = async (): Promise<void> => {
    await window.api.trash.empty()
    reload()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('trash.title')}
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('trash.hintBefore')} <code>~/.claude</code> {t('trash.hintAfter')}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={empty}
            disabled={!entries || entries.length === 0}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t('trash.empty')}
          </Button>
        </div>
      }
    >
      {!entries ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('trash.loading')}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{t('trash.emptyState')}</div>
      ) : (
        <div className="divide-y divide-border/60">
          {entries.map((e) => (
            <div key={e.trashId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" title={e.title}>
                  {e.title}
                </div>
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate text-brass/70">{e.projectDir}</span>
                  <span>{formatBytes(e.sizeBytes)}</span>
                  <span>{t('trash.deletedAt', { when: formatRelative(e.trashedAt) })}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => restore(e.trashId)}>
                <ArchiveRestore className="h-3.5 w-3.5" /> {t('trash.restore')}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                title={t('trash.deleteForever')}
                onClick={() => remove(e.trashId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
