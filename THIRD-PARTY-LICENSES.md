# Third-party licenses

Cogpit itself is MIT (see `LICENSE`). It also bundles and redistributes the
third-party assets below.

## Bundled fonts

The woff2 files in `src/renderer/src/assets/fonts/` are the Latin + Latin-Extended
subsets served by Google Fonts, embedded so the app never fetches fonts at runtime.
Each is licensed under the **SIL Open Font License, Version 1.1**. The full license
text and the per-font copyright statements + Reserved Font Names are in
[`src/renderer/src/assets/fonts/OFL.txt`](src/renderer/src/assets/fonts/OFL.txt).

| Font | Copyright | Source |
|---|---|---|
| Oxanium | © 2019 The Oxanium Project Authors | <https://fonts.google.com/specimen/Oxanium> |
| Orbitron | © 2009 The Orbitron Project Authors | <https://fonts.google.com/specimen/Orbitron> |
| Chakra Petch | © 2018 The Chakra Petch Project Authors | <https://fonts.google.com/specimen/Chakra+Petch> |
| Press Start 2P | © 2012 The Press Start 2P Project Authors | <https://fonts.google.com/specimen/Press+Start+2P> |
| VT323 | © 2020 The VT323 Project Authors | <https://fonts.google.com/specimen/VT323> |
| JetBrains Mono | © 2020 The JetBrains Mono Project Authors | <https://fonts.google.com/specimen/JetBrains+Mono> |

## Runtime dependencies

The npm packages Cogpit depends on (Electron, React, xterm, the pty backend, etc.)
are fetched by the package manager and are **not** vendored in this repository; each
carries its own license, declared in its own `package.json`. Run `pnpm licenses list`
to enumerate them for a given install.
