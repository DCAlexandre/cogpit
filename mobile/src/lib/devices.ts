/** Paired-device memory, persisted in localStorage so the phone remembers every
 *  desktop it has paired with (no more re-scanning the QR on each launch).
 *
 *  A "device" is keyed by the desktop's long-lived X25519 public key (`pub`),
 *  which is stable across PC restarts (see src/main/mobile/identity.ts). So
 *  re-scanning the same desktop after its LAN IP changes simply refreshes the
 *  stored address instead of creating a duplicate entry. */
import { toHex, fromHex } from '../protocol/crypto'
import type { Target } from './target'

const DEVICES_KEY = 'cogpit.devices.v1'
const LAST_KEY = 'cogpit.lastDevice.v1'

export interface SavedDevice {
  /** hex of the desktop static public key — the stable device identity */
  id: string
  /** human label: the PC host name (from the `hello` frame) or host:port */
  name: string
  wsUrl: string
  pub: string
  psk: string
  addedAt: number
  lastUsedAt: number
}

function read(): SavedDevice[] {
  try {
    const raw = localStorage.getItem(DEVICES_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (d): d is SavedDevice =>
        !!d &&
        typeof d.id === 'string' &&
        typeof d.wsUrl === 'string' &&
        typeof d.pub === 'string' &&
        typeof d.psk === 'string'
    )
  } catch {
    return []
  }
}

function write(list: SavedDevice[]): void {
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(list))
  } catch {
    /* storage full / disabled — stay functional for this session */
  }
}

function hostLabel(wsUrl: string): string {
  try {
    return new URL(wsUrl).host
  } catch {
    return wsUrl
  }
}

/** Saved devices, most-recently-used first. */
export function listDevices(): SavedDevice[] {
  return read().sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

export function targetId(target: Target): string {
  return toHex(target.pairing.pub)
}

export function deviceToTarget(d: SavedDevice): Target {
  return { wsUrl: d.wsUrl, pairing: { pub: fromHex(d.pub), psk: fromHex(d.psk) } }
}

/** Remember (or refresh) a device from a connected target. Marks it as the
 *  last-used device so the next launch auto-connects to it. */
export function upsertDevice(target: Target, name?: string): SavedDevice {
  const id = targetId(target)
  const now = Date.now()
  const list = read()
  const existing = list.find((d) => d.id === id)
  const device: SavedDevice = {
    id,
    name: name || existing?.name || hostLabel(target.wsUrl),
    wsUrl: target.wsUrl,
    pub: toHex(target.pairing.pub),
    psk: toHex(target.pairing.psk),
    addedAt: existing?.addedAt ?? now,
    lastUsedAt: now
  }
  write([device, ...list.filter((d) => d.id !== id)])
  setLastId(id)
  return device
}

export function removeDevice(id: string): void {
  write(read().filter((d) => d.id !== id))
  if (getLastId() === id) clearLastId()
}

export function setLastId(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id)
  } catch {
    /* ignore */
  }
}

export function getLastId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export function clearLastId(): void {
  try {
    localStorage.removeItem(LAST_KEY)
  } catch {
    /* ignore */
  }
}

/** The device to auto-connect to on launch, if any. */
export function lastDevice(): SavedDevice | null {
  const id = getLastId()
  const list = read()
  if (id) {
    const hit = list.find((d) => d.id === id)
    if (hit) return hit
  }
  // Fall back to the most-recently-used if the stored pointer is stale.
  return list.sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0] ?? null
}
