import { useEffect, useState } from 'react'

/** One-time "power-on" of the deck: a scanline wipe + the wordmark flickering in.
 *  Skipped entirely when the user prefers reduced motion. */
export function BootSequence(): JSX.Element | null {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(true)
      return
    }
    const t = setTimeout(() => setDone(true), 1150)
    return () => clearTimeout(t)
  }, [])

  if (done) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-background"
      style={{ animation: 'boot-fade 1.15s ease forwards' }}
    >
      <div
        className="absolute left-0 right-0 h-px bg-primary shadow-glow"
        style={{ animation: 'boot-wipe 0.7s ease-out forwards' }}
      />
      <div className="text-center">
        <div
          className="font-display text-5xl font-bold tracking-[0.3em] text-primary phosphor"
          style={{ animation: 'flicker 0.7s steps(1) 1' }}
        >
          COGPIT
        </div>
        <div className="mt-4 hud-label caret-blink">mise sous tension du poste</div>
      </div>
    </div>
  )
}
