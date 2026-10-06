import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
  footer?: ReactNode
  /** Drop the default body padding (for full-bleed content like a terminal). */
  noBodyPadding?: boolean
}

export function Modal({ open, onClose, title, children, className, footer, noBodyPadding }: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'panel relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden animate-fade-in',
          className
        )}
      >
        {title && (
          <div className="rivets flex items-center justify-between border-b bg-secondary/40 px-5 py-3">
            <h2 className="font-display text-base text-foreground">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className={cn('flex-1 overflow-y-auto', !noBodyPadding && 'px-5 py-4')}>{children}</div>
        {footer && <div className="border-t bg-secondary/30 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
