/** Mobile bridge controller: start/stop the server, build the pairing QR, and
 *  expose status to the renderer. Pairing identity lives in userData. */
import { app } from 'electron'
import { hostname } from 'os'
import { join } from 'path'
import QRCode from 'qrcode'
import { startBridge, type BridgeHandle } from './server'
import { loadIdentity, identityBytes, rotateIdentity } from './identity'
import { lanAddresses } from './lan'
import { buildPairingFragment } from '../../shared/mobile/pairing'
import { createInteraction } from './interaction'
import type { ServerMsg } from '../../shared/mobile/messages'
import { logger } from '../lib/logger'

export interface MobileStatus {
  running: boolean
  port: number | null
  urls: string[]
  qrDataUrl: string | null
  clients: number
  interactive: boolean
}

const DEFAULT_PORT = 8790

let handle: BridgeHandle | null = null
let clientCount = 0
let lastUrls: string[] = []
let lastQr: string | null = null
let lastInteractive = false

function mobileDistDir(): string {
  // dev: app.getAppPath() === repo root; packaged: resources/app (dist shipped alongside)
  return join(app.getAppPath(), 'mobile', 'dist')
}

export async function enableMobile(port = DEFAULT_PORT): Promise<MobileStatus> {
  if (handle) return mobileStatus()
  const identity = identityBytes(await loadIdentity())
  const interaction = await createInteraction()
  lastInteractive = !!interaction
  handle = startBridge({
    port,
    staticDir: mobileDistDir(),
    identity,
    hostName: hostname(),
    onClientsChange: (n) => {
      clientCount = n
    },
    interaction: interaction ?? undefined
  })
  const fragment = buildPairingFragment(identity.pub, identity.psk)
  const ips = lanAddresses()
  lastUrls = (ips.length ? ips : ['localhost']).map((ip) => `http://${ip}:${port}/#${fragment}`)
  try {
    lastQr = await QRCode.toDataURL(lastUrls[0], { margin: 1, width: 320 })
  } catch {
    lastQr = null
  }
  logger.info('mobile', 'enabled', { port, urls: lastUrls.length, interactive: lastInteractive })
  return mobileStatus()
}

export async function disableMobile(): Promise<void> {
  if (!handle) return
  await handle.close()
  handle = null
  clientCount = 0
  logger.info('mobile', 'disabled')
}

export function mobileStatus(): MobileStatus {
  return {
    running: !!handle,
    port: handle?.port ?? null,
    urls: handle ? lastUrls : [],
    qrDataUrl: handle ? lastQr : null,
    clients: clientCount,
    interactive: lastInteractive
  }
}

/** Fan a message out to every connected phone (used for live sessions-changed). */
export function mobileBroadcast(msg: ServerMsg): void {
  handle?.broadcast(msg)
}

/** Forget the pairing identity and restart if running (phones must re-pair). */
export async function rotateMobileIdentity(): Promise<MobileStatus> {
  const wasRunning = !!handle
  const port = handle?.port ?? DEFAULT_PORT
  await disableMobile()
  await rotateIdentity()
  if (wasRunning) return enableMobile(port)
  return mobileStatus()
}
