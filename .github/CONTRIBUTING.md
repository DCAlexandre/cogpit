# Contributing to Cogpit

Thanks for your interest! Cogpit is an MIT-licensed Electron app that manages Claude Code
CLI sessions. Contributions of all kinds are welcome.

## Getting started

Prerequisites: a recent **Node.js** and **pnpm** (the repo sets `node-linker=hoisted` for
Electron + native deps).

```bash
pnpm install
pnpm start        # electron-vite dev with hot reload
```

Useful scripts:

```bash
pnpm typecheck    # tsc on web + node — esbuild does NOT type-check, run this before a PR
pnpm build        # bundle main + preload + renderer into out/
```

## Workflow

1. **Fork** the repo and create a branch from `main`.
2. Make your change. Keep components small; keep orchestration in `App.tsx`.
3. Run `pnpm typecheck` (and `pnpm start` to smoke-test).
4. Commit using **Conventional Commits** (`fix:`, `feat:`, `chore:` …).
5. Open a **pull request** to `main`. The CI `build` check (type-check + build) must pass.
   PRs are merged by **squash**.

> `main` is protected: every change goes through a pull request, CI must be green, and
> **commits must be signed** (see below).

## Signing your commits

This repo requires **verified signatures**. The simplest path is SSH signing — see GitHub's
guide:
<https://docs.github.com/authentication/managing-commit-signature-verification>.

In short: generate a key with `ssh-keygen -t ed25519`, add its `.pub` to GitHub as a
**Signing Key**, then:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/<your-key>.pub
git config --global commit.gpgsign true
```

## Code conventions

- **No hardcoded user-facing strings.** All UI text goes through i18n (`useT()` and the
  `lib/i18n/dict/*` fragments), with matching `fr` and `en` keys.
- **Add an adapter, don't branch the UI.** New CLI support = a new `SessionAdapter`
  implementation, not conditionals scattered through components.
- **Never modify a live `.jsonl`.** User data lives in the app's `userData`; only explicit
  deletes touch `~/.claude`.
- Match the style of the surrounding code. Docs and comments are in **English**; the UI is
  **bilingual (EN/FR)**.

## Reporting bugs / ideas

Use the **issue templates** for bugs and feature requests, or start a **Discussion** for
open-ended questions. For security issues, see [SECURITY.md](./SECURITY.md).
