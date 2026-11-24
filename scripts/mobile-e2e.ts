/**
 * End-to-end bridge pipe test over a REAL WebSocket (ws). Mirrors the server
 * (responder) and client (initiator) handshakes and proves:
 *   AC1 handshake + hello over a real socket
 *   AC3 the bytes on the wire are ciphertext (a plaintext marker never appears)
 *   AC4 an application round-trip (scan) is carried encrypted
 *   AC5 a wrong PSK cannot decrypt — the channel is unusable
 * Run: node scripts/mobile-e2e.ts
 */
import { WebSocketServer, WebSocket } from 'ws'
import {
  responder,
  initiatorStart,
  initiatorFinish,
  generateKeyPair,
  newPsk,
  type SecureChannel
} from '../src/shared/mobile/crypto.ts'

const MARKER = 'WIRE-SECRET-ab12cd34'
const server = generateKeyPair()
const psk = newPsk()

let failures = 0
const check = (name: string, cond: boolean): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

const wss = new WebSocketServer({ port: 0 })
await new Promise<void>((r) => wss.on('listening', () => r()))
const port = (wss.address() as { port: number }).port

wss.on('connection', (ws) => {
  let channel: SecureChannel | null = null
  ws.on('message', (data: Buffer) => {
    const bytes = new Uint8Array(data)
    if (!channel) {
      const r = responder(server.priv, bytes.slice(), psk)
      channel = r.channel
      ws.send(Buffer.from(r.fPub))
      ws.send(Buffer.from(channel.seal({ t: 'hello', host: MARKER, adapter: 'claude-code', interactive: false })))
      return
    }
    let msg: { t: string }
    try {
      msg = channel.open(bytes.slice())
    } catch {
      ws.close()
      return
    }
    if (msg.t === 'scan') {
      ws.send(
        Buffer.from(
          channel.seal({ t: 'scan', data: { sessions: [], projects: [], stats: {}, generatedAt: 'now' } })
        )
      )
    }
  })
})

interface ClientResult {
  helloOk: boolean
  wireClean: boolean
  scanOk: boolean
  decrypted: boolean
}

function runClient(pinnedPub: Uint8Array, usePsk: Uint8Array): Promise<ClientResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    const startKp = initiatorStart()
    let channel: SecureChannel | null = null
    const res: ClientResult = { helloOk: false, wireClean: true, scanOk: false, decrypted: false }
    ws.on('open', () => ws.send(Buffer.from(startKp.ePub)))
    ws.on('message', (data: Buffer) => {
      const bytes = new Uint8Array(data)
      if (!channel) {
        channel = initiatorFinish(startKp, bytes.slice(), pinnedPub, usePsk)
        return
      }
      // the raw bytes here are exactly what crossed the wire
      if (Buffer.from(bytes).toString('latin1').includes(MARKER)) res.wireClean = false
      let msg: { t: string; host?: string }
      try {
        msg = channel.open(bytes.slice())
      } catch {
        ws.close()
        resolve(res)
        return
      }
      res.decrypted = true
      if (msg.t === 'hello') {
        res.helloOk = msg.host === MARKER
        ws.send(Buffer.from(channel.seal({ t: 'scan' })))
      } else if (msg.t === 'scan') {
        res.scanOk = true
        ws.close()
        resolve(res)
      }
    })
    ws.on('error', () => resolve(res))
    setTimeout(() => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      resolve(res)
    }, 3000)
  })
}

const good = await runClient(server.pub, psk)
check('AC1 handshake + hello over real socket', good.helloOk)
check('AC3 wire bytes are ciphertext (marker absent)', good.wireClean && good.decrypted)
check('AC4 encrypted scan round-trip', good.scanOk)

const bad = await runClient(server.pub, newPsk()) // correct pinned key, wrong PSK
check('AC5 wrong PSK cannot decrypt (no hello)', !bad.helloOk && !bad.decrypted)

wss.close()
console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
