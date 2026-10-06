import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { registerIpc } from './ipc'
import { claudeCodeAdapter } from './adapters/claudeCode'
import { startWatcher, stopWatcher } from './lib/watcher'
import { killAllPty, ptyStatus } from './lib/pty'
import { initLogger, logger } from './lib/logger'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

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
    if (!quitting && tray) {
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

function createTray(): void {
  try {
    tray = new Tray(appIcon().resize({ width: 16, height: 16 }))
    tray.setToolTip('Cogpit — Claude Code sessions')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Cogpit', click: showWindow },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', showWindow)
    tray.on('double-click', showWindow)
  } catch {
    tray = null
  }
}

function notifySessionsChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug('watcher', 'sessions changed → notify renderer')
    mainWindow.webContents.send('sessions:changed')
  }
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
    createTray()
    startWatcher(claudeCodeAdapter.rootDir(), notifySessionsChanged)
    logger.info('watcher', 'started', { root: claudeCodeAdapter.rootDir() })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })

  app.on('before-quit', () => {
    quitting = true
    stopWatcher()
    killAllPty()
  })

  // With a tray we deliberately keep running after all windows close.
  app.on('window-all-closed', () => {
    if (!tray && process.platform !== 'darwin') app.quit()
  })
}
