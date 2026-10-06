import { Plus, Settings, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { WindowControls } from './WindowControls'

export type SortKey = 'updated' | 'created' | 'title' | 'size' | 'messages'

interface Props {
  query: string
  onQuery: (q: string) => void
  sort: SortKey
  onSort: (s: SortKey) => void
  onNewSession: () => void
  onOpenSettings: () => void
}

export function TopBar(props: Props): JSX.Element {
  return (
    <header className="titlebar-drag flex h-12 items-center gap-3 border-b border-border bg-background/95 pl-4 backdrop-blur">
      {/* Brand / status */}
      <div className="flex shrink-0 items-center gap-2.5 pr-1">
        <span className="led led-active animate-led-pulse" />
        <span className="bg-gradient-to-r from-accent via-primary to-copper bg-clip-text font-display text-lg font-extrabold tracking-[0.26em] text-transparent drop-shadow-[0_0_10px_hsl(41_100%_53%/0.35)]">
          COGPIT
        </span>
      </div>
      <span className="hidden h-6 w-px shrink-0 bg-border lg:block" />
      <span className="hud-label hidden shrink-0 lg:inline">session deck</span>

      {/* Search — terminal prompt, grows to fill the width */}
      <label className="glow-hover group relative ml-1 flex h-9 flex-1 items-center rounded-md border border-input bg-input/60 focus-within:border-primary/60 focus-within:shadow-glow-sm">
        <span className="pointer-events-none pl-3 pr-1.5 font-mono text-sm text-primary">&gt;</span>
        <input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="rechercher — titre, projet, contenu…"
          className="h-full flex-1 bg-transparent pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          aria-label="Rechercher une session"
        />
      </label>

      {/* Sort */}
      <div className="relative">
        <select
          value={props.sort}
          onChange={(e) => props.onSort(e.target.value as SortKey)}
          aria-label="Trier les sessions"
          className="h-9 appearance-none rounded-md border border-input bg-input/60 pl-3 pr-8 font-mono text-[11px] uppercase tracking-wider text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="updated">récentes</option>
          <option value="created">création</option>
          <option value="title">titre a→z</option>
          <option value="size">taille</option>
          <option value="messages">messages</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>

      <Button size="sm" className="gap-1.5 uppercase tracking-wider" onClick={props.onNewSession}>
        <Plus className="h-4 w-4" /> Nouvelle
      </Button>
      <Button
        size="icon"
        variant="ghost"
        data-testid="open-settings"
        className="glow-hover h-9 w-9 text-muted-foreground hover:text-primary"
        title="Paramètres"
        aria-label="Paramètres"
        onClick={props.onOpenSettings}
      >
        <Settings className="h-4 w-4" />
      </Button>

      <WindowControls />
    </header>
  )
}
