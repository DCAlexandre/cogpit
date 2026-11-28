import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { connect, type Connection, type ConnState } from './lib/connection'
import { targetFromUrl, type Target } from './lib/target'
import { isNative, scanQr } from './lib/qr'
import type { Attachment, ScanPayload } from './protocol/messages'
import type { SessionSummary, TranscriptMessage } from './protocol/types'
import { t, relTime } from './lib/i18n'
import { Markdown } from './lib/markdown'
import {
  listDevices,
  lastDevice,
  deviceToTarget,
  upsertDevice,
  removeDevice,
  type SavedDevice
} from './lib/devices'
import {
  loadSettings,
  saveSettings,
  applyAppearance,
  type MobileSettings,
  type Palette,
  type Scale,
  type Language
} from './lib/settings'

interface PermReq {
  id: string
  tool: string
  input: unknown
}

/** A project and its (visible, sorted) conversations. */
interface Group {
  key: string
  name: string
  path: string | null
  sessions: SessionSummary[]
  lastActivity: string | null
}

// Belt-and-suspenders: hide the "[tool result]" placeholder lines even if the
// desktop bridge is an older build that still sends them.
const TOOL_RESULT_RE = /^\s*\[(tool result|résultat outil)\]\s*$/i
function cleanText(text: string): string {
  return text
    .split('\n')
    .filter((l) => !TOOL_RESULT_RE.test(l))
    .join('\n')
}

// Keep attachments LAN-friendly; the bridge enforces the same cap defensively.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/** Read a picked File as base64 (strips the `data:<mime>;base64,` prefix). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('read-failed'))
    r.onload = () => {
      const res = String(r.result ?? '')
      const comma = res.indexOf(',')
      resolve(comma >= 0 ? res.slice(comma + 1) : res)
    }
    r.readAsDataURL(file)
  })
}

function hostOf(wsUrl: string): string {
  try {
    return new URL(wsUrl).host
  } catch {
    return wsUrl
  }
}

/** Show the tail of a long absolute path (…/parent/leaf) so it fits on one line. */
function shortPath(p: string | null): string {
  if (!p) return ''
  const parts = p.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return p
  return '…/' + parts.slice(-2).join('/')
}

function compareRecent(a: SessionSummary, b: SessionSummary): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
}

function hiddenProjectKeys(scan: ScanPayload): Set<string> {
  return new Set(scan.projects.filter((p) => p.hidden).map((p) => p.key))
}

/** Every conversation we surface on mobile: real sessions (no agents / hidden),
 *  most recent first. */
function visibleSessions(scan: ScanPayload): SessionSummary[] {
  const hidden = hiddenProjectKeys(scan)
  return scan.sessions
    .filter((s) => !s.isAgent && !s.hidden && !hidden.has(s.projectKey))
    .sort(compareRecent)
}

/** Group conversations by project (like the desktop tree, flattened). Pinned
 *  conversations float to the top of each project, then most-recent-first. */
function buildGroups(scan: ScanPayload): Group[] {
  const hidden = hiddenProjectKeys(scan)
  const projById = new Map(scan.projects.map((p) => [p.key, p]))
  const byKey = new Map<string, Group>()
  for (const s of scan.sessions) {
    if (s.isAgent || s.hidden || hidden.has(s.projectKey)) continue
    let g = byKey.get(s.projectKey)
    if (!g) {
      const p = projById.get(s.projectKey)
      g = {
        key: s.projectKey,
        name: p?.name ?? s.projectName,
        path: p?.cwd ?? s.cwd ?? null,
        sessions: [],
        lastActivity: p?.lastActivity ?? null
      }
      byKey.set(s.projectKey, g)
    }
    g.sessions.push(s)
  }
  for (const g of byKey.values()) {
    g.sessions.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return compareRecent(a, b)
    })
    if (!g.lastActivity) g.lastActivity = g.sessions[0]?.updatedAt ?? null
  }
  return [...byKey.values()].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
}

