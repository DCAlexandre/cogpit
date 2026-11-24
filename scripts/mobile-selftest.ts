/**
 * Self-test for the mobile E2E handshake. Run with: node scripts/mobile-selftest.ts
 * Proves: initiator<->responder key agreement, bidirectional AEAD, and that a
 * wrong pinned key / wrong PSK makes decryption fail (AC5 — no MITM/eavesdrop).
 */
import {
  generateKeyPair,
  newPsk,
  initiatorStart,
  initiatorFinish,
  responder,
  toHex,
  fromHex
} from '../src/shared/mobile/crypto.ts'

let failures = 0
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

// 1. Happy path
const server = generateKeyPair()
const psk = newPsk()

const start = initiatorStart()
const resp = responder(server.priv, start.ePub, psk)
const client = initiatorFinish(start, resp.fPub, server.pub, psk)

// server -> client (hello)
const hello = resp.channel.seal({ t: 'hello', host: 'ROG' })
const helloDec = client.open<{ t: string; host: string }>(hello)
check('server->client hello decrypts', helloDec.t === 'hello' && helloDec.host === 'ROG')

// client -> server (request)
const req = client.seal({ t: 'scan' })
const reqDec = resp.channel.open<{ t: string }>(req)
check('client->server request decrypts', reqDec.t === 'scan')

// a few streamed frames (nonce counters advance correctly)
let ok = true
for (let i = 0; i < 5; i++) {
  const frame = resp.channel.seal({ t: 'message', i })
  const dec = client.open<{ t: string; i: number }>(frame)
  if (dec.i !== i) ok = false
}
check('5 streamed frames decrypt in order', ok)

// 2. Wrong PSK -> handshake cannot read server hello
const badClient = initiatorFinish(start, resp.fPub, server.pub, newPsk())
let threwPsk = false
try {
  // need a fresh server frame (counter) to open with wrong keys
  const resp2 = responder(server.priv, start.ePub, newPsk()) // server also wrong psk -> different keys
  badClient.open(resp2.channel.seal({ t: 'hello' }))
} catch {
  threwPsk = true
}
check('wrong PSK rejects (decryption throws)', threwPsk)

// 3. Wrong pinned server key -> decryption fails
const attacker = generateKeyPair()
const start3 = initiatorStart()
const resp3 = responder(server.priv, start3.ePub, psk) // real server
const badKeyClient = initiatorFinish(start3, resp3.fPub, attacker.pub, psk) // pinned the wrong key
let threwKey = false
try {
  badKeyClient.open(resp3.channel.seal({ t: 'hello' }))
} catch {
  threwKey = true
}
check('wrong pinned server key rejects (decryption throws)', threwKey)

// 4. hex round-trip (used for the QR payload)
const rt = toHex(fromHex(toHex(server.pub)))
check('hex round-trip stable', rt === toHex(server.pub))

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
