import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { Copy, ExternalLink, Check, TerminalSquare } from 'lucide-react'
import type { TerminalTarget } from '@shared/types'
import { Button } from './ui/button'

interface Props {
  target: TerminalTarget
  integrated: boolean
  /** True while the dock is being drag-resized: freeze the terminal and re-fit
   *  once the drag ends, instead of thrashing Claude's TUI on every pixel. */
  resizing?: boolean
  /** When false the terminal is mounted but hidden (another tab is showing). */
  active?: boolean
}

const XTERM_THEME = {
  background: '#0a0a0a',
  foreground: '#ece3ce',
  cursor: '#ffb000',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#4a3a12',
  black: '#161310',
  red: '#ff5236',
  green: '#b6a85a',
  yellow: '#ffb000',
  blue: '#c9922f',
  magenta: '#e0a84a',
  cyan: '#ffca3a',
  white: '#ece3ce',
  brightBlack: '#6b5d49',
  brightYellow: '#ffca3a'
}

/** Integrated terminal (node-pty + xterm). Created ONCE per mount; stays alive
 *  (pty keeps running) while hidden so parallel sessions survive tab switches. */
function IntegratedTerminal({
  target,
  active,
  resizing
}: {
  target: TerminalTarget
  active: boolean
  resizing: boolean
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  const resizingRef = useRef(resizing)
  resizingRef.current = resizing

  // Size the terminal to the pane. With the canvas renderer there's no per-row
  // rounding to clip the last line, so we take the full fit that xterm proposes —
  // only scaling down if the pane somehow extends past the bottom of the window.
  const fitToVisible = useCallback((): void => {
    const host = hostRef.current
    const term = termRef.current
    const fit = fitRef.current
    if (!host || !term || !fit) return
    try {
      const dims = fit.proposeDimensions()
      if (!dims || !Number.isFinite(dims.rows) || dims.rows < 1 || !Number.isFinite(dims.cols) || dims.cols < 1) return
      let rows = dims.rows
      const rect = host.getBoundingClientRect()
      const usableH = Math.min(host.clientHeight, Math.max(0, window.innerHeight - rect.top))
      if (usableH < host.clientHeight) {
        rows = Math.max(2, Math.floor(dims.rows * (usableH / host.clientHeight)))
      }
      if (term.rows !== rows || term.cols !== dims.cols) term.resize(dims.cols, rows)
      if (ptyIdRef.current) void window.api.pty.resize(ptyIdRef.current, term.cols, term.rows)
      term.scrollToBottom()
    } catch {
      /* host not measured yet */
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    const activeTarget = targetRef.current
    window.api.log('debug', 'terminal', 'mount integrated pty', {
      kind: activeTarget.kind,
      id: activeTarget.session?.id,
      cwd: activeTarget.cwd ?? activeTarget.session?.cwd
    })

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: XTERM_THEME,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    // Canvas renderer (like VS Code, which uses WebGL/canvas): draws to a single
    // pixel-exact canvas instead of one rounded <div> per row, so the last line is
    // never clipped by accumulated sub-pixel rounding — whatever the pane height.
    try {
      term.loadAddon(new CanvasAddon())
    } catch {
      /* fall back to the DOM renderer if canvas can't initialise */
    }
    termRef.current = term
    fitRef.current = fit

    const offData = window.api.pty.onData(({ id, data }) => {
      if (id === ptyIdRef.current) term.write(data)
    })
    const offExit = window.api.pty.onExit(({ id, code }) => {
      if (id === ptyIdRef.current) {
        window.api.log('debug', 'terminal', 'pty exit', { id, code })
        term.writeln('\r\n\x1b[2m— session terminée —\x1b[0m')
      }
    })

    // Copy/paste — QuickEdit style: right-click copies the selection, or pastes
    // when there's none. Ctrl+Shift+C / Ctrl+Shift+V also work (Ctrl+C stays SIGINT).
    const copySelection = (): void => {
      const sel = term.getSelection()
      if (sel) {
        void window.api.clipboard.write(sel)
        term.clearSelection()
      }
    }
    const paste = async (): Promise<void> => {
      const text = await window.api.clipboard.read()
      if (text && ptyIdRef.current) void window.api.pty.write(ptyIdRef.current, text)
    }
    const onContext = (e: MouseEvent): void => {
      e.preventDefault()
      if (term.hasSelection()) copySelection()
      else void paste()
    }
    host.addEventListener('contextmenu', onContext)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true
      const k = e.key.toLowerCase()
      if (k === 'c') {
        copySelection()
        return false
      }
      if (k === 'v') {
        void paste()
        return false
      }
      return true
    })

    // Size BEFORE spawning the pty, so Claude's TUI starts at the right size —
    // otherwise the prompt can render below the visible area after a resume.
    requestAnimationFrame(() => {
      fitToVisible()
      window.api.pty.create(activeTarget, { cols: term.cols, rows: term.rows }).then((res) => {
        if (disposed) {
          if (res) void window.api.pty.kill(res.id)
          return
        }
        ptyIdRef.current = res?.id ?? null
        window.api.log('debug', 'terminal', 'pty created', { ptyId: ptyIdRef.current, cols: term.cols, rows: term.rows })
        if (!ptyIdRef.current) term.writeln('\x1b[31mTerminal intégré indisponible.\x1b[0m')
        else fitToVisible()
      })
    })

    // xterm often measures the cell BEFORE the webfont (JetBrains Mono) is ready,
    // which skews rows by ~a line. Re-fit once fonts load and once layout settles.
    void document.fonts.ready.then(() => {
      if (!disposed) fitToVisible()
    })
    const settleTimer = setTimeout(() => {
      if (!disposed) fitToVisible()
    }, 200)

    const onInput = term.onData((d) => {
      if (ptyIdRef.current) void window.api.pty.write(ptyIdRef.current, d)
    })

    // While dragging the dock the host resizes every pixel; coalesce to one fit
    // per frame, then do a final fit once the drag settles so Claude re-renders at
    // the exact final size (avoids the transient shift/truncation during resize).
    let roRaf = 0
    let roSettle: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      // Frozen while the dock is being drag-resized — the drag-end effect re-fits.
      if (resizingRef.current) return
      cancelAnimationFrame(roRaf)
      roRaf = requestAnimationFrame(() => {
        if (!disposed) fitToVisible()
      })
      clearTimeout(roSettle)
      roSettle = setTimeout(() => {
        if (!disposed) fitToVisible()
      }, 160)
    })
    ro.observe(host)

    return () => {
      disposed = true
      clearTimeout(settleTimer)
      cancelAnimationFrame(roRaf)
      clearTimeout(roSettle)
      ro.disconnect()
      host.removeEventListener('contextmenu', onContext)
      offData()
      offExit()
      onInput.dispose()
      if (ptyIdRef.current) {
        window.api.log('debug', 'terminal', 'unmount: kill pty', { ptyId: ptyIdRef.current })
        void window.api.pty.kill(ptyIdRef.current)
      }
      term.dispose()
    }
    // Create once per mount — see targetRef note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fit + focus when this terminal becomes the visible tab.
  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      fitToVisible()
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [active, fitToVisible])

  // Dock drag ended → re-fit once to the final pane size (frozen during the drag).
  useEffect(() => {
    if (resizing) return
    const raf = requestAnimationFrame(() => fitToVisible())
    return () => cancelAnimationFrame(raf)
  }, [resizing, fitToVisible])

  // No padding on the xterm host: padding on the mount element throws off xterm's
  // mouse/row hit-testing. Breathing room comes from the pane around it instead.
  return <div ref={hostRef} className="h-full w-full overflow-hidden bg-[#0a0a0a]" />
}

