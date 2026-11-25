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
import { writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { InteractionEngine, Conn } from './server'
import type { Attachment } from '../../shared/mobile/messages'
import { resolveClaude } from './claudeBin'
import { isDockLive } from './dockState'
import { controllerConnId, mobileTakeControl, releaseByConn } from './control'
import { logger } from '../lib/logger'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Hide the dynamic import from Rollup so it stays a real runtime ESM import.
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>

// Global single-writer lock: sessionId -> owning connection id.
const driving = new Map<string, number>()

// Defensive cap on a single attachment (the phone caps too); larger ones are skipped.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/** Write the phone's attachments to a temp folder and return their absolute paths.
 *  We hand these paths to Claude in the prompt; it reads images/files natively. */
async function saveAttachments(sessionId: string, attachments: Attachment[]): Promise<string[]> {
  const dir = join(tmpdir(), 'cogpit-mobile-uploads', sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'session')
  await mkdir(dir, { recursive: true })
  const paths: string[] = []
  for (const a of attachments) {
    let bytes: Buffer
    try {
      bytes = Buffer.from(a.dataB64, 'base64')
    } catch {
      continue
    }
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) continue
    const safe = (a.name || 'file').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || 'file'
    const path = join(dir, `${Date.now()}-${paths.length}-${safe}`)
    await writeFile(path, bytes)
    paths.push(path)
  }
  return paths
}

/** Build the prompt sent to Claude: the caption, plus the saved attachment paths. */
function composePrompt(text: string, paths: string[]): string {
  if (!paths.length) return text
  const list = paths.map((p) => `- ${p}`).join('\n')
  const header = text.trim() ? `${text}\n\n` : 'Analyse les pièces jointes suivantes.\n\n'
  return `${header}[Pièces jointes envoyées depuis le mobile — lis-les]\n${list}`
}

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

  async function run(
    conn: Conn,
    args: { file: string; sessionId: string; cwd: string | null; text: string; attachments?: Attachment[] }
  ): Promise<void> {
    // A desktop dock tab is open for this session → TAKE IT OVER (pause the PC
    // tab) instead of refusing, unless another phone already controls it. The
    // desktop reloads with `claude --resume` when it reclaims, picking up what we
    // add here. Taking over is idempotent across our own successive messages.
    if (isDockLive(args.sessionId)) {
      const owner = controllerConnId(args.sessionId)
      if (owner !== undefined && owner !== conn.id) {
        conn.send({ t: 'event', event: { kind: 'error', text: 'Session déjà pilotée depuis un autre appareil.' } })
        return
      }
      if (owner === undefined) {
        mobileTakeControl(args.sessionId, {
          connId: conn.id,
          device: conn.label,
          abort: () => stateFor(conn).ac?.abort(),
          notifyPhone: () => conn.send({ t: 'control', file: args.file, controlledBy: 'desktop' })
        })
        conn.send({ t: 'control', file: args.file, controlledBy: 'mobile' })
      }
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
      let prompt = args.text
      if (args.attachments?.length) {
        const paths = await saveAttachments(args.sessionId, args.attachments)
        logger.info('mobile', 'attachments saved', { count: paths.length })
        prompt = composePrompt(args.text, paths)
      }
      const q = sdk.query({
        prompt,
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
      void run(a.conn, { file: a.file, sessionId: a.sessionId, cwd: a.cwd, text: a.text, attachments: a.attachments })
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
      // auto-reclaim: a paused desktop tab this phone controlled reloads itself
      releaseByConn(conn.id)
    }
  }
}
