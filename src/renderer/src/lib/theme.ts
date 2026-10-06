import type { Settings, ThemeMode } from '@shared/types'

/** Apply a light/dark theme to the document root. "system" follows the OS. */
export function applyTheme(mode: ThemeMode): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = mode === 'dark' || (mode === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
}

/** Apply the full appearance: theme + colour palette + display font + UI scale.
 *  Palette/font/scale are driven by data-* attributes consumed in index.css. */
export function applyAppearance(
  s: Pick<Settings, 'theme' | 'palette' | 'displayFont' | 'fontScale'>
): void {
  applyTheme(s.theme)
  const root = document.documentElement
  root.dataset.palette = s.palette
  root.dataset.font = s.displayFont
  root.dataset.scale = s.fontScale
}
