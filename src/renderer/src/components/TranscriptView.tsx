import { useEffect, useState } from 'react'
import { Loader2, Terminal as TerminalIcon, User, Wrench } from 'lucide-react'
import type { TranscriptMessage } from '@shared/types'
import { Badge } from './ui/badge'
import { cn } from '@/lib/utils'

export function TranscriptView({ filePath }: { filePath: string }): JSX.Element {
  const [messages, setMessages] = useState<TranscriptMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setMessages(null)
    setError(null)
    window.api
      .transcript(filePath)
      .then((m) => active && setMessages(m))
      .catch((e) => active && setError(String(e)))
    return () => {
      active = false
    }
  }, [filePath])

  if (error) return <div className="p-6 text-sm text-destructive">Lecture impossible : {error}</div>
  if (!messages) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lecture de la conversation…
      </div>
    )
  }
  if (messages.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">Aucun message lisible dans cette session.</div>
  }

  return (
    <div className="space-y-3 p-4">
      {messages.map((m, i) => (
        <div
          key={i}
          className={cn(
            'rounded-md border p-3 text-sm',
            m.role === 'user' ? 'border-brass/30 bg-brass/5' : 'border-border bg-card'
          )}
        >
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {m.role === 'user' ? (
              <User className="h-3.5 w-3.5 text-brass" />
            ) : (
              <TerminalIcon className="h-3.5 w-3.5 text-patina" />
            )}
            <span className="font-medium uppercase tracking-wide">
              {m.role === 'user' ? 'Vous' : 'Claude'}
            </span>
          </div>
          {m.text && <div className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</div>}
          {m.tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.tools.map((t, j) => (
                <Badge key={j} variant="accent">
                  <Wrench className="h-3 w-3" /> {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
