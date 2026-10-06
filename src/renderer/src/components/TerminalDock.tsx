import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronUp, TerminalSquare } from 'lucide-react'
import type { TerminalTarget } from '@shared/types'
import { TerminalView } from './TerminalView'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export interface OpenTerminal {
  key: string
  target: TerminalTarget
  title: string
  sessionId?: string
}

interface Props {
  terminals: OpenTerminal[]
  activeKey: string | null
  collapsed: boolean
  onActivate: (key: string) => void
  onClose: (key: string) => void
  onToggleCollapse: () => void
}

const STRIP_H = 34
// Room the rest of the window needs: top bar + stats bar + this strip + a little
// content. The dock pane is capped to the window minus this, so it can never push
// its own bottom (and the prompt) or the stats bar off-screen.
const CHROME = 170

export function TerminalDock({
  terminals,
  activeKey,
  collapsed,
  onActivate,
  onClose,
  onToggleCollapse
}: Props): JSX.Element {
  const t = useT()
  const [height, setHeight] = useState(340)
  const [maxPane, setMaxPane] = useState(() => Math.max(160, window.innerHeight - CHROME))
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    const onResize = (): void => setMaxPane(Math.max(160, window.innerHeight - CHROME))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const paneH = Math.min(height, maxPane)

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    setResizing(true)
    const startY = e.clientY
    const startH = paneH
    const onMove = (ev: MouseEvent): void => {
      setHeight(Math.min(maxPane, Math.max(160, startH + (startY - ev.clientY))))
    }
    const onUp = (): void => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <section
      className="relative flex shrink-0 flex-col border-t border-primary/25 bg-card"
      style={{ height: collapsed ? STRIP_H : paneH + STRIP_H }}
    >
      {!collapsed && (
        <div
          onMouseDown={startResize}
          className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
          title={t('dock.resize')}
          aria-hidden
        />
      )}

      {/* Tab strip */}
      <div className="flex h-[34px] shrink-0 items-center gap-1 border-b border-border bg-background/60 px-2">
        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="hud-label mr-1 shrink-0">{t('dock.label')}</span>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {terminals.map((term) => {
            const on = term.key === activeKey
            return (
              <div
                key={term.key}
                onClick={() => onActivate(term.key)}
                className={cn(
                  'group flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border px-2 font-mono text-[11px] transition-colors',
                  on
                    ? 'border-live/50 bg-live/10 text-live'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                title={term.title}
              >
                <span className={cn('led led-live', on && 'animate-led-pulse')} />
                <span className="max-w-[160px] truncate">{term.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(term.key)
                  }}
                  className="rounded-sm p-0.5 opacity-50 transition-opacity hover:bg-destructive/20 hover:text-destructive hover:opacity-100"
                  title={t('dock.closeSession')}
                  aria-label={t('dock.closeSession')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
        <Button
          size="icon"
          variant="ghost"
          data-testid="dock-collapse"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
          onClick={onToggleCollapse}
          title={collapsed ? t('dock.show') : t('dock.collapse')}
          aria-label={collapsed ? t('dock.showAria') : t('dock.collapseAria')}
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Stacked terminals — ALWAYS mounted (so ptys keep running in the
          background), only the active one shown. Collapsing just hides the pane;
          it must never unmount a TerminalView or its pty would be killed. */}
      <div className={cn('relative min-h-0 flex-1', collapsed && 'hidden')}>
        {terminals.map((term) => (
          <div key={term.key} className={cn('absolute inset-0', term.key !== activeKey && 'hidden')}>
            <TerminalView
              target={term.target}
              integrated
              active={!collapsed && term.key === activeKey}
              resizing={resizing}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