export function App(): JSX.Element {
  const [target, setTarget] = useState<Target | null>(() => {
    const fromUrl = targetFromUrl(location.href)
    if (fromUrl) return fromUrl
    const last = lastDevice()
    return last ? deviceToTarget(last) : null
  })
  const [devices, setDevices] = useState<SavedDevice[]>(() => listDevices())
  const [deviceName, setDeviceName] = useState<string | undefined>(() => lastDevice()?.name)
  const [settings, setSettings] = useState<MobileSettings>(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [state, setState] = useState<ConnState>('connecting')
  const [info, setInfo] = useState<string | undefined>()
  const [scan, setScan] = useState<ScanPayload | null>(null)
  const [interactive, setInteractive] = useState(false)
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<SessionSummary | null>(null)
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState<PermReq | null>(null)
  // Who drives the open session: 'mobile' = us (PC paused), 'desktop' = the PC
  // reclaimed it (our next message takes control back), null = unknown/not contended.
  const [control, setControl] = useState<'mobile' | 'desktop' | null>(null)
  // Session ids currently open in the desktop dock (pushed by the bridge).
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())
  const [attempt, setAttempt] = useState(0)

  const connRef = useRef<Connection | null>(null)
  const selectedRef = useRef<SessionSummary | null>(null)
  selectedRef.current = selected
  // Texts we optimistically showed as our own bubble, to dedupe the tail echo.
  const pendingUserRef = useRef<string[]>([])

  const refreshDevices = (): void => setDevices(listDevices())

  const changeSettings = (patch: Partial<MobileSettings>): void => {
    setSettings((cur) => {
      const next = { ...cur, ...patch }
      saveSettings(next)
      applyAppearance(next)
      // The locale is resolved once at module load, so a language change needs a
      // reload to take effect (the link auto-reconnects to the saved device).
      if (patch.language && patch.language !== cur.language) setTimeout(() => location.reload(), 150)
      return next
    })
  }

  useEffect(() => {
    if (!target) return
    const conn = connect(target.wsUrl, target.pairing)
    connRef.current = conn
    conn.onState((s, i) => {
      setState(s)
      setInfo(i)
    })
    conn.onMessage((msg) => {
      switch (msg.t) {
        case 'hello':
          setInteractive(msg.interactive)
          if (msg.host) setDeviceName(msg.host)
          // Remember this desktop so the phone reconnects on the next launch.
          try {
            upsertDevice(target, msg.host)
            setDevices(listDevices())
          } catch {
            /* storage unavailable — stay functional for this session */
          }
          conn.send({ t: 'scan' })
          break
        case 'scan':
          setScan(msg.data)
          break
        case 'sessions-changed':
          conn.send({ t: 'scan' })
          break
        case 'transcript':
          if (msg.file === selectedRef.current?.filePath) setMessages(msg.messages)
          break
        case 'append':
          if (msg.file === selectedRef.current?.filePath) {
            const mm = msg.message
            if (mm.role === 'user') {
              const idx = pendingUserRef.current.indexOf(mm.text.trim())
              if (idx >= 0) {
                // our own message, already shown optimistically
                pendingUserRef.current.splice(idx, 1)
                break
              }
            }
            setMessages((prev) => [...prev, mm])
          }
          break
        case 'busy':
          setBusy(msg.busy)
          break
        case 'control':
          if (msg.file === selectedRef.current?.filePath) setControl(msg.controlledBy)
          break
        case 'live':
          setLiveIds(new Set(msg.sessionIds))
          break
        case 'permission':
          setPerm({ id: msg.id, tool: msg.tool, input: msg.input })
          break
        case 'event':
          if (msg.event.kind === 'error' && msg.event.text) {
            // surface interaction errors inline as a system bubble
            setMessages((m) => [...m, { role: 'system', text: `⚠ ${msg.event.text}`, timestamp: null, tools: [] }])
          }
          break
      }
    })
    return () => conn.close()
  }, [target, attempt])

  const openSession = (s: SessionSummary): void => {
    setSelected(s)
    setMessages([])
    setBusy(false)
    setPerm(null)
    setControl(null)
    pendingUserRef.current = []
    connRef.current?.send({ t: 'subscribe', file: s.filePath })
  }
  const closeChat = (): void => {
    connRef.current?.send({ t: 'unsubscribe' })
    setSelected(null)
    setMessages([])
    setControl(null)
    pendingUserRef.current = []
  }
  const sendText = (text: string, attachments?: Attachment[]): void => {
    const s = selectedRef.current
    if (!s) return
    if (attachments && attachments.length > 0) {
      // No optimistic bubble: the composed user turn (caption + file paths) comes
      // back on the live tail.
      connRef.current?.send({ t: 'send', file: s.filePath, sessionId: s.id, cwd: s.cwd, text, attachments })
      return
    }
    pendingUserRef.current.push(text.trim())
    setMessages((m) => [...m, { role: 'user', text, timestamp: null, tools: [] }])
    connRef.current?.send({ t: 'send', file: s.filePath, sessionId: s.id, cwd: s.cwd, text })
  }
  const answerPerm = (allow: boolean): void => {
    if (perm) connRef.current?.send({ t: 'permission', id: perm.id, allow })
    setPerm(null)
  }
  const reconnect = (): void => {
    setState('connecting')
    setInfo(undefined)
    setScan(null)
    setAttempt((a) => a + 1)
  }

  // Connect to a brand-new target (fresh scan / manual URL). Saved on `hello`.
  const connectTarget = (tgt: Target, name?: string): void => {
    setDeviceName(name)
    setScan(null)
    setSelected(null)
    setSelectedProjectKey(null)
    setState('connecting')
    setInfo(undefined)
    setAttempt(0)
    setTarget(tgt)
  }
  const connectDevice = (d: SavedDevice): void => connectTarget(deviceToTarget(d), d.name)
  // Drop the live link and return to the device picker — WITHOUT forgetting it.
  const disconnect = (): void => {
    connRef.current?.close()
    setTarget(null)
    setScan(null)
    setSelected(null)
    setSelectedProjectKey(null)
    setState('connecting')
    setInfo(undefined)
    refreshDevices()
  }
  const forgetDevice = (id: string): void => {
    removeDevice(id)
    refreshDevices()
  }

  // One "navigate(-1)" step. Returns false at the root so the OS can leave the app.
  const goBack = (): boolean => {
    if (perm) {
      setPerm(null)
      return true
    }
    if (selected) {
      closeChat()
      return true
    }
    if (selectedProjectKey) {
      setSelectedProjectKey(null)
      return true
    }
    if (target) {
      disconnect()
      return true
    }
    return false
  }
  const goBackRef = useRef(goBack)
  goBackRef.current = goBack

  // Android hardware back button → in-app navigate(-1); minimize at the root.
  useEffect(() => {
    if (!isNative()) return
    let cleanup = (): void => {}
    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app')
        const handle = await CapApp.addListener('backButton', () => {
          if (!goBackRef.current()) void CapApp.minimizeApp()
        })
        cleanup = (): void => void handle.remove()
      } catch {
        /* @capacitor/app absent (web build) — browser handles back */
      }
    })()
    return () => cleanup()
  }, [])

  // Auto-reconnect with backoff when the link drops (phone sleep, PC off…), but
  // NOT on a bad pairing key (handshake/decrypt) — that would loop forever.
  useEffect(() => {
    const retryable = state === 'closed' || (state === 'error' && info === 'socket')
    if (!target || !retryable) return
    const delay = Math.min(15000, 2000 * Math.pow(1.6, Math.min(attempt, 6)))
    const id = window.setTimeout(() => reconnect(), delay)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, info, target, attempt])

  // Native status bar polish (Android: dark, non-overlapping, amber-black).
  useEffect(() => {
    if (!isNative()) return
    void (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        await StatusBar.setOverlaysWebView({ overlay: false })
        await StatusBar.setStyle({ style: Style.Dark })
        await StatusBar.setBackgroundColor({ color: '#17130d' })
      } catch {
        /* iOS lacks setBackgroundColor, etc. — ignore */
      }
    })()
  }, [])

  if (!target) {
    return (
      <div className="flex h-full flex-col">
        <Header online={false} onSettings={() => setShowSettings(true)} />
        <DeviceManager devices={devices} onConnect={connectDevice} onForget={forgetDevice} onTarget={connectTarget} />
        <SettingsSheet open={showSettings} settings={settings} onChange={changeSettings} onClose={() => setShowSettings(false)} />
      </div>
    )
  }

  const groups = scan ? buildGroups(scan) : []
  const group = selectedProjectKey ? groups.find((g) => g.key === selectedProjectKey) ?? null : null

  const title = selected
    ? selected.displayTitle || selected.title || selected.id
    : group
      ? group.name
      : deviceName || t('app.title')

  return (
    <div className="flex h-full flex-col">
      <Header online={state === 'ready'} title={title} onBack={goBack} onSettings={() => setShowSettings(true)} />
      <SettingsSheet open={showSettings} settings={settings} onChange={changeSettings} onClose={() => setShowSettings(false)} />
      {!scan ? (
        <StateBanner state={state} info={info} onRetry={reconnect} onUnpair={disconnect} />
      ) : selected ? (
        <Chat
          session={selected}
          messages={messages}
          interactive={interactive}
          busy={busy}
          perm={perm}
          control={control}
          onSend={sendText}
          onPerm={answerPerm}
        />
      ) : group ? (
        <SessionList group={group} onOpen={openSession} liveIds={liveIds} />
      ) : (
        <Home scan={scan} onOpenSession={openSession} onOpenProject={setSelectedProjectKey} liveIds={liveIds} />
      )}
    </div>
  )
}

