# Security Policy

## Supported versions

Cogpit is under active development; security fixes land on the latest release and on `main`.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's **private vulnerability reporting** on this repository:
**Security → Report a vulnerability**
(<https://github.com/DCAlexandre/cogpit/security/advisories/new>).

You can expect an initial response within a few days. Once a fix is available we publish an
advisory and credit you (unless you prefer to stay anonymous).

## Scope & threat model

Cogpit is a **local** desktop app. It reads your local `~/.claude/projects/*.jsonl` history,
stores its own data under the app's `userData`, and **does not send your sessions or any
telemetry to a remote server**. Only explicit deletes ever touch `~/.claude`.

Areas most relevant to a security report:

- path handling and command execution through the **integrated terminal**,
- the **IPC** surface between the renderer and the main process,
- any code path that could read or leak session content **outside** the machine.
