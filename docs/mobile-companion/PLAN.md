# Cogpit Companion — Mobile app (plan & architecture)

> Statut : **plan validé, implémentation non démarrée.** Document de référence pour
> construire l'app mobile compagnon de Cogpit. Décisions prises avec l'utilisateur ;
> recherches sourcées archivées dans `docs/mobile-companion/research/` (voir fin).

## Contexte & objectif

Cogpit (desktop Electron) lit `~/.claude/projects/*/*.jsonl` et gère les sessions Claude
Code CLI. On veut une **app mobile (iOS + Android)** pour **contrôler ces conversations
depuis le téléphone**, façon « WhatsApp mais PC → mobile » :

- **Appairage par QR code** affiché par le PC (comme WhatsApp Web, mais dans ce sens).
- **Lien réseau privé et chiffré** entre le PC et le mobile.
- **Streaming des conversations** rendu comme un **chat classique (bulles type WhatsApp)**.
- **Pas de console/terminal sur mobile** — l'agencement desktop est repensé pour le mobile.
- **Interactif complet** : envoyer des messages ET répondre aux demandes de permission
  d'outils (Autoriser / Refuser) depuis le téléphone.

### Le déclic d'architecture

Le payload applicatif est **chiffré de bout en bout** (Noise). Donc le **mode de
connexion est orthogonal à l'app** : le mobile se connecte toujours à une `IP:port` via
WebSocket, et seul le `host` change selon le mode. Un intermédiaire éventuel (relais
cloud) ne voit que du **chiffré** → *zero-knowledge*. Même pattern que **Codex Remote**
d'OpenAI (pairing QR → Noise IK → relais zero-knowledge), ce qui valide l'approche.

## Décisions verrouillées

| Sujet | Décision | Pourquoi |
|---|---|---|
| Framework mobile | **Capacitor** (WebView + React/Vite) | Réutilise le design system CSS ambre + composants + i18n *verbatim*. Natif (RN) imposerait de reconstruire et maintenir 2 design systems. |
| Dépôt | **Monorepo** dans ce repo (pnpm workspaces) | Partage des types (`src/shared/types.ts`) + i18n + protocole. |
| Chiffrement/transport | **Noise_IK sur WebSocket, pur TS** (`@noble/ciphers` + `@noble/curves`) | Crypto cœur de WireGuard, 0 code natif, 0 entitlement VPN, même code Capacitor/RN, relais zero-knowledge possible. |
| Pilotage des sessions | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | Messages structurés → bulles ; `canUseTool` → cartes Autoriser/Refuser. Pas de scraping de TUI. |
| Accès distant (Mode 1) | **LAN d'abord**, puis **WireGuard (QR, option)**, puis **Cloudflare Tunnel (option 2)** | LAN = zéro config/tiers ; WireGuard = 100% privé auto-hébergé ; CF Tunnel = sans toucher au routeur. |
| Mode 2 (cloud relais payant) | **Reporté** (phase ultérieure) | On livre le gratuit/local d'abord. |

### Pourquoi PAS embarquer WireGuard dans l'app
« Semaines de natif + 99 $/an Apple + VpnService » n'est vrai que pour un **VPN système**.
Un WireGuard *userspace* in-app (sans entitlement) est possible mais = 1–3 semaines de
Go/Rust + pont par plateforme à maintenir, surdimensionné pour « 1 app ↔ 1 PC ». Noise-sur-WS
donne les mêmes garanties E2E en *jours*, en pur JS. L'accès distant WireGuard « classique »
reste proposé via l'**app WireGuard officielle** (config générée en QR par Cogpit).

## Architecture cible

```
  [Mobile — Capacitor]
     • scan QR → {host:port, clé publique Noise du PC, token}
     • WebSocket NATIF (pinning + framing binaire hors WebView)
     • handshake Noise_IK (pur JS @noble) → canal E2E
     • clé privée device → Keychain / Keystore (plugin natif)
         │
         │   (le "host" change selon le mode ; le code NON)
         ▼
  ┌─ MODE 1 — local / gratuit ──────────────┬─ MODE 2 — cloud / payant (plus tard) ─┐
  │  LAN direct (défaut, mDNS pour IP)       │  Relais WS zero-knowledge auto-hébergé │
  │  WireGuard (config QR, option)           │  PC + tél sortent en WSS ; recopie de  │
  │  Cloudflare Tunnel / rathole (sortant)   │  frames chiffrées ; gating Stripe      │
  └──────────────────────────────────────────┴─────────────────────────────────────────┘
         │
         ▼
  [PC — Cogpit main process]
     • Serveur WebSocket (ws) activable depuis Réglages ("Accès mobile")
     • Pairing : keypair Noise statique du PC (userData) + QR
     • RPC/streaming sur le canal Noise, réutilise le contrat IPC existant :
         - scanAll()  → liste projets/sessions
         - readTranscript() → messages → bulles
         - startWatcher() → updates live (push "session changed")
     • Runtime interactif : Claude Agent SDK pilote `claude --resume <id>`
         - événements structurés → bulles + chips outils
         - canUseTool → carte permission envoyée au mobile → décision renvoyée
         - verrou "un seul écrivain par session" (TUI dock vs mobile)
```

