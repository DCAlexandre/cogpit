import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface MenuItem {
  label?: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  separator?: boolean
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** A right-click menu positioned at the cursor, clamped to the viewport. */
export function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
        className="panel absolute min-w-[210px] animate-fade-in overflow-hidden py-1"
      >
        {items.map((it, i) =>
          it.separator ? (
            <div key={i} className="brass-divider my-1" />
          ) : (
            <button
              key={i}
              disabled={it.disabled}
              onClick={() => {
                it.onClick?.()
                onClose()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-mono text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40',
                it.danger
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-primary/10 hover:text-primary'
              )}
            >
              {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
              {it.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
