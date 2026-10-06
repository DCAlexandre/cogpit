import { X, Radio } from 'lucide-react'
import type { OpenTerminal } from './TerminalDock'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface Props {
  terminals: OpenTerminal[]
  activeKey: string | null
  onActivate: (key: string) => void
  onClose: (key: string) => void
}

/** Quick access to running sessions, pinned at the top of the list. */
export function LiveStrip({ terminals, activeKey, onActivate, onClose }: Props): JSX.Element {
  const t = useT()
  return (
    <div className="sticky top-0 z-20 border-b border-live/25 bg-background/95 px-4 py-2 backdrop-blur">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Radio className="h-3 w-3 text-live" />
        <span className="hud-label text-live">{t('live.running')}</span>
        <span className="font-mono text-[10px] text-muted-foreground/70">[{terminals.length}]</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terminals.map((term) => {
          const on = term.key === activeKey
          return (
            <div
              key={term.key}
              onClick={() => onActivate(term.key)}
              className={cn(
                'group flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors',
                on
                  ? 'border-live/60 bg-live/15 text-live shadow-[0_0_12px_-3px_hsl(var(--live)/0.6)]'
                  : 'border-border bg-card text-foreground hover:border-live/40 hover:text-live'
              )}
              title={term.title}
            >
              <span className="led led-live animate-led-pulse" />
              <span className="max-w-[200px] truncate">{term.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(term.key)
                }}
                className="rounded-sm p-0.5 opacity-50 transition-opacity hover:bg-destructive/20 hover:text-destructive hover:opacity-100"
                title={t('live.close')}
                aria-label={t('live.close')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
