import type { Locale } from './i18n'

// Current formatting locale, kept in module state so call sites don't have to
// thread it through. The LocaleProvider sets it whenever the language changes.
let locale: Locale = 'en'
let rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const BYTE_UNITS: Record<Locale, string[]> = {
  fr: ['o', 'Ko', 'Mo', 'Go'],
  en: ['B', 'KB', 'MB', 'GB']
}
const DATE_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' }

export function setFormatLocale(l: Locale): void {
  locale = l
  rtf = new Intl.RelativeTimeFormat(l, { numeric: 'auto' })
}

export function formatBytes(bytes: number): string {
  const units = BYTE_UNITS[locale]
  if (!bytes) return `0 ${units[0]}`
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffSec = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month')
  return rtf.format(Math.round(diffSec / 31536000), 'year')
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(DATE_LOCALE[locale], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