function Header({
  online,
  title,
  onBack,
  onSettings
}: {
  online: boolean
  title?: string
  onBack?: () => void
  onSettings?: () => void
}): JSX.Element {
  return (
    <header
      className="flex items-center gap-2 border-b px-3 py-3"
      style={{ borderColor: 'hsl(var(--border) / 0.5)', background: 'hsl(var(--panel))', paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      {onBack && (
        <button onClick={onBack} aria-label={t('nav.back')} className="-ml-1 shrink-0 rounded px-1.5 text-2xl leading-none active:opacity-60" style={{ color: 'hsl(var(--primary))' }}>
          ‹
        </button>
      )}
      <span className={`led shrink-0 ${online ? 'led-live' : ''}`} />
      <b className="phosphor min-w-0 truncate tracking-widest" style={{ color: 'hsl(var(--primary))' }}>
        {title ?? t('app.title')}
      </b>
      {onSettings && (
        <button
          onClick={onSettings}
          aria-label={t('settings.title')}
          title={t('settings.title')}
          className="ml-auto shrink-0 rounded p-1 active:opacity-60"
          style={{ color: 'hsl(var(--muted))' }}
        >
          <GearIcon />
        </button>
      )}
    </header>
  )
}

function StateBanner({
  state,
  info,
  onRetry,
  onUnpair
}: {
  state: ConnState
  info?: string
  onRetry: () => void
  onUnpair: () => void
}): JSX.Element {
  const isError = state === 'error' || state === 'closed'
  const label =
    state === 'error'
      ? t(`state.error.${info ?? 'socket'}`)
      : state === 'closed'
        ? t('state.closed')
        : state === 'ready'
          ? t('state.loading')
          : state === 'handshaking'
            ? t('state.handshaking')
            : t('state.connecting')
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      {!isError && <div className="spinner" />}
      <div style={{ color: isError ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>{label}</div>
      {isError && (
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(34 45% 8%)' }}
          >
            {t('state.reconnect')}
          </button>
          <button
            onClick={onUnpair}
            className="rounded-md border px-4 py-2 text-sm"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
          >
            {t('state.repair')}
          </button>
        </div>
      )}
    </div>
  )
}

function DeviceManager({
  devices,
  onConnect,
  onForget,
  onTarget
}: {
  devices: SavedDevice[]
  onConnect: (d: SavedDevice) => void
  onForget: (id: string) => void
  onTarget: (tgt: Target) => void
}): JSX.Element {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const [scanning, setScanning] = useState(false)

  const submit = (value: string): void => {
    const tgt = targetFromUrl(value.trim())
    if (tgt) onTarget(tgt)
    else setErr(t('pairing.invalid'))
  }
  const doScan = async (): Promise<void> => {
    setErr('')
    setScanning(true)
    try {
      const raw = await scanQr()
      if (raw) submit(raw)
      else setErr(t('pairing.scanfail'))
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      setErr(
        m === 'camera-denied'
          ? t('pairing.camdenied')
          : m === 'module-installing'
            ? t('pairing.installing')
            : t('pairing.scanfail')
      )
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {devices.length > 0 && (
        <>
          <SectionLabel>{t('devices.title')}</SectionLabel>
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 border-b px-4 py-3"
              style={{ borderColor: 'hsl(var(--border) / 0.3)' }}
            >
              <button onClick={() => onConnect(d)} className="min-w-0 flex-1 text-left active:opacity-70">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="mt-0.5 truncate text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
                  {hostOf(d.wsUrl)} · {relTime(new Date(d.lastUsedAt).toISOString())}
                </div>
              </button>
              <button
                onClick={() => onConnect(d)}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(34 45% 8%)' }}
              >
                {t('devices.connect')}
              </button>
              <button
                onClick={() => {
                  if (window.confirm(t('devices.removeConfirm'))) onForget(d.id)
                }}
                aria-label={t('devices.remove')}
                title={t('devices.remove')}
                className="shrink-0 rounded-md border px-2.5 py-1.5 text-sm leading-none"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
              >
                ✕
              </button>
            </div>
          ))}
        </>
      )}

      <div className="flex flex-col items-center gap-5 p-8 text-center">
        <b className="phosphor text-lg tracking-widest" style={{ color: 'hsl(var(--primary))' }}>
          {devices.length > 0 ? t('devices.add') : 'COGPIT'}
        </b>
        {devices.length === 0 && <div className="text-base">{t('pairing.needed')}</div>}
        <p className="max-w-xs text-sm" style={{ color: 'hsl(var(--muted))' }}>
          {t('pairing.hint')}
        </p>
        {isNative() && (
          <button
            onClick={() => void doScan()}
            disabled={scanning}
            className="rounded-md px-6 py-3 text-sm font-medium"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(34 45% 8%)', opacity: scanning ? 0.6 : 1 }}
          >
            {scanning ? t('pairing.scanning') : t('pairing.scan')}
          </button>
        )}
        <div className="flex w-full max-w-xs flex-col gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.x.x:8790/#c1..."
            className="rounded-md border bg-transparent px-3 py-2 text-xs"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg))' }}
          />
          <button
            onClick={() => submit(url)}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: 'hsl(var(--primary) / 0.5)', color: 'hsl(var(--primary))' }}
          >
            OK
          </button>
        </div>
        {err && (
          <div className="text-xs" style={{ color: 'hsl(var(--primary))' }}>
            {err}
          </div>
        )}
      </div>
    </div>
  )
}

