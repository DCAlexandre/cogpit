import { createContext, useContext } from 'react'
import app from './dict/app'
import nav from './dict/nav'
import list from './dict/list'
import settings from './dict/settings'
import panel from './dict/panel'
import modals from './dict/modals'
import terminal from './dict/terminal'

export type Locale = 'fr' | 'en'
/** User setting: an explicit language, or follow the device. */
export type LanguageSetting = 'auto' | 'fr' | 'en'

/** One namespace's messages for both languages. Keys are shared across locales. */
export interface Fragment {
  fr: Record<string, string>
  en: Record<string, string>
}

const FRAGMENTS: Fragment[] = [app, nav, list, settings, panel, modals, terminal]
const DICT: Record<Locale, Record<string, string>> = {
  fr: Object.assign({}, ...FRAGMENTS.map((f) => f.fr)),
  en: Object.assign({}, ...FRAGMENTS.map((f) => f.en))
}

/** The device/OS language, mapped to a supported locale (anything non-fr → en). */
export function deviceLocale(): Locale {
  return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function resolveLocale(setting: LanguageSetting): Locale {
  return setting === 'auto' ? deviceLocale() : setting
}

/** Look up a key; falls back to English, then to the key itself. `{name}`
 *  placeholders are replaced from `params`. */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let s = DICT[locale][key] ?? DICT.en[key] ?? key
  if (params) for (const k of Object.keys(params)) s = s.split(`{${k}}`).join(String(params[k]))
  return s
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string

export const LocaleContext = createContext<Locale>('en')

/** Translation hook — call inside any component under <LocaleContext.Provider>. */
export function useT(): TFunc {
  const locale = useContext(LocaleContext)
  return (key, params) => translate(locale, key, params)
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}
