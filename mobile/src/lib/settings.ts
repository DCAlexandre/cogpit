/** Mobile appearance settings (palette / scale / language), persisted in
 *  localStorage and applied as data-* attributes on <html> — the same approach as
 *  the desktop. Kept independent of i18n to avoid an import cycle. */

export type Palette = 'amber' | 'pipboy' | 'rose'
export type Scale = 'sm' | 'md' | 'lg'
export type Language = 'auto' | 'fr' | 'en'

export interface MobileSettings {
  palette: Palette
  scale: Scale
  language: Language
}

const KEY = 'cogpit.settings.v1'
const DEFAULTS: MobileSettings = { palette: 'amber', scale: 'md', language: 'auto' }

const PALETTES: Palette[] = ['amber', 'pipboy', 'rose']
const SCALES: Scale[] = ['sm', 'md', 'lg']
const LANGS: Language[] = ['auto', 'fr', 'en']

export function loadSettings(): MobileSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const s = JSON.parse(raw) ?? {}
    return {
      palette: PALETTES.includes(s.palette) ? s.palette : DEFAULTS.palette,
      scale: SCALES.includes(s.scale) ? s.scale : DEFAULTS.scale,
      language: LANGS.includes(s.language) ? s.language : DEFAULTS.language
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: MobileSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable */
  }
}

/** Apply palette + scale to <html> (language needs a reload, handled by the UI). */
export function applyAppearance(s: MobileSettings): void {
  const el = document.documentElement
  el.dataset.palette = s.palette
  el.dataset.scale = s.scale
}

export function savedLanguage(): Language {
  return loadSettings().language
}
