import type { Stats } from '@shared/types'
import { formatBytes, formatRelative } from '@/lib/format'

export function StatsBar({ stats }: { stats: Stats }): JSX.Element {
  return (
    <div className="flex items-center gap-5 border-t border-border bg-background/60 px-4 py-1.5">
      <Readout label="sessions" value={stats.totalSessions} />
      <Readout label="sous-agents" value={stats.totalAgents} />
      <Readout label="projets" value={stats.projectCount} />
      <Readout label="disque" value={formatBytes(stats.totalBytes)} />
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <span className="led led-active animate-led-pulse" />
        <span className="hud-label">dernière activité</span>
        <span className="font-mono text-[11px] text-foreground/80">{formatRelative(stats.lastActivity)}</span>
      </div>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-[13px] font-medium tabular-nums text-primary phosphor">{value}</span>
      <span className="hud-label">{label}</span>
    </span>
  )
}
