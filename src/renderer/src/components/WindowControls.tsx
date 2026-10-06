import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { useT } from '@/lib/i18n'

/** Custom window controls for the frameless window (minimise / maximise / close). */
export function WindowControls(): JSX.Element {
  const t = useT()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.win.isMaximized().then(setMaximized)
    return window.api.win.onMaximized(setMaximized)
  }, [])

  return (
    <div className="flex h-12 items-stretch">
      <button
        onClick={() => window.api.win.minimize()}
        title={t('window.minimize')}
        aria-label={t('window.minimize')}
        className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.api.win.maximizeToggle()}
        title={maximized ? t('window.restore') : t('window.maximize')}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
      >
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => window.api.win.close()}
        title={t('window.close')}
        aria-label={t('window.close')}
        className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