### Structure monorepo (adoption incrémentale)

Cible (ne pas tout déplacer d'un coup — introduire les workspaces et extraire au fil de l'eau) :

```
cogpit/
  apps/
    desktop/        # app Electron actuelle (déplacement = cleanup ultérieur, pas bloquant)
    mobile/         # Capacitor + Vite + React + Tailwind (réutilise les tokens CSS)
  packages/
    shared/         # types (depuis src/shared/types.ts) + dict i18n
    protocol/       # Noise_IK + framing + schéma pairing QR + schéma messages (partagé PC/mobile)
  services/
    relay/          # Mode 2 — relais cloud zero-knowledge (phase ultérieure)
```

Pragmatique : activer **pnpm workspaces**, créer `packages/shared` et `packages/protocol`,
ajouter `apps/mobile`. Le déplacement de l'app desktop vers `apps/desktop` peut venir après.

## Composants à construire

### 1. `packages/protocol` (partagé PC ↔ mobile)
- Handshake **Noise_IK** (clé statique du PC connue via le QR) sur `@noble/ciphers` +
  `@noble/curves` (primitives auditées Cure53). Option `IKpsk2` pour coller à WireGuard.
- Framing binaire, fenêtre anti-rejeu, rekey.
- **Schéma du QR de pairing** (une seule forme pour tous les modes) :
  ```jsonc
  { "v":1, "app":"cogpit", "scheme":"ws", "host":"192.168.1.42", "port":8787,
    "path":"/ws", "noisePub":"base64-32B", "psk":"base64?", "tlsPinSpki":"base64?",
    "mdns":"cogpit-ab12._cogpit._tcp.local", "altEndpoints":[…], "exp":… }
  ```
  `noisePub` = ancre de confiance : le mobile authentifie le PC par sa clé Noise, donc
  `ws://` en clair sur le LAN est sûr, et un relais ne peut pas faire de MITM.
- **Schéma des messages** (RPC + streaming), typé, partagé : `listSessions`, `getTranscript`,
  `session.updated`, `startSession`, `userTurn`, `event.*` (assistant/tool_use/tool_result),
  `permission.request` / `permission.decision`.

### 2. PC — bridge dans `src/main/` (Cogpit)
- Serveur **WebSocket** (`ws`), bind configurable, démarré à la demande (Réglages → « Activer
  l'accès mobile ») ; génère le QR.
- **Pairing** : keypair Noise statique persistée dans `userData` ; token de device révocable.
- **Réutilise l'existant** : `scanAll()` et `readTranscript()` (`src/main/lib/sessions.ts`),
  `startWatcher()` (`src/main/lib/watcher.ts`) pour pousser les updates live, les types de
  `src/shared/types.ts`.
- **Runtime interactif** : intégrer `@anthropic-ai/claude-agent-sdk` pour piloter une session
  en mode structuré ; mapper `canUseTool` → `permission.request` ; **verrou un-seul-écrivain**
  (une session pilotée depuis le mobile ne doit pas tourner en TUI dans le dock, et inversement
  — coordonner avec le set `live`/`terminals` de `App.tsx`).
- **Reachability providers** : LAN (défaut) ; WireGuard (génère la config → QR, option) ;
  Cloudflare Tunnel / rathole (sortant, option). Chacun produit un `Endpoint` ; `altEndpoints`
  pour le fallback ordonné.

### 3. Mobile — `apps/mobile` (Capacitor)
- React + Vite + Tailwind, **réutilise** `packages/shared` (types + i18n) et les **tokens CSS**
  du design system ambre (`src/renderer/src/index.css`).
- **Plugins natifs** : WebSocket natif (pinning + binaire, Noise hors WebView) ; secure storage
  (Keychain/Keystore) ; caméra/QR (ML Kit barcode scanning) ; push (phase 3).
- **Écrans** :
  - Appairage (scan QR) + gestion de la connexion/reconnexion.
  - Arborescence projets (responsive, repensée) + liste des conversations.
  - **Chat type WhatsApp** : bulles user/assistant, streaming du texte, chips d'outils,
    **cartes de permission** (Autoriser / Refuser), champ de saisie. **Aucune console.**
  - Réglages (langue, thème, appairages).

## Roadmap (phases)

- **Phase 0 — Fondations monorepo.** pnpm workspaces ; extraire `packages/shared` (types + i18n) ;
  scaffold `apps/mobile` (Capacitor + Vite + React + Tailwind + tokens CSS) ; squelette
  `packages/protocol`.
- **Phase 1 — Lien sécurisé LAN + lecture seule.** Serveur WS + Noise + QR pairing côté PC ;
  le mobile scanne, se connecte, liste projets/sessions, affiche un transcript en bulles, reçoit
  les updates live (watcher). *Prouve tout le tuyau de bout en bout.*
- **Phase 2 — Interactif complet.** Agent SDK côté PC ; saisie mobile → `userTurn` ; événements
  structurés → bulles + chips ; cartes de permission (`canUseTool`) ; verrou un-seul-écrivain.
- **Phase 3 — Accès distant (local) + notifications.** Générateur de config WireGuard en QR ;
  puis option Cloudflare Tunnel ; abstraction d'endpoint + `altEndpoints`. Push (« agent terminé /
  demande une permission ») pour compenser la suspension du WS en arrière-plan (iOS).
