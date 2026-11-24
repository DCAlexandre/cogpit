/** Encrypted WebSocket client: dial the bridge, run the handshake (initiator),
 *  then exchange sealed application messages. */
import { initiatorStart, initiatorFinish, type SecureChannel } from '../protocol/crypto'
import type { ClientMsg, ServerMsg } from '../protocol/messages'
import type { Pairing } from '../protocol/pairing'

export type ConnState = 'connecting' | 'handshaking' | 'ready' | 'closed' | 'error'

export interface Connection {
  send(msg: ClientMsg): void
  close(): void
  onMessage(cb: (msg: ServerMsg) => void): void
  onState(cb: (s: ConnState, info?: string) => void): void
}

export function connect(wsUrl: string, pairing: Pairing): Connection {
  const start = initiatorStart()
  let channel: SecureChannel | null = null
  let closed = false

  const msgCbs: ((m: ServerMsg) => void)[] = []
  const stateCbs: ((s: ConnState, info?: string) => void)[] = []
  const setState = (s: ConnState, info?: string): void => stateCbs.forEach((cb) => cb(s, info))

  // Creating the socket can THROW synchronously (bad URL, or mixed-content /
  // cleartext blocked on native). Never let that crash the caller — report it.
  let ws: WebSocket
  try {
    ws = new WebSocket(wsUrl)
  } catch {
    setTimeout(() => setState('error', 'socket'), 0)
    return {
      send: () => {},
      close: () => {},
      onMessage: (cb) => msgCbs.push(cb),
      onState: (cb) => stateCbs.push(cb)
    }
  }
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    setState('handshaking')
    ws.send(start.ePub) // frame 1: our ephemeral public key
  }

  ws.onmessage = (ev) => {
    const bytes = new Uint8Array(ev.data as ArrayBuffer)
    if (!channel) {
      // frame 2: responder ephemeral public key → derive the channel
      try {
        channel = initiatorFinish(start, bytes, pairing.pub, pairing.psk)
      } catch {
        setState('error', 'handshake')
        ws.close()
      }
      return
    }
    let msg: ServerMsg
    try {
      msg = channel.open<ServerMsg>(bytes)
    } catch {
      // wrong pinned key / PSK, or tampering → the channel is unusable
      setState('error', 'decrypt')
      ws.close()
      return
    }
    if (msg.t === 'hello') setState('ready')
    msgCbs.forEach((cb) => cb(msg))
  }

  ws.onclose = () => {
    if (!closed) setState('closed')
  }
  ws.onerror = () => setState('error', 'socket')

  return {
    send: (msg) => {
      if (channel && ws.readyState === WebSocket.OPEN) ws.send(channel.seal(msg))
    },
    close: () => {
      closed = true
      ws.close()
    },
    onMessage: (cb) => msgCbs.push(cb),
    onState: (cb) => stateCbs.push(cb)
  }
}
