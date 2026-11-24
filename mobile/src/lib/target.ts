/** A connection target = where to dial (wsUrl) + what to pin (pairing). Built
 *  from a pairing URL — either the page URL (when the bridge serves the app) or
 *  a scanned QR (native). */
import { parsePairingFragment, type Pairing } from '../protocol/pairing'

export interface Target {
  wsUrl: string
  pairing: Pairing
}

export function targetFromUrl(href: string): Target | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  const pairing = parsePairingFragment(u.hash)
  if (!pairing) return null
  const wsProto = u.protocol === 'https:' ? 'wss' : 'ws'
  return { wsUrl: `${wsProto}://${u.host}/ws`, pairing }
}
