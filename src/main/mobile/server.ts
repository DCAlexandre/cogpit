/**
 * The mobile bridge server: serves the built mobile web app over HTTP and a
 * WebSocket endpoint at /ws. Every WS connection runs the Noise-style handshake
 * (responder role), then speaks the encrypted application protocol. Reuses the
 * desktop's session scan / transcript reader; tails the open transcript for live
 * updates. LAN-only by design; the payload is E2E encrypted regardless.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import { readFile } from 'fs/promises'
import { watchFile, unwatchFile } from 'fs'
import { join, normalize, resolve, extname } from 'path'
import { responder, type SecureChannel } from '../../shared/mobile/crypto'
import type { Attachment, ClientMsg, ServerMsg } from '../../shared/mobile/messages'
import { scanAll, readTranscript } from '../lib/sessions'
import { claudeCodeAdapter } from '../adapters/claudeCode'
import { logger } from '../lib/logger'

export interface InteractionEngine {
  send(args: {
    conn: Conn
    file: string
    sessionId: string
    cwd: string | null
    text: string
    attachments?: Attachment[]
  }): void
  permission(conn: Conn, id: string, allow: boolean): void
  interrupt(conn: Conn): void
  close(conn: Conn): void
}

export interface BridgeOptions {
  port: number
  staticDir: string
  identity: { priv: Uint8Array; pub: Uint8Array; psk: Uint8Array }
  hostName: string
  onClientsChange?: (n: number) => void
  interaction?: InteractionEngine
}

export interface BridgeHandle {
  port: number
  close: () => Promise<void>
  broadcast: (msg: ServerMsg) => void
  clients: () => number
}

export interface Conn {
  id: number
  /** human label for this phone (remote IP), shown on a paused desktop tab */
  label: string
  ws: WebSocket
  channel: SecureChannel | null
  watchedFile: string | null
  watchListener: (() => void) | null
  sentCount: number
  /** Send an encrypted application message. Safe no-op before the handshake. */
  send: (msg: ServerMsg) => void
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

function claudeRoot(): string {
  return claudeCodeAdapter.rootDir()
}

function underClaudeRoot(file: string): boolean {
  return resolve(file).startsWith(resolve(claudeRoot()))
}