- **Phase 4 — Polissage UX mobile.** Reconnexion robuste, stockage sécurisé des clés, réglages,
  couverture i18n, **test perf chat** sur Android d'entrée de gamme (valide Capacitor ; sinon
  bascule documentée vers Expo/FlashList).
- **Phase 5 (plus tard) — Mode 2 cloud payant.** Relais WebSocket **zero-knowledge** auto-hébergé
  (VPS ~4–12 €/mois, tient des milliers de paires) ; pairing par JWT (`account_id`+`pairing_id`
  via `Sec-WebSocket-Protocol`) ; quotas par compte ; **gating Stripe** (entitlement vérifié à la
  connexion, jamais sur le flux). Honnêteté UX : zero-knowledge sur le **contenu**, le relais voit
  les **métadonnées**.

## Vérification (par phase)
- **Protocole** : tests unitaires du handshake Noise + anti-rejeu (vecteurs connus) ; un test
  d'interop PC↔mobile sur un message chiffré aller-retour.
- **Phase 1** : apparier un vrai device sur le LAN, lister les sessions réelles, ouvrir un
  transcript existant et vérifier le rendu en bulles ; modifier un `.jsonl` et voir l'update live.
- **Phase 2** : depuis le mobile, reprendre une session, envoyer un prompt, voir la réponse en
  streaming, déclencher un outil et **approuver/refuser depuis le téléphone**. Vérifier le verrou
  (impossible d'ouvrir la même session en TUI pendant le pilotage mobile).
- **Phase 3** : tester en 4G via WireGuard (vérifier au préalable IP publique vs CGNAT) puis via
  Cloudflare Tunnel ; couper/rétablir le réseau → reconnexion + notification.
- **Phase 4** : spike perf (transcript long synthétique + streaming) sur Android bas de gamme.

## Risques & points ouverts
- **Perf chat en WebView** sur Android bas de gamme : à valider tôt (critère de bascule vers RN).
- **Détails Agent SDK** (types d'événements exacts, reprise de session, comportement `canUseTool`) :
  valider par un spike avant de bâtir la Phase 2.
- **CGNAT** : le chemin WireGuard nécessite une IP publique + 1 port UDP ouvert — à vérifier chez
  le FAI avant de s'y engager (sinon Cloudflare Tunnel ou, plus tard, relais cloud).
- **WebSocket en arrière-plan (iOS)** : suspendu par l'OS → compenser par reconnexion au premier
  plan + **push**. Limite d'OS, pas de framework.
- **Verrou un-seul-écrivain** entre le dock TUI et le runtime mobile : à concevoir soigneusement.
- **Stockage des clés** : jamais dans le JS/localStorage — Keychain/Keystore via plugin.

## Références recherche (archivées)
- `docs/mobile-companion/research/` — comparatifs sourcés : accès distant/NAT, frameworks
  (Capacitor vs Expo vs RN), WireGuard userspace vs Noise-sur-WS, architecture local vs relais
  cloud zero-knowledge. (Validation externe : OpenAI Codex Remote — pairing QR + Noise IK +
  relais zero-knowledge.)
