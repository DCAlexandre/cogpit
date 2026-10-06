import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '@shared/types'
import { Modal } from './ui/modal'
import { Input } from './ui/input'
import { Button } from './ui/button'

interface Props {
  session: SessionSummary | null
  onClose: () => void
  onSave: (s: SessionSummary, title: string) => void
}

export function RenameModal({ session, onClose, onSave }: Props): JSX.Element {
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
      title="Renommer la session"
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button size="sm" onClick={save}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Un titre vide rétablit le titre d'origine. Le fichier de session n'est pas modifié.
      </p>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
        }}
        placeholder="Titre de la session"
      />
    </Modal>
  )
}
