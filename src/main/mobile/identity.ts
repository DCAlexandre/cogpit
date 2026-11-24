/** The PC's long-lived mobile identity: a static X25519 keypair + a pairing
 *  secret (PSK), persisted in userData. Rotating it invalidates every paired
 *  phone (they must re-scan the QR). */
import { app } from 'electron'
import { join } from 'path'
import { readJson, writeJson } from '../lib/jsonFile'
import { generateKeyPair, newPsk, toHex, fromHex } from '../../shared/mobile/crypto'

interface MobileIdentity {
  version: 1
  staticPriv: string
  staticPub: string
  psk: string
}

let cached: MobileIdentity | null = null

function identityPath(): string {
  return join(app.getPath('userData'), 'mobile.json')
}

export async function loadIdentity(): Promise<MobileIdentity> {
  if (cached) return cached
  const loaded = await readJson<Partial<MobileIdentity>>(identityPath(), {})
  if (loaded.staticPriv && loaded.staticPub && loaded.psk) {
    cached = { version: 1, staticPriv: loaded.staticPriv, staticPub: loaded.staticPub, psk: loaded.psk }
    return cached
  }
  const kp = generateKeyPair()
  cached = { version: 1, staticPriv: toHex(kp.priv), staticPub: toHex(kp.pub), psk: toHex(newPsk()) }
  await writeJson(identityPath(), cached)
  return cached
}

export async function rotateIdentity(): Promise<MobileIdentity> {
  const kp = generateKeyPair()
  cached = { version: 1, staticPriv: toHex(kp.priv), staticPub: toHex(kp.pub), psk: toHex(newPsk()) }
  await writeJson(identityPath(), cached)
  return cached
}

export function identityBytes(id: MobileIdentity): { priv: Uint8Array; pub: Uint8Array; psk: Uint8Array } {
  return { priv: fromHex(id.staticPriv), pub: fromHex(id.staticPub), psk: fromHex(id.psk) }
}
