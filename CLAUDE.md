# CLAUDE.md — Cogpit

Guidance for Claude Code when working in this repo.

## What this is

**Cogpit** is a standalone, open-source (MIT) Electron desktop app that manages
**Claude Code CLI sessions**: it reads `~/.claude/projects/*/*.jsonl`, lists every
conversation, and lets you resume, preview, rename, trash or delete them. It is its own
repo (GitHub `DCAlexandre/cogpit`), unrelated to any other project. The app UI is
**bilingual (English/French)** — it follows the device language and can be overridden in
Settings; docs and code comments are in English. Keep it approachable for open-source users.

## Commands

Package manager: **pnpm** (`.npmrc` sets `node-linker=hoisted` for Electron + native deps).

```bash
pnpm start           # electron-vite dev (hot reload) — the primary run command
pnpm build           # bundle main + preload + renderer into out/
pnpm preview         # run the built app (electron-vite preview)
pnpm typecheck       # tsc on both web + node projects (esbuild does NOT type-check)
pnpm setup:terminal  # ensure the integrated terminal works (detect/install toolchain, rebuild)
pnpm rebuild         # rebuild the pty backend against Electron's ABI
pnpm gen:icon        # regenerate resources/icon.png
pnpm dist:win        # package a Windows installer
# node scripts/fetch-fonts.cjs  — re-download the bundled display fonts + JetBrains Mono woff2
```

## Architecture

electron-vite project, **CommonJS** main/preload (so native `require` + `__dirname`
work without ESM friction), ESM React renderer.

| Layer | Path | Notes |
|---|---|---|
| Main | `src/main/` | app lifecycle, tray, watcher, IPC |
| Adapters | `src/main/adapters/` | `SessionAdapter` contract; `claudeCode` is the only impl |
| Main libs | `src/main/lib/` | `sessions` (scan+transcript+content index), `cache`, `meta`, `trash`, `terminal` (external), `pty` (integrated), `watcher`, `ide` (open project in Cursor/VS Code), `logger` |
| Preload | `src/preload/` | `contextBridge` → `window.api`; typed by `src/shared/types.ts` |
| Renderer | `src/renderer/src/` | React + Tailwind + shadcn-style UI in `components/` |
| Shared | `src/shared/types.ts` | the single source of truth for the IPC contract |

### Rules that matter

- **Never modify a live `.jsonl`.** User customisations (rename/pin/favourite/hide) and
  the trash live in the app's `userData`. Only explicit deletes touch `~/.claude`.
- **Add an adapter, don't branch the UI.** New CLI support = a new `SessionAdapter`.
- **Projects are grouped by real `cwd`, not the encoded dir.** Claude can file the same
  folder under two project dirs; `projectKey = cwd || dir:<projectDir>` merges them. A
  session with no `cwd` inherits a sibling's cwd from the same encoded dir (so it doesn't
  spawn a phantom project named from the lossy dir decode). The sidebar renders projects as
  a collapsible **tree** mirroring the user's folder layout (common path prefix stripped).
  "Nouvelle" session opens a native folder picker (`dialog:pickFolder`) — works with zero
  existing sessions and any folder.
- **Parallel sessions live in the bottom `TerminalDock`** (tabs, persistent ptys that
  survive tab switches). "Reprendre"/"Nouvelle" open/focus a dock tab; running sessions
  are pinned in the `LiveStrip` at the top of the list + marked `live` in rows. There is
  NO per-session terminal in `SessionPanel` anymore. Integrated-terminal effects run once
  per mount (stable `key`) — never re-create a pty on re-render (that caused a resume loop).
- **The pty backend is `@homebridge/node-pty-prebuilt-multiarch`** (N-API prebuilds →
  works with no toolchain). It is lazy-`require`d with a try/catch in `lib/pty.ts`; when it
  can't load the UI falls back to an external terminal. Keep that fallback intact. The
  full-text search index (`lib/sessions.ts`) lives only in the main process — never ship
  `searchText` to the renderer.
