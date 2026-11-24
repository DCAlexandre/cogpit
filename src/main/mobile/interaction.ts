/**
 * Interactive runtime: drive a Claude Code session from the phone via the Claude
 * Agent SDK (`query`). The SDK appends to the SAME session .jsonl, so the chat's
 * live tail renders the content; here we only surface the "thinking" state and
 * forward tool-permission requests as Allow/Deny cards.
 *
 * Single-writer: a session is refused if it's already being driven (another
 * phone / a second send) or open in the desktop terminal dock.
 *
 * The SDK is ESM-only, loaded via a runtime import() hidden from the bundler. If
 * it can't load, the bridge serves read-only and the phone hides its input box.
 */
import type { InteractionEngine, Conn } from './server'
import { resolveClaude } from './claudeBin'
import { isDockLive } from './dockState'
import { logger } from '../lib/logger'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Hide the dynamic import from Rollup so it stays a real runtime ESM import.
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>

// Global single-writer lock: sessionId -> owning connection id.
const driving = new Map<string, number>()

interface ConnState {
  ac: AbortController | null
  perms: Map<string, (allow: boolean) => void>
  busy: boolean
  seq: number
}

export async function createInteraction(): Promise<InteractionEngine | null> {
  let sdk: any
  try {
    sdk = await dynamicImport('@anthropic-ai/claude-agent-sdk')
  } catch (e) {
    logger.info('mobile', 'interaction disabled (agent SDK not available) — read-only mode', { err: String(e) })
    return null
  }
  if (!sdk || typeof sdk.query !== 'function') {
    logger.info('mobile', 'interaction disabled (query not found) — read-only mode')
    return null
  }

  const claude = await resolveClaude()
  logger.info('mobile', 'interaction enabled', { claude: claude.path, version: claude.version })

  const states = new WeakMap<Conn, ConnState>()
  const stateFor = (conn: Conn): ConnState => {
    let s = states.get(conn)
    if (!s) {
      s = { ac: null, perms: new Map(), busy: false, seq: 0 }
      states.set(conn, s)
    }
    return s
  }

  async function run(conn: Conn, args: { sessionId: string; cwd: string | null; text: string }): Promise<void> {
    // Single-writer guards.
    if (isDockLive(args.sessionId)) {
      conn.send({ t: 'event', event: { kind: 'error', text: 'Session ouverte en terminal sur le PC — pilotage mobile refusé.' } })
      return
    }
    const holder = driving.get(args.sessionId)
    if (holder !== undefined && holder !== conn.id) {
      conn.send({ t: 'event', event: { kind: 'error', text: 'Session déjà pilotée ailleurs.' } })
      return
    }
    const st = stateFor(conn)
    if (st.busy) {
      conn.send({ t: 'event', event: { kind: 'error', text: 'Une réponse est déjà en cours.' } })
      return
    }

    driving.set(args.sessionId, conn.id)
    st.busy = true
    conn.send({ t: 'busy', busy: true })
    st.ac = new AbortController()

    const canUseTool = async (toolName: string, input: Record<string, unknown>): Promise<any> => {
      const id = `p${++st.seq}`
      conn.send({ t: 'permission', id, tool: toolName, input })
      const allow = await new Promise<boolean>((resolve) => st.perms.set(id, resolve))
      st.perms.delete(id)
      return allow
        ? { behavior: 'allow', updatedInput: input }
        : { behavior: 'deny', message: 'Refusé depuis le mobile' }
    }

    try {
      const q = sdk.query({
        prompt: args.text,
        options: {
          resume: args.sessionId,
          cwd: args.cwd ?? undefined,
          canUseTool,
          abortController: st.ac,
          pathToClaudeCodeExecutable: claude.path ?? undefined
        }
      })
      for await (const msg of q as AsyncIterable<any>) {
        if (st.ac?.signal.aborted) break
        if (msg?.type === 'result') break
        if (msg?.type === 'assistant' && msg.message?.error) {
          conn.send({ t: 'event', event: { kind: 'error', text: `Erreur Claude : ${msg.message.error}` } })
        }
      }
    } catch (e) {
      logger.warn('mobile', 'interaction run failed', { err: String(e) })
      conn.send({ t: 'event', event: { kind: 'error', text: String((e as Error)?.message ?? e) } })
    } finally {
      driving.delete(args.sessionId)
      st.busy = false
      conn.send({ t: 'busy', busy: false })
      st.ac = null
    }
  }

  return {
    send(a) {
      void run(a.conn, { sessionId: a.sessionId, cwd: a.cwd, text: a.text })
    },
    permission(conn, id, allow) {
      stateFor(conn).perms.get(id)?.(allow)
    },
    interrupt(conn) {
      try {
        stateFor(conn).ac?.abort()
      } catch {
        /* ignore */
      }
    },
    close(conn) {
      const st = states.get(conn)
      if (st) {
        try {
          st.ac?.abort()
        } catch {
          /* ignore */
        }
        for (const resolve of st.perms.values()) resolve(false)
        st.perms.clear()
      }
      // release any sessions this connection was driving
      for (const [sid, owner] of driving) if (owner === conn.id) driving.delete(sid)
    }
  }
}
