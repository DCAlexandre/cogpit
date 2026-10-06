import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '@shared/types'
import { Modal } from './ui/modal'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useT } from '@/lib/i18n'

interface Props {
  session: SessionSummary | null
  onClose: () => void
  onSave: (s: SessionSummary, title: string) => void
}

export function RenameModal({ session, onClose, onSave }: Props): JSX.Element {
  const t = useT()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session) {
      setDraft(session.displayTitle)
      setTimeout(() => inputRef.current?.select(), 30)
    }
  }, [session])

  const save = (): void => {
    if (session) onSave(session, draft.trim())
    onClose()
  }

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={t('rename.title')}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('rename.cancel')}
          </Button>
          <Button size="sm" onClick={save}>
            {t('rename.save')}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {t('rename.hint')}
      </p>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
        }}
        placeholder={t('rename.placeholder')}
      />
    </Modal>
  )
}
