/**
 * Cogpit mobile — end-to-end encrypted channel (isomorphic: Node + browser).
 *
 * A minimal, sound authenticated key exchange in the spirit of Noise_NKpsk:
 *   - the responder (PC) has a static X25519 keypair; its public key is pinned
 *     on the initiator (phone) out-of-band via the pairing QR  -> PC authenticated
 *   - a pre-shared key (the pairing secret) is mixed into the KDF               -> phone authenticated
 *   - an ephemeral-ephemeral DH gives forward secrecy
 * Transport AEAD = ChaCha20-Poly1305 with a per-direction 64-bit nonce counter.
 *
 * ⚠️ This is a POC-grade handshake (no rekey / replay window beyond the counter,
 *    not a full Noise state machine). The product should swap this for an
 *    audited Noise_IK implementation (e.g. @chainsafe/libp2p-noise). The wire
 *    format and the @noble primitives are what matter for the POC's criteria.
 *
 * IMPORTANT: keep this file byte-identical with apps/mobile/src/protocol/crypto.ts
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

  /** Encrypt a JSON-serialisable message to opaque ciphertext bytes. */
  seal(msg: unknown): Uint8Array {
    const pt = new TextEncoder().encode(JSON.stringify(msg))
    return chacha20poly1305(this.kSend, this.nonce(this.nSend++)).encrypt(pt)
  }

  /** Decrypt ciphertext bytes back to a JSON message (throws on tamper/bad key). */
  open<T = unknown>(ct: Uint8Array): T {
    const pt = chacha20poly1305(this.kRecv, this.nonce(this.nRecv++)).decrypt(ct)
    return JSON.parse(new TextDecoder().decode(pt)) as T
  }
}

// --- Initiator (phone) ---

export interface InitiatorStart {
  ePriv: Uint8Array
  /** First handshake frame to send (our ephemeral public key). */
  ePub: Uint8Array
}

export function initiatorStart(): InitiatorStart {
  const { priv, pub } = generateKeyPair()
  return { ePriv: priv, ePub: pub }
}

/** Given the responder's ephemeral public key (frame 2), derive the channel.
 *  `serverPub` and `psk` come from the pairing QR; a wrong value yields a
 *  channel whose `open()` will throw on the responder's first encrypted frame. */
export function initiatorFinish(
  start: InitiatorStart,
  fPub: Uint8Array,
  serverPub: Uint8Array,
  psk: Uint8Array
): SecureChannel {
  const dhEs = x25519.getSharedSecret(start.ePriv, serverPub)
  const dhEe = x25519.getSharedSecret(start.ePriv, fPub)
  const { c2s, s2c } = deriveKeys(start.ePub, fPub, dhEs, dhEe, psk)
  return new SecureChannel(c2s, s2c) // send c2s, recv s2c
}

// --- Responder (PC) ---

export interface ResponderResult {
  /** Handshake frame 2 to send back (our ephemeral public key). */
  fPub: Uint8Array
  channel: SecureChannel
}

export function responder(staticPriv: Uint8Array, ePub: Uint8Array, psk: Uint8Array): ResponderResult {
  const { priv: fPriv, pub: fPub } = generateKeyPair()
  const dhEs = x25519.getSharedSecret(staticPriv, ePub)
  const dhEe = x25519.getSharedSecret(fPriv, ePub)
  const { c2s, s2c } = deriveKeys(ePub, fPub, dhEs, dhEe, psk)
  return { fPub, channel: new SecureChannel(s2c, c2s) } // send s2c, recv c2s
}
