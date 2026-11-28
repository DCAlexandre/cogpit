import { app, shell, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { registerIpc } from './ipc'
import { claudeCodeAdapter } from './adapters/claudeCode'
import { startWatcher, stopWatcher } from './lib/watcher'
import { killAllPty, ptyStatus } from './lib/pty'
import { initLogger, logger } from './lib/logger'
import { createTray, hasTray } from './lib/tray'
import { getSettings } from './lib/meta'
import { enableMobile, disableMobile, mobileBroadcast } from './mobile'
import { setControlNotifier } from './mobile/control'
import { setLiveDockNotifier } from './mobile/dockState'

let mainWindow: BrowserWindow | null = null
let quitting = false
let exitArmed = false
let lastHangReloadAt = 0

const iconPath = join(__dirname, '../../resources/icon.png')

// 1x1 transparent PNG — last-resort so Tray never throws on a missing icon.
const FALLBACK_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

function appIcon(): Electron.NativeImage {
  if (existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) return img
  }
  return nativeImage.createFromDataURL(FALLBACK_ICON)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#1b1813',
    icon: existsSync(iconPath) ? iconPath : undefined,
    title: 'Cogpit',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Tell the renderer when the frameless window maximises, so it can swap the
  // maximise/restore icon on the custom title bar.
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))

  // Surface renderer-side failures in the main log (handy for diagnostics).
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) =>
    logger.error('renderer', 'did-fail-load', { code, desc })
  )
  mainWindow.webContents.on('render-process-gone', (_e, details) =>
    logger.error('renderer', 'render-process-gone', { reason: details.reason })
  )
  // The renderer can go UNRESPONSIVE (hung main thread) without crashing — e.g.
  // after waking from sleep, when the terminal restore re-mounts xterm against a
  // lost GPU/canvas context. There's no crash event for that, so it used to leave
  // the app frozen with nothing in the log. Record it and recover by reloading
  // (which tears down the stuck JS context), throttled so it can never thrash.
  mainWindow.on('unresponsive', () => {
    logger.error('renderer', 'unresponsive (hung main thread)')
    const now = Date.now()
    if (now - lastHangReloadAt > 30000) {
      lastHangReloadAt = now
      logger.warn('renderer', 'reloading the hung renderer')
      try {
        mainWindow?.webContents.reload()
      } catch {
        /* window gone */
      }
    }
  })
  mainWindow.on('responsive', () => logger.info('renderer', 'responsive again'))
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) logger.warn('renderer-console', message, { line, sourceId })
    })
  }

  // Keep external links out of the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Minimise-to-tray: closing hides the window unless we're really quitting.
  mainWindow.on('close', (e) => {
    if (!quitting && hasTray()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Dev-only design screenshot harness: COGPIT_SHOT=<path-base> captures the
  // main screen and an opened panel, then quits. Never active in normal use.
  if (process.env.COGPIT_SHOT) {
    logger.info('shot', 'harness armed', { base: process.env.COGPIT_SHOT })
    mainWindow.webContents.once('did-finish-load', () => {
      logger.info('shot', 'did-finish-load → runShots')
      void runShots(mainWindow!, process.env.COGPIT_SHOT!)
    })
  }
}

async function runShots(win: BrowserWindow, base: string): Promise<void> {
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const cap = async (file: string): Promise<void> => {
    try {
      const img = await Promise.race([
        win.webContents.capturePage(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('capturePage timeout')), 5000))
      ])
      await writeFile(file, img.toPNG())
      logger.info('shot', 'wrote', { file })
    } catch (e) {
      logger.error('shot', 'cap failed', { file, err: String(e) })
    }
  }
  logger.info('shot', 'runShots start', { base })
  try {
    win.show()
    win.focusOnWebView()
    await wait(4000)
    await cap(`${base}-main.png`)
    await win.webContents.executeJavaScript(
      "(() => { const r = document.querySelector('[data-testid=session-row]'); if (r) r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 440, clientY: 240 })); })()"
    )
    await wait(500)
    await cap(`${base}-menu.png`)
    await win.webContents.executeJavaScript(
      "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); const b = document.querySelector('[data-testid=open-settings]'); if (b) b.click(); })()"
    )
    await wait(700)
    await cap(`${base}-settings.png`)
  } catch (err) {
    logger.error('shot', 'capture failed', String(err))
  }
  quitting = true
  app.quit()
}

function showWindow(): void {
  if (!mainWindow) createWindow()
  else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function notifySessionsChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug('watcher', 'sessions changed → notify renderer')
    mainWindow.webContents.send('sessions:changed')
  }
  // Also nudge any connected phones to refresh their list.
  mobileBroadcast({ t: 'sessions-changed' })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  process.on('uncaughtException', (err) => logger.error('process', 'uncaughtException', err.stack ?? String(err)))
  process.on('unhandledRejection', (reason) => logger.error('process', 'unhandledRejection', String(reason)))

  app.whenReady().then(() => {
    initLogger()
    logger.info('app', 'ready', { pty: ptyStatus(), claudeRoot: claudeCodeAdapter.rootDir() })
    registerIpc()
    createWindow()
    // Push session control handoffs (phone takes over / desktop reclaims) to the
    // renderer so it can pause or reload the matching dock tab.
    setControlNotifier((e) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mobile:control', e)
    })
    // Broadcast dock changes to connected phones so they can list "running on PC"
    // sessions first for quick takeover.
    setLiveDockNotifier((ids) => mobileBroadcast({ t: 'live', sessionIds: ids }))
    void createTray(appIcon(), {
      onOpen: showWindow,
      onQuit: () => {
        quitting = true
        app.quit()
      }
    })
    startWatcher(claudeCodeAdapter.rootDir(), notifySessionsChanged)
    logger.info('watcher', 'started', { root: claudeCodeAdapter.rootDir() })

    // Auto-start the mobile bridge if the user left it enabled.
    void getSettings().then((s) => {
      if (s.mobileAccess) {
        enableMobile(s.mobilePort).catch((e) => logger.error('mobile', 'autostart failed', String(e)))
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })

  app.on('before-quit', (e) => {
    quitting = true
    if (exitArmed) return
    exitArmed = true
    // Make "Quit" always actually terminate cogpit.exe. On Windows the node-pty
    // (ConPTY) worker thread — and, when enabled, the mobile LAN server's sockets
    // — keep the process alive after the window closes, so a plain quit leaves it
    // running in the background.
    //
    // The catch: the moment a normal quit begins, Electron STOPS servicing the
    // libuv loop, so a force-exit timer armed here never fires (verified: the old
    // "force exit" log line never appeared). So instead we CANCEL this quit with
    // preventDefault() — which keeps the loop running normally — hide the windows
    // so it still feels instant, run cleanup, then terminate the process ourselves
    // with a hard process.exit() (ExitProcess tears down every thread, ConPTY
    // worker included). The short delay lets the async cleanup / pending writes go.
    e.preventDefault()
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.hide()
      } catch {
        /* already destroyed */
      }
    }
    stopWatcher()
    killAllPty()
    void disableMobile()
    setTimeout(() => {
      logger.warn('app', 'force exit on quit')
      process.exit(0)
    }, 300)
  })

  // With a tray we deliberately keep running after all windows close.
  app.on('window-all-closed', () => {
    if (!hasTray() && process.platform !== 'darwin') app.quit()
  })
}
