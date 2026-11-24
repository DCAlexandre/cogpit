/**
 * Cogpit mobile — end-to-end encrypted channel (isomorphic: Node + browser).
 * MIRROR of src/shared/mobile/crypto.ts — keep byte-identical so the handshake
 * interoperates. See that file for the design notes.
 */

import { x25519 } from '@noble/curves/ed25519'
import { chacha20poly1305 } from '@noble/ciphers/chacha'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { randomBytes, hexToBytes, bytesToHex, concatBytes } from '@noble/hashes/utils'

const INFO = new TextEncoder().encode('cogpit-noise-1')

export const KEY_LEN = 32

export interface KeyPair {
  priv: Uint8Array
  pub: Uint8Array
}

export function generateKeyPair(): KeyPair {
  const priv = x25519.utils.randomPrivateKey()
  const pub = x25519.getPublicKey(priv)
  return { priv, pub }
}

export function newPsk(): Uint8Array {
  return randomBytes(32)
}

export const toHex = bytesToHex
export const fromHex = hexToBytes

function deriveKeys(
  ePub: Uint8Array,
  fPub: Uint8Array,
  dhEs: Uint8Array,
  dhEe: Uint8Array,
  psk: Uint8Array
): { c2s: Uint8Array; s2c: Uint8Array } {
  const ikm = concatBytes(dhEs, dhEe, psk)
  const salt = concatBytes(ePub, fPub)
  const out = hkdf(sha256, ikm, salt, INFO, 64)
  return { c2s: out.slice(0, 32), s2c: out.slice(32, 64) }
}

/** An established, directional AEAD channel. */
export class SecureChannel {
  private kSend: Uint8Array
  private kRecv: Uint8Array
  private nSend = 0
  private nRecv = 0

  constructor(kSend: Uint8Array, kRecv: Uint8Array) {
    this.kSend = kSend
    this.kRecv = kRecv
  }

  private nonce(counter: number): Uint8Array {
    const n = new Uint8Array(12)
    new DataView(n.buffer).setBigUint64(4, BigInt(counter))
    return n
  }

  seal(msg: unknown): Uint8Array {
    const pt = new TextEncoder().encode(JSON.stringify(msg))
    return chacha20poly1305(this.kSend, this.nonce(this.nSend++)).encrypt(pt)
  }

  open<T = unknown>(ct: Uint8Array): T {
    const pt = chacha20poly1305(this.kRecv, this.nonce(this.nRecv++)).decrypt(ct)
    return JSON.parse(new TextDecoder().decode(pt)) as T
  }
}

export interface InitiatorStart {
  ePriv: Uint8Array
  ePub: Uint8Array
}

export function initiatorStart(): InitiatorStart {
  const { priv, pub } = generateKeyPair()
  return { ePriv: priv, ePub: pub }
}

export function initiatorFinish(
  start: InitiatorStart,
  fPub: Uint8Array,
  serverPub: Uint8Array,
  psk: Uint8Array
): SecureChannel {
  const dhEs = x25519.getSharedSecret(start.ePriv, serverPub)
  const dhEe = x25519.getSharedSecret(start.ePriv, fPub)
  const { c2s, s2c } = deriveKeys(start.ePub, fPub, dhEs, dhEe, psk)
  return new SecureChannel(c2s, s2c)
}

export interface ResponderResult {
  fPub: Uint8Array
  channel: SecureChannel
}

export function responder(staticPriv: Uint8Array, ePub: Uint8Array, psk: Uint8Array): ResponderResult {
  const { priv: fPriv, pub: fPub } = generateKeyPair()
  const dhEs = x25519.getSharedSecret(staticPriv, ePub)
  const dhEe = x25519.getSharedSecret(fPriv, ePub)
  const { c2s, s2c } = deriveKeys(ePub, fPub, dhEs, dhEe, psk)
  return { fPub, channel: new SecureChannel(s2c, c2s) }
}
