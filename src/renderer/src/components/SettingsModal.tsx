import { RefreshCw, Trash2, ChevronDown } from 'lucide-react'
import type { AppInfo, DisplayFont, FontScale, Palette, Settings } from '@shared/types'
import { Modal } from './ui/modal'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const PALETTES: { id: Palette; label: string; from: string; to: string }[] = [
  { id: 'amber', label: 'Steampunk', from: '#ffcf4d', to: '#ff9d00' },
  { id: 'pipboy', label: 'Pip-Boy', from: '#5cff9d', to: '#13c957' },
  { id: 'rose', label: 'Synthwave', from: '#f58ac0', to: '#c05cff' }
]

const FONTS: { id: DisplayFont; label: string; sample: string }[] = [
  { id: 'oxanium', label: 'Oxanium — sci-fi UI', sample: 'Oxanium' },
  { id: 'orbitron', label: 'Orbitron — galactique', sample: 'Orbitron' },
  { id: 'chakra', label: 'Chakra Petch — HUD', sample: '"Chakra Petch"' },
  { id: 'pressstart', label: 'Press Start 2P — arcade', sample: '"Press Start 2P"' },
  { id: 'vt323', label: 'VT323 — terminal', sample: 'VT323' }
]

const SCALES: { id: FontScale; label: string }[] = [
  { id: 'sm', label: 'Petite' },
  { id: 'md', label: 'Normale' },
  { id: 'lg', label: 'Grande' }
]

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  appInfo: AppInfo | null
  scanning: boolean
  onChange: (patch: Partial<Settings>) => void
  onRescan: () => void
  onOpenTrash: () => void
}

export function SettingsModal({
  open,
  onClose,
  settings,
  appInfo,
  scanning,
  onChange,
  onRescan,
  onOpenTrash
}: Props): JSX.Element {
  const ptyOk = appInfo?.pty.available ?? false
  return (
    <Modal open={open} onClose={onClose} title="Paramètres" className="max-w-xl">
      <div className="space-y-5 text-sm">
        <section className="space-y-3">
          <h3 className="font-display text-brass">Apparence</h3>

          <div>
            <div className="hud-label mb-1.5">mode</div>
            <div className="flex gap-2">
              {(['system', 'dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onChange({ theme: t })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 transition-colors',
                    settings.theme === t ? 'border-primary bg-primary/15 text-foreground' : 'border-border hover:bg-muted'
                  )}
                >
                  {t === 'system' ? 'Système' : t === 'dark' ? 'Sombre' : 'Clair'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="hud-label mb-1.5">palette</div>
            <div className="flex gap-2">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onChange({ palette: p.id })}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                    settings.palette === p.id ? 'border-primary bg-primary/15 text-foreground' : 'border-border hover:bg-muted'
                  )}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-black/30"
                    style={{ backgroundImage: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  />
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="hud-label mb-1.5">police</div>
            <div className="relative">
              <select
                value={settings.displayFont}
                onChange={(e) => onChange({ displayFont: e.target.value as DisplayFont })}
                className="h-9 w-full appearance-none rounded-md border border-input bg-input/60 pl-3 pr-8 text-sm text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div
              className="mt-2 rounded-md border border-border bg-background/40 px-3 py-2 text-lg text-primary"
              style={{ fontFamily: `${FONTS.find((f) => f.id === settings.displayFont)?.sample}, monospace` }}
            >
              COGPIT — Session Deck 0123
            </div>
          </div>

          <div>
            <div className="hud-label mb-1.5">taille de l'interface</div>
            <div className="flex gap-2">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onChange({ fontScale: s.id })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 transition-colors',
                    settings.fontScale === s.id ? 'border-primary bg-primary/15 text-foreground' : 'border-border hover:bg-muted'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-1">
          <h3 className="mb-2 font-display text-brass">Affichage</h3>
          <Toggle label="Grouper par projet" value={settings.groupByProject} onChange={(v) => onChange({ groupByProject: v })} />
          <Toggle label="Afficher les sous-agents" value={settings.showAgents} onChange={(v) => onChange({ showAgents: v })} />
          <Toggle label="Afficher les sessions masquées" value={settings.showHidden} onChange={(v) => onChange({ showHidden: v })} />
          <Toggle
            label="Confirmer les suppressions définitives"
            value={settings.confirmPermanentDelete}
            onChange={(v) => onChange({ confirmPermanentDelete: v })}
          />
        </section>

        <section>
          <h3 className="mb-2 font-display text-brass">Terminal</h3>
          <div className="flex gap-2">
            <button
              onClick={() => ptyOk && onChange({ terminalMode: 'integrated' })}
              disabled={!ptyOk}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 transition-colors',
                settings.terminalMode === 'integrated' && ptyOk
                  ? 'border-brass bg-brass/15 text-foreground'
                  : 'border-border hover:bg-muted',
                !ptyOk && 'cursor-not-allowed opacity-50'
              )}
            >
              Intégré
            </button>
            <button
              onClick={() => onChange({ terminalMode: 'external' })}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 transition-colors',
                settings.terminalMode === 'external'
                  ? 'border-brass bg-brass/15 text-foreground'
                  : 'border-border hover:bg-muted'
              )}
            >
              Externe
            </button>
          </div>
          {!ptyOk && (
            <p className="mt-2 text-xs text-muted-foreground">
              Terminal intégré indisponible (module natif <code>node-pty</code> non compilé). Installe les
              build tools puis lance <code className="text-brass">npm run rebuild</code> pour l'activer.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-display text-brass">Actions</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={onRescan}>
              <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin text-primary')} />
              Rafraîchir les sessions
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={onOpenTrash}>
              <Trash2 className="h-3.5 w-3.5" /> Corbeille
            </Button>
          </div>
        </section>

        {appInfo && (
          <section className="space-y-1 rounded-md border bg-background/40 p-3 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <span>Adapter</span>
              <span className="font-mono text-foreground">{appInfo.adapterLabel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Dossier Claude</span>
              <span className="truncate font-mono">{appInfo.claudeRoot}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Version</span>
              <span className="font-mono">{appInfo.version}</span>
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1.5 hover:bg-muted/50">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          value ? 'border-primary/60 bg-primary' : 'border-border bg-muted'
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.55)] transition-transform',
            value ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
  )
}