- **The terminal renders with the canvas addon (`@xterm/addon-canvas`), not the default
  DOM renderer.** The DOM renderer sizes each row as its own rounded `<div>`; that rounding
  accumulates and clips the last line on tall panes (the bug behind several fit hacks).
  Canvas draws one pixel-exact surface — same approach as VS Code (WebGL/canvas) — so
  `fitToVisible` can just take xterm's proposed fit. Don't revert to the DOM renderer.
- **No hardcoded user-facing strings — use i18n.** UI text goes through `useT()` from
  `lib/i18n` (e.g. `t('ns.key')`, `{name}` placeholders). Messages live in per-area fragment
  files under `lib/i18n/dict/*.ts` (`{ fr: {...}, en: {...} }`, same keys both locales),
  merged in `lib/i18n/index.ts`. Add new keys under an existing namespace to avoid collisions.
  Locale = the `language` setting (`auto` → `navigator.language`); dates/bytes are localized in
  `lib/format.ts` via `setFormatLocale`. Don't translate logs, test-ids, or dynamic data.
- **Type-check before shipping** — esbuild transpiles without type errors, so run
  `npm run typecheck`.
- Scanning caches parsed metadata by `path + mtime + size` (`parse-cache.json`); the
  first cold scan of a large store is slow, later ones are instant.

## Conventions

- **Design language: "amber-phosphor flight deck."** Pure amber (`#FFB000`) on near-black,
  high contrast (verified AA/AAA). Theme tokens are CSS vars in `src/renderer/src/index.css`
  (`.dark` default = amber CRT; `:root` = light "daylight instrument"). Signature = CRT
  scanline veil (`.crt-overlay`), one-time boot sequence (`BootSequence`), status LEDs
  (`.led`/`.led-active`), phosphor glow (`.phosphor`), HUD eyebrows (`.hud-label`).
- **User-switchable appearance** (persisted in `meta.ts` settings, applied as `data-*`
  attributes on `<html>`): **palette** `[data-palette]` = amber / pipboy (green) / synthwave
  (pink-violet); **display font** `[data-font]` = oxanium (default) / orbitron / chakra /
  pressstart / vt323; **UI scale** `[data-scale]` = sm / md / lg. Readability/contrast is the
  hard constraint for every palette.
- **Type:** display = the chosen `[data-font]` (default Oxanium) for wordmark/headers/readouts
  used sparingly; everything else = JetBrains Mono. Bundled offline as woff2 (OFL) — regenerate
  with `node scripts/fetch-fonts.cjs`.
- **Frameless window:** native chrome is off (`frame: false`); `WindowControls` draws the
  close/min/max buttons and the title bar is the drag region (`-webkit-app-region`).
- **Accessibility is a floor, not a nice-to-have:** visible `:focus-visible` rings, never
  color-only status, `prefers-reduced-motion` disables scanlines/animations. Keep it.
- UI primitives (`components/ui/`) are hand-rolled shadcn-style (cva + tailwind-merge),
  no Radix dependency.
- Prefer small, focused components; keep orchestration in `App.tsx`.
- **Design screenshot harness:** run with env `COGPIT_SHOT=<path-base>` to capture
  `<base>-main.png` + `<base>-menu.png` + `<base>-settings.png` then auto-quit (see `runShots`
  in `src/main/index.ts`). It captures the real local `~/.claude` history — never commit its
  output to a public repo without anonymising first.
  Inert without the env var. Caveat: `capturePage()` hangs on an unpainted window — call
  `win.show()` first and race it against a timeout (already done). Fastest way to drive it:
  `COGPIT_SHOT=... ./node_modules/.bin/electron .` (bypasses `electron-vite preview`, which
  does not forward arbitrary env vars to the spawned Electron).
- **Right-click = context menu.** Sessions (rows) and projects (sidebar tree) open a
  `ContextMenu` (`components/ui/context-menu.tsx`) with per-target actions. The top bar is
  deliberately minimal (brand, search, sort, New, Settings); refresh/theme/trash live in
  Settings, destructive/project actions live in the context menu. Electron has no
  `window.prompt` — rename uses `RenameModal`, not a prompt.