function Home({
  scan,
  onOpenSession,
  onOpenProject,
  liveIds
}: {
  scan: ScanPayload
  onOpenSession: (s: SessionSummary) => void
  onOpenProject: (key: string) => void
  liveIds: Set<string>
}): JSX.Element {
  const groups = buildGroups(scan)
  const nameByKey = new Map(groups.map((g) => [g.key, g.name]))
  const all = visibleSessions(scan)
  const live = all.filter((s) => liveIds.has(s.id))
  const recents = all.slice(0, 10)

  return (
    <div className="flex-1 overflow-y-auto">
      {live.length > 0 && (
        <>
          <SectionLabel>{t('live.title')}</SectionLabel>
          {live.map((s) => (
            <SessionRow key={s.id} s={s} live projectLabel={nameByKey.get(s.projectKey) ?? s.projectName} onOpen={onOpenSession} />
          ))}
        </>
      )}
      {recents.length > 0 && (
        <>
          <SectionLabel>{t('recent.title')}</SectionLabel>
          {recents.map((s) => (
            <SessionRow key={s.id} s={s} live={liveIds.has(s.id)} projectLabel={nameByKey.get(s.projectKey) ?? s.projectName} onOpen={onOpenSession} />
          ))}
        </>
      )}

      <SectionLabel>{t('projects.title')}</SectionLabel>
      {groups.length === 0 && <Empty>{t('projects.empty')}</Empty>}
      {groups.map((g) => (
        <ProjectRow key={g.key} g={g} onOpen={() => onOpenProject(g.key)} />
      ))}
    </div>
  )
}

