# Cogpit Companion — build status (autonomous run)

> Implémentation du MVP companion mobile : **pont Electron (Noise E2E) + app mobile
> (chat type WhatsApp + live)**. Écrit et vérifié en run autonome. **Aucun commit.**

## ✅ Ce qui est fait et vérifié par moi

| Élément | Vérif |
|---|---|
| Protocole Noise E2E (X25519 + ChaCha20-Poly1305, `@noble`), isomorphe Node/navigateur | `node scripts/mobile-selftest.ts` → **ALL GREEN** (interop, AEAD, rejet mauvaise clé/PSK) |
| Tuyau crypto+transport sur **vraie socket WebSocket** (`ws`) | `node scripts/mobile-e2e.ts` → **ALL GREEN** (AC1 handshake, **AC3 chiffré sur le fil**, AC4 scan chiffré, **AC5 mauvaise PSK rejetée**) |
| Pont Electron (serveur WS + appairage + scan/transcript + tail live + interaction) | `pnpm build` → **OK** (main 105 KB, `@noble` bundlé) |
| Câblage IPC + preload + réglages + auto-start/stop | `pnpm typecheck` → **OK** (web + node) |
| UI « Accès mobile » (toggle + QR + statut) dans les réglages | typecheck + build renderer **OK** |
| App mobile (Vite+React+Tailwind, Capacitor-ready) | `pnpm --dir apps/mobile build` → **OK** (dist, 182 KB) + `tsc --noEmit` **OK** |

**Critère de confidentialité respecté** : rien ne transite en clair — tout passe dans le canal Noise (même la liste des sessions). Preuve exécutée dans `mobile-e2e.ts` (AC3).

## ⏳ Ce que TOI tu dois tester (nécessite de lancer l'app réelle / un vrai téléphone)

Je n'ai pas pu exécuter l'app Electron complète (GUI) ni un vrai appareil ici. À vérifier :

1. **Lance le desktop** : `pnpm start`.
2. **Réglages → Accès mobile → activer**. (Windows demandera d'autoriser Node/Electron sur le réseau privé → accepte.)
3. Un **QR code** s'affiche. **Scanne-le** avec l'appareil photo du téléphone (même WiFi) → le navigateur ouvre l'app mobile servie par le pont.
4. Vérifie : **liste des conversations** groupées par projet → ouvre-en une → **chat type WhatsApp**.
5. **Live** : parle à Claude Code sur le PC dans cette session → les nouveaux messages apparaissent tout seuls sur le tél.

## ⚠️ Interaction (envoyer un message depuis le tél) — implémentée mais NON vérifiée

Le code est là (`src/main/mobile/interaction.ts`, cartes Autoriser/Refuser côté mobile), mais il dépend du **Claude Agent SDK** + d'un login `claude` sur le PC, que je n'ai pas pu valider.

- Par défaut : **lecture seule** (le champ de saisie est masqué, badge « Lecture seule »).
- Pour activer l'interaction : `pnpm add @anthropic-ai/claude-agent-sdk` puis relance. Le pont le détecte (lazy-require) ; si présent, le champ de saisie apparaît.
- Le mapping des événements du SDK est **défensif/best-effort** (l'API exacte peut varier) — à ajuster au premier test réel. Garde-fou **un-seul-écrivain** : ne pilote pas une session depuis le mobile pendant qu'elle tourne en terminal sur le PC.

## Architecture livrée (fichiers clés)

- **Protocole (partagé)** : `src/shared/mobile/{crypto,messages,pairing}.ts` — copié à l'identique dans `mobile/src/protocol/` (à unifier en `packages/protocol` plus tard).
- **Pont Electron** : `src/main/mobile/{server,identity,lan,interaction,index}.ts`. Servi + WS sur `:8790` (réglable via `settings.mobilePort`). Sert `mobile/dist`.
- **Câblage** : `src/main/ipc.ts` (`mobile:*`), `src/preload/index.ts` (`window.api.mobile`), `src/shared/types.ts` (+`MobileStatus`, `Settings.mobileAccess/mobilePort`), `src/main/index.ts` (auto-start + broadcast + stop), `src/main/lib/meta.ts` (défauts).
- **UI réglages** : `src/renderer/src/components/SettingsModal.tsx` (`MobileAccessSection`) + i18n `lib/i18n/dict/mobile.ts`.
- **App mobile** : `mobile/` (Vite+React+Tailwind+Capacitor, package workspace `cogpit-mobile`). Appairage via fragment d'URL (`#c1.<pub>.<psk>`) servi par le pont, OU **scan caméra natif** (`@capacitor-mlkit/barcode-scanning`). Le fragment n'est jamais envoyé au serveur.

## Décisions / écarts honnêtes

- **Handshake maison** (X25519+ChaCha20+PSK, pattern type Noise_NKpsk), **POC-grade** : pas d'anti-rejeu au-delà du compteur, pas de rekey. **À remplacer par `@chainsafe/libp2p-noise` (Noise_IK complet) avant prod.**
- **i18n mobile** = dictionnaire autonome (pas l'import direct des dicts desktop) pour un build robuste ; **tokens de thème copiés** (sous-ensemble) dans `apps/mobile/src/index.css`. Réutilisation à resserrer plus tard.
- **Transport** : LAN uniquement pour l'instant (WireGuard = même app, autre `host` ; Cloudflare = plus tard, le canal étant déjà E2E). **Aucune exposition externe dans ce build.**
- **Natif Capacitor** : config prête (`mobile/capacitor.config.ts`) + scan caméra inclus. Build natif / APK ci-dessous (nécessite le toolchain Android — non disponible dans mon environnement, donc **non exécuté** par moi).
- L'ancien POC sans chiffrement (`poc/`) est **superseded** — ne pas utiliser `poc/tunnel.cjs` (tunnel public non authentifié).

## Workspace pnpm & commandes mobile

`pnpm-workspace.yaml` déclare `mobile` comme package. Depuis la racine :

```bash
pnpm mobile:dev     # dev server Vite (test UI dans un navigateur)
pnpm mobile:build   # build web → mobile/dist (ce que le pont sert)
pnpm android        # build web + cap sync + lance sur un appareil/émulateur Android
pnpm ios            # idem iOS (macOS + Xcode requis)
pnpm apk            # build web + cap sync + génère un APK (cap build android)
```

Équivalents dans `mobile/` : `pnpm dev` / `pnpm build:web` / `pnpm android` / `pnpm ios` / `pnpm build` (APK).

> **Note honnête** : `pnpm build` **à la racine reste le build desktop (electron)** — je ne l'ai pas écrasé pour ne pas casser ton flux. L'APK, c'est `pnpm apk` (racine) ou `pnpm build` **dans `mobile/`**.
>
> **Prérequis APK (une fois)** : installer le toolchain Android (Android Studio + SDK + JDK 17), puis `cd mobile && pnpm build:web && npx cap add android`. Ensuite `pnpm apk`. L'APK de debug se trouve sous `mobile/android/app/build/outputs/apk/`. **Je n'ai pas pu produire l'APK ici** (pas de SDK Android).

## Rejouer les tests

```bash
node scripts/mobile-selftest.ts     # crypto (handshake + AEAD + rejets)
node scripts/mobile-e2e.ts          # tuyau sur vraie socket (AC1/AC3/AC4/AC5)
pnpm typecheck                      # desktop (web + node)
pnpm build                         # desktop complet (electron)
pnpm mobile:build                   # app mobile → mobile/dist
pnpm --filter cogpit-mobile typecheck   # typecheck app mobile
```
