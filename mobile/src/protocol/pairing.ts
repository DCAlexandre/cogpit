/** MIRROR of src/shared/mobile/pairing.ts — keep in sync. */
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