function ProjectRow({ g, onOpen }: { g: Group; onOpen: () => void }): JSX.Element {
  const n = g.sessions.length
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b px-4 py-3 text-left active:opacity-70"
      style={{ borderColor: 'hsl(var(--border) / 0.3)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold" style={{ color: 'hsl(var(--primary) / 0.95)' }}>
          {g.name}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
          {n} {n === 1 ? t('projects.convo') : t('projects.convos')} · {relTime(g.lastActivity)}
        </div>
        {g.path && (
          <div className="mt-0.5 truncate text-[10px]" style={{ color: 'hsl(var(--muted) / 0.7)' }}>
            {shortPath(g.path)}
          </div>
        )}
      </div>
      <span className="shrink-0 text-lg" style={{ color: 'hsl(var(--muted))' }}>
        ›
      </span>
    </button>
  )
}

function SessionList({
  group,
  onOpen,
  liveIds
}: {
  group: Group
  onOpen: (s: SessionSummary) => void
  liveIds: Set<string>
}): JSX.Element {
  const n = group.sessions.length
  return (
    <div className="flex-1 overflow-y-auto">
      <SectionLabel>
        {n} {n === 1 ? t('projects.convo') : t('projects.convos')}
      </SectionLabel>
      {n === 0 && <Empty>{t('list.empty')}</Empty>}
      {group.sessions.map((s) => (
        <SessionRow key={s.id} s={s} live={liveIds.has(s.id)} onOpen={onOpen} />
      ))}
    </div>
  )
}

function SessionRow({
  s,
  projectLabel,
  live,
  onOpen
}: {
  s: SessionSummary
  projectLabel?: string
  live?: boolean
  onOpen: (s: SessionSummary) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onOpen(s)}
      className="flex w-full items-start gap-3 border-b px-4 py-3 text-left active:opacity-70"
      style={{ borderColor: 'hsl(var(--border) / 0.3)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {live && <span className="led led-live shrink-0" />}
          {s.pinned && <PinIcon />}
          {s.favorite && <StarIcon />}
          <div className="truncate text-sm font-medium">{s.displayTitle || s.title || s.id}</div>
        </div>
        <div className="mt-0.5 truncate text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
          {projectLabel ? (
            <span style={{ color: 'hsl(var(--primary) / 0.85)' }}>{projectLabel}</span>
          ) : (
            <>
              {s.messageCount} {t('list.msgs')}
              {s.gitBranch ? ` · ${s.gitBranch}` : ''}
            </>
          )}
          {' · '}
          {relTime(s.updatedAt)}
        </div>
      </div>
    </button>
  )
}

function PinIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      style={{ color: 'hsl(var(--primary))' }}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}

function PaperclipIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function StarIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
      style={{ color: 'hsl(var(--primary))' }}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21.02 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  )
}

function GearIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function OptionGroup({
  label,
  value,
  options,
  onPick
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onPick: (v: string) => void
}): JSX.Element {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs uppercase tracking-widest" style={{ color: 'hsl(var(--muted))' }}>
        {label}
      </div>
      <div className="flex gap-2">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              onClick={() => onPick(o.value)}
              className="flex-1 rounded-md border px-3 py-2 text-sm active:opacity-70"
              style={
                on
                  ? { borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }
                  : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg))' }
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SettingsSheet({
  open,
  settings,
  onChange,
  onClose
}: {
  open: boolean
  settings: MobileSettings
  onChange: (patch: Partial<MobileSettings>) => void
  onClose: () => void
}): JSX.Element | null {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'hsl(0 0% 0% / 0.55)' }}
      onClick={onClose}
    >
      <div
        className="rounded-t-2xl border-t p-4"
        style={{ background: 'hsl(var(--panel))', borderColor: 'hsl(var(--border))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <b className="phosphor tracking-widest" style={{ color: 'hsl(var(--primary))' }}>
            {t('settings.title')}
          </b>
          <button onClick={onClose} className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
            {t('settings.close')}
          </button>
        </div>

        <OptionGroup
          label={t('settings.palette')}
          value={settings.palette}
          options={[
            { value: 'amber', label: t('palette.amber') },
            { value: 'pipboy', label: t('palette.pipboy') },
            { value: 'rose', label: t('palette.rose') }
          ]}
          onPick={(v) => onChange({ palette: v as Palette })}
        />
        <OptionGroup
          label={t('settings.scale')}
          value={settings.scale}
          options={[
            { value: 'sm', label: t('scale.sm') },
            { value: 'md', label: t('scale.md') },
            { value: 'lg', label: t('scale.lg') }
          ]}
          onPick={(v) => onChange({ scale: v as Scale })}
        />
        <OptionGroup
          label={t('settings.language')}
          value={settings.language}
          options={[
            { value: 'auto', label: t('lang.auto') },
            { value: 'fr', label: t('lang.fr') },
            { value: 'en', label: t('lang.en') }
          ]}
          onPick={(v) => onChange({ language: v as Language })}
        />
        <div className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
          {t('settings.langHint')}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="px-4 pb-1 pt-3 text-xs uppercase tracking-widest" style={{ color: 'hsl(var(--muted))' }}>
      {children}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="p-8 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
      {children}
    </div>
  )
}

