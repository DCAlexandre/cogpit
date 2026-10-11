import { app, Tray, Menu, nativeImage, type NativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getSettings } from './meta'

let tray: Tray | null = null
let handlers: { onOpen: () => void; onQuit: () => void } = { onOpen: () => {}, onQuit: () => {} }

// Tray strings live here (the main process has no renderer i18n). Keep in sync with the
// renderer dicts in spirit; only the handful of labels the tray needs.
const LABELS = {
  en: { open: 'Open Cogpit', quit: 'Quit', tip: 'Cogpit — Claude Code sessions' },
  fr: { open: 'Ouvrir Cogpit', quit: 'Quitter', tip: 'Cogpit — sessions Claude Code' }
} as const

function menuIcon(name: string): NativeImage | undefined {
  const p = join(__dirname, '../../resources', name)
  if (!existsSync(p)) return undefined
  const img = nativeImage.createFromPath(p)
  return img.isEmpty() ? undefined : img.resize({ width: 16, height: 16 })
}

const iconOpen = menuIcon('tray-open.png')
const iconQuit = menuIcon('tray-quit.png')

// Resolve the UI language the same way the renderer does: explicit setting, else the OS
// locale (that's what `auto` means).
async function locale(): Promise<'fr' | 'en'> {
  const lang = (await getSettings()).language
  if (lang === 'fr' || lang === 'en') return lang
  return app.getLocale().toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

/** Rebuild the tray tooltip + context menu in the current language. Safe to call anytime. */
export async function refreshTrayMenu(): Promise<void> {
  if (!tray) return
  const t = LABELS[await locale()]
  tray.setToolTip(t.tip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.open, icon: iconOpen, click: () => handlers.onOpen() },
      { type: 'separator' },
      { label: t.quit, icon: iconQuit, click: () => handlers.onQuit() }
    ])
  )
}

/** True once a tray exists (drives minimise-to-tray and keep-alive behaviour). */
export function hasTray(): boolean {
  return tray !== null
}

export async function createTray(
  trayIcon: NativeImage,
  h: { onOpen: () => void; onQuit: () => void }
): Promise<void> {
  handlers = h
  try {
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
    tray.on('click', () => handlers.onOpen())
    tray.on('double-click', () => handlers.onOpen())
    await refreshTrayMenu()
  } catch {
    tray = null
  }
}