export function startBridge(opts: BridgeOptions): BridgeHandle {
  const conns = new Set<Conn>()
  let counter = 0

  const staticRoot = resolve(opts.staticDir)

  async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let pathname = '/'
    try {
      pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname)
    } catch {
      /* keep default */
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const full = normalize(join(staticRoot, pathname))
    if (!full.startsWith(staticRoot)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    try {
      const data = await readFile(full)
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' })
      res.end(data)
    } catch {
      // SPA fallback: serve index.html so client-side routing / #fragment works
      try {
        const idx = await readFile(join(staticRoot, 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(idx)
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>Cogpit mobile</h1><p>The mobile app is not built. Run: pnpm mobile:build</p>')
      }
    }
  }

  const httpServer: Server = createServer((req, res) => {
    void serveStatic(req, res)
  })

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '/'
    try {
      pathname = new URL(req.url || '/', 'http://x').pathname
    } catch {
      /* default */
    }
    if (pathname === '/ws') {
      const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '') || 'LAN'
      wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip))
    } else {
      socket.destroy()
    }
  })

  function reportClients(): void {
    opts.onClientsChange?.(conns.size)
  }

  function unsubscribe(conn: Conn): void {
    if (conn.watchedFile && conn.watchListener) {
      unwatchFile(conn.watchedFile, conn.watchListener)
    }
    conn.watchedFile = null
    conn.watchListener = null
  }

  async function subscribe(conn: Conn, file: string): Promise<void> {
    unsubscribe(conn)
    if (!underClaudeRoot(file)) {
      conn.send({ t: 'error', message: 'file outside Claude root' })
      return
    }
    const msgs = await readTranscript(file)
    conn.sentCount = msgs.length
    conn.watchedFile = file
    conn.send({ t: 'transcript', file, messages: msgs })
    const listener = (): void => {
      void (async () => {
        try {
          const next = await readTranscript(file)
          const fresh = next.slice(conn.sentCount)
          conn.sentCount = next.length
          for (const m of fresh) conn.send({ t: 'append', file, message: m })
        } catch {
          /* transient read error during write — ignore */
        }
      })()
    }
    conn.watchListener = listener
    watchFile(file, { interval: 700 }, listener)
  }

  async function handle(conn: Conn, msg: ClientMsg): Promise<void> {
    switch (msg.t) {
      case 'scan': {
        const r = await scanAll(claudeCodeAdapter)
        conn.send({
          t: 'scan',
          data: { sessions: r.sessions, projects: r.projects, stats: r.stats, generatedAt: r.generatedAt }
        })
        return
      }
      case 'transcript': {
        if (!underClaudeRoot(msg.file)) {
          conn.send({ t: 'error', message: 'file outside Claude root' })
          return
        }
        const messages = await readTranscript(msg.file)
        conn.send({ t: 'transcript', file: msg.file, messages })
        return
      }
      case 'subscribe':
        await subscribe(conn, msg.file)
        return
      case 'unsubscribe':
        unsubscribe(conn)
        return
      case 'send':
        if (opts.interaction) {
          opts.interaction.send({
            conn,
            file: msg.file,
            sessionId: msg.sessionId,
            cwd: msg.cwd,
            text: msg.text,
            attachments: msg.attachments
          })
        } else {
          conn.send({ t: 'error', message: 'interaction-unavailable' })
        }
        return
      case 'permission':
        opts.interaction?.permission(conn, msg.id, msg.allow)
        return
      case 'interrupt':
        opts.interaction?.interrupt(conn)
        return
    }
  }

  function onConnection(ws: WebSocket, ip: string): void {
    const conn: Conn = {
      id: ++counter,
      label: `mobile ${ip}`,
      ws,
      channel: null,
      watchedFile: null,
      watchListener: null,
      sentCount: 0,
      send: (msg: ServerMsg) => {
        if (conn.channel && ws.readyState === ws.OPEN) {
          try {
            ws.send(Buffer.from(conn.channel.seal(msg)))
          } catch {
            /* closed mid-send */
          }
        }
      }
    }
    conns.add(conn)
    reportClients()
    logger.info('mobile', 'ws connect', { id: conn.id, clients: conns.size })

    ws.on('message', (data: Buffer) => {
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      // Handshake: first frame is the initiator's ephemeral public key (32 bytes).
      if (!conn.channel) {
        if (bytes.length !== 32) {
          ws.close()
          return
        }
        try {
          const { fPub, channel } = responder(opts.identity.priv, bytes.slice(), opts.identity.psk)
          conn.channel = channel
          ws.send(Buffer.from(fPub))
          conn.send({ t: 'hello', host: opts.hostName, adapter: claudeCodeAdapter.label, interactive: !!opts.interaction })
        } catch (e) {
          logger.warn('mobile', 'handshake failed', { id: conn.id, err: String(e) })
          ws.close()
        }
        return
      }
      // Encrypted application frame. A decryption failure == wrong PSK/key → drop.
      let msg: ClientMsg
      try {
        msg = conn.channel.open<ClientMsg>(bytes.slice())
      } catch {
        logger.warn('mobile', 'decrypt failed → close', { id: conn.id })
        ws.close()
        return
      }
      void handle(conn, msg)
    })

    ws.on('close', () => {
      unsubscribe(conn)
      opts.interaction?.close(conn)
      conns.delete(conn)
      reportClients()
      logger.info('mobile', 'ws close', { id: conn.id, clients: conns.size })
    })
    ws.on('error', () => {
      /* 'close' will follow */
    })
  }

  httpServer.listen(opts.port, '0.0.0.0')

  return {
    port: opts.port,
    broadcast: (msg: ServerMsg) => {
      for (const c of conns) c.send(msg)
    },
    clients: () => conns.size,
    close: () =>
      new Promise<void>((done) => {
        for (const c of conns) {
          unsubscribe(c)
          try {
            c.ws.close()
          } catch {
            /* ignore */
          }
        }
        conns.clear()
        wss.close()
        httpServer.close(() => done())
      })
  }
}