function Chat({
  session,
  messages,
  interactive,
  busy,
  perm,
  control,
  onSend,
  onPerm
}: {
  session: SessionSummary
  messages: TranscriptMessage[]
  interactive: boolean
  busy: boolean
  perm: PermReq | null
  control: 'mobile' | 'desktop' | null
  onSend: (text: string, attachments?: Attachment[]) => void
  onPerm: (allow: boolean) => void
}): JSX.Element {
  void session
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachErr, setAttachErr] = useState('')
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy, perm])

  // Clear the "sending" hint as soon as the PC starts responding or a turn lands.
  useEffect(() => {
    setSending(false)
  }, [busy, messages.length])
  useEffect(() => {
    if (!sending) return
    const id = window.setTimeout(() => setSending(false), 12000)
    return () => window.clearTimeout(id)
  }, [sending])

  const pickFiles = (): void => {
    setAttachErr('')
    fileRef.current?.click()
  }
  const onFiles = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // let the same file be re-picked later
    const added: Attachment[] = []
    for (const f of files) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setAttachErr(t('attach.toobig'))
        continue
      }
      try {
        added.push({ name: f.name, mime: f.type || 'application/octet-stream', dataB64: await readAsBase64(f) })
      } catch {
        setAttachErr(t('attach.readfail'))
      }
    }
    if (added.length) setAttachments((cur) => [...cur, ...added])
  }
  const removeAttachment = (i: number): void => setAttachments((cur) => cur.filter((_, j) => j !== i))

  const submit = (): void => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    if (attachments.length > 0) {
      onSend(text, attachments)
      setSending(true)
    } else {
      onSend(text)
    }
    setDraft('')
    setAttachments([])
    setAttachErr('')
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages
          .map((m) => ({ ...m, text: cleanText(m.text) }))
          .filter((m) => m.text.trim() !== '' || m.tools.length > 0)
          .map((m, i) => (
            <Bubble key={i} m={m} />
          ))}
        {busy && (
          <div className="bubble bubble-assistant text-sm" style={{ color: 'hsl(var(--muted))' }}>
            {t('chat.thinking')}
          </div>
        )}
        {perm && (
          <div className="self-start rounded-xl border p-3 text-sm" style={{ borderColor: 'hsl(var(--primary) / 0.5)', background: 'hsl(var(--panel))' }}>
            <div className="mb-2">
              {t('perm.title')} <span className="chip">⚙ {perm.tool}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onPerm(true)} className="flex-1 rounded-md px-3 py-1.5 font-medium" style={{ background: 'hsl(var(--primary))', color: 'hsl(34 45% 8%)' }}>
                {t('perm.allow')}
              </button>
              <button onClick={() => onPerm(false)} className="flex-1 rounded-md border px-3 py-1.5" style={{ borderColor: 'hsl(var(--border))' }}>
                {t('perm.deny')}
              </button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {control === 'desktop' && (
        <div
          className="border-t px-3 py-1.5 text-center text-[11px]"
          style={{ borderColor: 'hsl(var(--primary) / 0.4)', background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
        >
          {t('control.onPC')}
        </div>
      )}
      {control === 'mobile' && (
        <div
          className="border-t px-3 py-1 text-center text-[10px]"
          style={{ borderColor: 'hsl(var(--border) / 0.5)', color: 'hsl(var(--muted))' }}
        >
          {t('control.onMobile')}
        </div>
      )}

      {interactive ? (
        <div
          className="border-t"
          style={{ borderColor: 'hsl(var(--border) / 0.5)', background: 'hsl(var(--panel))', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2">
              {attachments.map((a, i) => (
                <span key={i} className="chip" style={{ gap: 5 }}>
                  <span>{a.mime.startsWith('image/') ? '🖼' : '📄'}</span>
                  <span className="max-w-[120px] truncate">{a.name}</span>
                  <button onClick={() => removeAttachment(i)} aria-label={t('attach.remove')} style={{ marginLeft: 2, opacity: 0.8 }}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          {(sending || attachErr) && (
            <div className="px-3 pt-1.5 text-[11px]" style={{ color: attachErr ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
              {attachErr || t('attach.sending')}
            </div>
          )}
          <div className="flex items-end gap-2 p-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void onFiles(e)} />
            <button
              onClick={pickFiles}
              aria-label={t('attach.add')}
              title={t('attach.add')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border active:opacity-60"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--primary))' }}
            >
              <PaperclipIcon />
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder={t('chat.placeholder')}
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg))' }}
            />
            <button onClick={submit} className="rounded-full px-4 py-2 text-sm font-medium" style={{ background: 'hsl(var(--primary))', color: 'hsl(34 45% 8%)' }}>
              {t('chat.send')}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t p-2 text-center text-[11px]" style={{ borderColor: 'hsl(var(--border) / 0.5)', color: 'hsl(var(--muted))' }}>
          {t('chat.readonly')}
        </div>
      )}
    </div>
  )
}

function Bubble({ m }: { m: TranscriptMessage }): JSX.Element {
  const isUser = m.role === 'user'
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'} text-sm`}>
        <div className="mb-1 text-[10px] uppercase tracking-widest" style={{ color: 'hsl(var(--muted))' }}>
          {isUser ? t('role.you') : t('role.claude')}
        </div>
        {m.text && (isUser ? <div className="whitespace-pre-wrap">{m.text}</div> : <Markdown text={m.text} />)}
        {m.tools.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.tools.map((tool, j) => (
              <span key={j} className="chip">
                ⚙ {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
