/**
 * Pairing payload carried in the URL fragment of the QR code:
 *   http://<host>:<port>/#c1.<serverPubHex>.<pskHex>
 * The fragment is never sent to the server (or to any relay), so the pinned key
 * and the shared secret stay on the two devices only.
 *
 * Isomorphic — keep in sync with apps/mobile/src/protocol/pairing.ts
 */
import { toHex, fromHex } from './crypto'

const PREFIX = 'c1'

export interface Pairing {
  pub: Uint8Array
  psk: Uint8Array
}

export function buildPairingFragment(pub: Uint8Array, psk: Uint8Array): string {
  return `${PREFIX}.${toHex(pub)}.${toHex(psk)}`
}

export function parsePairingFragment(fragment: string): Pairing | null {
  const parts = fragment.replace(/^#/, '').split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) return null
  try {
    return { pub: fromHex(parts[1]), psk: fromHex(parts[2]) }
  } catch {
    return null
  }
}
