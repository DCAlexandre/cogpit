# Volets desktop à appliquer (au prochain redémarrage de Cogpit)

> Ces changements touchent le **process principal Electron** (`src/main/**`). On ne
> les applique PAS tant que le desktop tourne avec une session Claude en cours
> (un rebuild electron-vite relancerait le main → `killAllPty()` → session tuée).
> Quand tu peux redémarrer : j'applique tout, puis `pnpm start`.

## 1. Garantir que `claude` est dispo (détecter / chemin / installer / mettre à jour)

Le SDK accepte `options.pathToClaudeCodeExecutable` — donc on résout le binaire
nous-mêmes au lieu de dépendre du PATH du process Electron.

### Nouveau fichier `src/main/mobile/claudeBin.ts`
```ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const pexec = promisify(execFile)
const isWin = process.platform === 'win32'

export interface ClaudeInfo { found: boolean; path: string | null; version: string | null }

function candidates(): string[] {
  const home = homedir()
  const list = [
    join(home, '.claude', 'local', isWin ? 'claude.exe' : 'claude'),
    join(home, '.local', 'bin', 'claude')
  ]
  if (isWin) {
    if (process.env.APPDATA) list.push(join(process.env.APPDATA, 'npm', 'claude.cmd'))
    if (process.env.LOCALAPPDATA) list.push(join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'))
  } else {
    list.push('/usr/local/bin/claude', '/opt/homebrew/bin/claude')
  }
  return list
}

async function whichClaude(): Promise<string | null> {
  try {
    const { stdout } = await pexec(isWin ? 'where' : 'which', ['claude'])
    return stdout.split(/\r?\n/).find(Boolean)?.trim() || null
  } catch {
    return null
  }
}

export async function resolveClaude(): Promise<ClaudeInfo> {
  let path = await whichClaude()
  if (!path) path = candidates().find((p) => p && existsSync(p)) ?? null
  if (!path) return { found: false, path: null, version: null }
  let version: string | null = null
  try {
    const { stdout } = await pexec(path, ['--version'], { timeout: 10000 })
    version = stdout.trim()
  } catch {
    /* found but version call failed */
  }
  return { found: true, path, version }
}

export async function installClaude(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await pexec(isWin ? 'npm.cmd' : 'npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      timeout: 300000
    })
    return { ok: true, output: (stdout + stderr).slice(-4000) }
  } catch (e: any) {
    return { ok: false, output: String(e?.stderr ?? e?.message ?? e).slice(-4000) }
  }
}

export async function updateClaude(): Promise<{ ok: boolean; output: string }> {
  const info = await resolveClaude()
  if (!info.path) return { ok: false, output: 'claude introuvable' }
  try {
    const { stdout, stderr } = await pexec(info.path, ['update'], { timeout: 300000 })
    return { ok: true, output: (stdout + stderr).slice(-4000) }
  } catch (e: any) {
    return { ok: false, output: String(e?.stderr ?? e?.message ?? e).slice(-4000) }
  }
}
```

### `src/main/mobile/interaction.ts` — passer le chemin au SDK
- `import { resolveClaude } from './claudeBin'`
- dans `createInteraction()`, après le chargement du SDK : `const claude = await resolveClaude()`
- dans `query({ options: { ... } })`, ajouter : `pathToClaudeCodeExecutable: claude.path ?? undefined`
- si `!claude.found`, on peut quand même tenter (le SDK cherchera dans le PATH), mais logguer un warning.

### IPC + preload + Settings
- `ipc.ts` : `handle('mobile:claudeInfo', () => resolveClaude())`, `handle('mobile:claudeInstall', () => installClaude())`, `handle('mobile:claudeUpdate', () => updateClaude())`
- `preload` : `mobile.claudeInfo/claudeInstall/claudeUpdate`
- `MobileStatus`/UI : afficher « Claude CLI : v… ✓ » ou « introuvable → [Installer] / [Mettre à jour] » (boutons gatés par clic — action sortante).

## 2. Single-writer (empêcher deux pilotes sur la même session)

Deux couches :

### (a) Verrou par session dans le pont (mobile↔mobile, multi-utilisateurs, double-envoi)
Dans `interaction.ts`, au niveau module :
```ts
const driving = new Map<string, number>() // sessionId -> conn.id
```
Dans `run(conn, args)`, tout en haut :
```ts
const holder = driving.get(args.sessionId)
if (holder !== undefined && holder !== conn.id) {
  conn.send({ t: 'event', event: { kind: 'error', text: 'Session déjà pilotée ailleurs.' } })
  return
}
driving.set(args.sessionId, conn.id)
```
Dans le `finally` : `driving.delete(args.sessionId)`.
Dans `close(conn)` : retirer toutes les entrées dont la valeur === conn.id.

### (b) Conscience des sessions ouvertes en TUI dans le dock (mobile↔desktop)
Le renderer connaît `liveIds` (sessions ouvertes dans le dock). On les pousse au main :
- `preload` + `ipc.ts` : `handle('mobile:setLiveSessions', (_e, ids: string[]) => setLiveDockSessions(ids))`
- `src/main/mobile/index.ts` : `let liveDock = new Set<string>(); export const setLiveDockSessions = (ids) => { liveDock = new Set(ids) }; export const isDockLive = (id) => liveDock.has(id)`
- `interaction.run` : si `isDockLive(args.sessionId)` → refuser (« ouverte en terminal sur le PC »).
- `App.tsx` (renderer) : `useEffect(() => window.api.mobile.setLiveSessions([...liveIds]), [liveIds])`.
- Inverse (bloquer l'ouverture TUI d'une session pilotée mobile) : exposer l'ensemble `driving` au renderer via le scan/une IPC, et griser « Reprendre » pour ces sessions. (Phase 2.)

### (c) Durcissement futur (optionnel)
Lock fichier (`<session>.jsonl.lock`) pour couvrir aussi un `claude` lancé hors Cogpit. Pas nécessaire pour la v1.

## Ordre d'application (quand le desktop est redémarrable)
1. Créer `claudeBin.ts`.
2. Éditer `interaction.ts` (path SDK + verrou driving + isDockLive).
3. Éditer `index.ts` (liveDock), `ipc.ts` + `preload` + `shared/types.ts` (nouvelles IPC), Settings UI (statut claude).
4. `App.tsx` renderer : push `setLiveSessions`.
5. `pnpm typecheck && pnpm build`, puis `pnpm start`.
