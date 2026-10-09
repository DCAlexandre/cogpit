import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Copy, ExternalLink, Check, TerminalSquare } from 'lucide-react'
import type { TerminalTarget } from '@shared/types'
import { Button } from './ui/button'
import { useT } from '@/lib/i18n'

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
  const t = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  const resizingRef = useRef(resizing)
  resizingRef.current = resizing
  const lastSizeRef = useRef({ cols: 0, rows: 0 })

  // Size the terminal to the VISIBLE pane. Two failure modes this has to beat:
  //  1) The DOM renderer rounds each row's height, and that error accumulates down the
  //     pane, so on a tall dock FitAddon's floor(height/cellHeight) still overfills and
  //     clips the bottom rows. We therefore MEASURE the rendered screen and shrink the
  //     row count until it genuinely fits — a guarantee, not an estimate.
  //  2) A maximised frameless window overflows the screen, so the host can extend below
  //     the visible area. We clamp the usable height to the window bottom so rows are
  //     never sized into off-screen space.
  // Cols come from FitAddon (it accounts for the scrollbar). On every real grid change we
  // push the size to the pty so the alt-screen child redraws via SIGWINCH.
  const fitToVisible = useCallback((): void => {
    const host = hostRef.current
    const term = termRef.current
    const fit = fitRef.current
    if (!host || !term || !fit || !host.clientWidth || !host.clientHeight) return
    let dims: { cols: number; rows: number } | undefined
    try {
      dims = fit.proposeDimensions()
    } catch {
      return
    }
    if (!dims || !Number.isFinite(dims.cols) || dims.cols < 1 || !Number.isFinite(dims.rows) || dims.rows < 1) return
    const cols = Math.max(2, dims.cols)
    const cellH =
      (term as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { height: number } } } } } })._core
        ?._renderService?.dimensions?.css?.cell?.height
    const rect = host.getBoundingClientRect()
    const usableH = Math.min(host.clientHeight, Math.max(0, window.innerHeight - rect.top))
    let rows = cellH && cellH > 0 ? Math.max(1, Math.floor(usableH / cellH)) : Math.max(1, dims.rows)
    if (term.cols !== cols || term.rows !== rows) term.resize(cols, rows)
    // Measurement guarantee: shrink until the rendered screen actually fits the pane.
    const screen = host.querySelector('.xterm-screen') as HTMLElement | null
    let guard = 0
    while (screen && rows > 1 && screen.offsetHeight > usableH && guard++ < 8) {
      rows -= 1
      term.resize(cols, rows)
    }
    const id = ptyIdRef.current
    if (id && (cols !== lastSizeRef.current.cols || rows !== lastSizeRef.current.rows)) {
      lastSizeRef.current = { cols, rows }
      void window.api.pty.resize(id, cols, rows)
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
      scrollback: 5000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    // DOM renderer (xterm's default — no GPU addon). It hit-tests selection against the
    // actually-rendered row elements, so the mouse→cell mapping is always correct. The
    // GPU renderers (canvas/WebGL) drew this app's panes with a vertical offset here
    // (black band on top + off-by-one selection + truncation); perf is irrelevant for a
    // session terminal, so correctness wins. Sizing is pure FitAddon.fit() (below).
    termRef.current = term
    fitRef.current = fit

    const offData = window.api.pty.onData(({ id, data }) => {
      if (id === ptyIdRef.current) term.write(data)
    })
    const offExit = window.api.pty.onExit(({ id, code }) => {
      if (id === ptyIdRef.current) {
        window.api.log('debug', 'terminal', 'pty exit', { id, code })
        term.writeln(t('terminal.ended'))
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
        lastSizeRef.current = { cols: term.cols, rows: term.rows } // pty born at this grid
        window.api.log('debug', 'terminal', 'pty created', { ptyId: ptyIdRef.current, cols: term.cols, rows: term.rows })
        if (!ptyIdRef.current) term.writeln(t('terminal.unavailable'))
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

    // Moving the window between monitors (or a DPI change) alters the cell size; re-fit
    // and repaint when the device-pixel ratio changes. xterm fires no event for this, so
    // watch a DPR-specific resolution query and re-arm it after each change.
    let dprMql: MediaQueryList | null = null
    const onDprChange = (): void => {
      if (disposed) return
      fitToVisible()
      const term2 = termRef.current
      if (term2) term2.refresh(0, Math.max(0, term2.rows - 1))
      armDpr()
    }
    function armDpr(): void {
      dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprMql.addEventListener('change', onDprChange, { once: true })
    }
    armDpr()

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
      dprMql?.removeEventListener('change', onDprChange)
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
  // `xterm-host` counter-zooms the UI-scale zoom (see index.css) so xterm renders at
  // an effective 1.0 — a CSS `zoom` on an ancestor otherwise desyncs xterm's mouse→cell
  // mapping (selection lands on the wrong row) and its fit math (clipped bottom).
  return <div ref={hostRef} className="xterm-host h-full w-full overflow-hidden bg-[#0a0a0a]" />
}

/** External-terminal fallback: show the command, copy it, or launch it. */
function ExternalTerminal({ target }: { target: TerminalTarget }): JSX.Element {
  const t = useT()
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
    setLaunch(res.ok ? t('terminal.opened', { via: res.via }) : t('terminal.openFailed'))
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <TerminalSquare className="h-10 w-10 text-primary/70" />
      <div className="max-w-md text-sm text-muted-foreground">{t('terminal.fallbackIntro')}</div>
      <div className="w-full max-w-xl space-y-2 text-left">
        <div className="hud-label">{t('terminal.folder')}</div>
        <div className="truncate rounded-md border border-border bg-input/60 px-3 py-2 font-mono text-xs">{cwd}</div>
        <div className="hud-label">{t('terminal.command')}</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-border bg-input/60 px-3 py-2 font-mono text-xs text-primary">
            {command}
          </code>
          <Button variant="outline" size="icon" onClick={copy} title={t('terminal.copyCommand')}>
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <Button onClick={open} className="gap-2">
        <ExternalLink className="h-4 w-4" /> {t('terminal.openInTerminal')}
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