/** External-terminal fallback: show the command, copy it, or launch it. */
function ExternalTerminal({ target }: { target: TerminalTarget }): JSX.Element {
  const [command, setCommand] = useState('…')
  const [cwd, setCwd] = useState('')
  const [copied, setCopied] = useState(false)
  const [launch, setLaunch] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.terminalSpec(target).then((spec) => {
      if (!alive) return
      setCommand(spec.display)
      setCwd(spec.cwd)
    })
    return () => {
      alive = false
    }
  }, [target])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const open = async (): Promise<void> => {
    const res = await window.api.openExternal(target)
    setLaunch(res.ok ? `Terminal ouvert (${res.via}).` : "Aucun terminal n'a pu être lancé.")
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <TerminalSquare className="h-10 w-10 text-primary/70" />
      <div className="max-w-md text-sm text-muted-foreground">
        Le terminal intégré n'est pas disponible. Cogpit ouvrira ta console habituelle dans le bon dossier.
      </div>
      <div className="w-full max-w-xl space-y-2 text-left">
        <div className="hud-label">dossier</div>
        <div className="truncate rounded-md border border-border bg-input/60 px-3 py-2 font-mono text-xs">{cwd}</div>
        <div className="hud-label">commande</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-border bg-input/60 px-3 py-2 font-mono text-xs text-primary">
            {command}
          </code>
          <Button variant="outline" size="icon" onClick={copy} title="Copier la commande">
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <Button onClick={open} className="gap-2">
        <ExternalLink className="h-4 w-4" /> Ouvrir dans un terminal
      </Button>
      {launch && <div className="text-xs text-muted-foreground">{launch}</div>}
    </div>
  )
}

export function TerminalView({ target, integrated, active = true, resizing = false }: Props): JSX.Element {
  return integrated ? (
    <IntegratedTerminal target={target} active={active} resizing={resizing} />
  ) : (
    <ExternalTerminal target={target} />
  )
}
