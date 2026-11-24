# Cogpit Companion — Notes de recherche (sourcées)

Conclusions des 4 recherches menées pendant la conception. Résumé décisionnel + sources ;
les rapports longs ont servi à rédiger `../PLAN.md`.

## 1. Accès distant / NAT / WireGuard

**Le fondamental NAT :** joindre un PC derrière NAT depuis l'extérieur, **sans port ouvert ET
sans serveur intermédiaire, est impossible** (loi du NAT). Il faut *soit* 1 port forwardé,
*soit* un rendez-vous/relais que les deux atteignent (le PC sort toujours). Le « hole punching »
échoue sur NAT symétrique/CGNAT → repli relais (TURN/DERP).

**Options retenues :** LAN direct (défaut, zéro config) ; WireGuard via **app officielle** +
config en QR (1 port UDP + IP publique, pas de CGNAT) ; tunnels sortants (**Cloudflare Tunnel**
sans routeur ; **rathole/chisel/frp** auto-hébergés) ; mesh (Headscale/NetBird/Tailscale) si
besoin de zéro config routeur mais app tierce. Embarquer WireGuard dans l'app = VPN système
(semaines de natif + 99 $/an Apple + VpnService) → **écarté**.

Sources : WireGuard protocol/paper ; Tailscale connection-types & DERP ; Headscale ; frp/rathole/
bore/chisel ; Cloudflare Tunnel ; Apple NetworkExtension ; Android VpnService.

## 2. Framework mobile — Capacitor vs Expo vs RN bare

**Facteur décisif = réutilisation du design system CSS** (thème ambre, scanlines, glow, LEDs,
variantes palette/police/échelle). Capacitor le rend **verbatim** (+ i18n + types ~100%) ; RN ne
peut pas utiliser Tailwind-web ni les variables CSS → reconstruire et **maintenir 2 design systems
à vie**. Seul avantage RN : chat natif (FlashList ~10×/5× FPS vs FlatList sur Android bas de gamme)
→ solvable en WebView virtualisée, **à valider par un spike**. Contraintes WS en arrière-plan =
limite d'OS (iOS suspend), pas de framework → reconnexion + push.

**Décision : Capacitor.** Sources : Shopify FlashList v2 ; Apple Dev Forums (WS background) ;
Capacitor ML Kit barcode ; Expo Push ; comparatifs (cross-checkés, blogs vendor-adjacents signalés).

## 3. WireGuard userspace vs Noise-sur-WebSocket

« Semaines de natif » = vrai **seulement pour un VPN système**. WireGuard *userspace* in-app
(wireguard-go/boringtun + netstack gVisor, cf. Tailscale `tsnet`/`libtailscale`) évite l'entitlement
mais = 1–3 semaines Go/Rust + pont par plateforme à maintenir (aucun binding RN/Capacitor mûr).

**Verdict : Noise-sur-WebSocket en pur JS.** WireGuard = protocole Noise ; on fait **Noise_IK
(/IKpsk2) sur `@noble/ciphers` + `@noble/curves`** (audités Cure53 2024, pur TS, tournent en WebView
Capacitor ET RN). Garanties E2E équivalentes (auth mutuelle via clé du QR, forward secrecy, AEAD,
anti-rejeu), **sans code natif, sans VPN, sans entitlement**, en *jours*. Seule option permettant un
**relais zero-knowledge** (le relais ne voit que du chiffré). Éviter `noise-c.wasm` (abandonné) et la
dépendance à `crypto.subtle` (bridée en scheme Capacitor) ; clé statique en Keychain/Keystore.

**Validation externe : OpenAI Codex Remote** a shippé exactement ce pattern (QR pairing → Noise IK →
relais zero-knowledge). Sources : WireGuard protocol ; noble-ciphers/curves ; js-libp2p-noise ;
Tailscale tsnet/netstack ; Codex Remote GA.

## 4. Architecture 2 modes (local vs relais cloud zero-knowledge)

**Clé :** comme le payload est Noise-E2E, la question « peut-il lire mes conversations ? » devient
« quelles **métadonnées** voit-il ? » (jamais le contenu). Les 2 modes partagent **un seul code
mobile** derrière une abstraction d'endpoint (même schéma de QR ; seul le `host` change).

**Mode 1 (local, gratuit) :** LAN direct (ws:// + Noise via **plugin WS natif** — la WebView JS ne
peut pas épingler un certif auto-signé ; mDNS pour résilience IP) ; WireGuard (QR) ; Cloudflare
Tunnel / rathole (sortant).

**Mode 2 (cloud, payant, plus tard) :** **relais WebSocket zero-knowledge** — PC et tél sortent en
WSS, le relais appaire par **JWT** (`account_id`+`pairing_id` via `Sec-WebSocket-Protocol`) et recopie
des frames chiffrées **sans clé Noise** (sémantique DERP). Un **petit VPS (~4–12 €/mois) tient des
milliers de paires** (idle, texte ; ~15 KB/connexion). Quotas par compte (octets/débit) =
compatibles zero-knowledge. **Gating Stripe** par entitlement vérifié à la connexion (webhook →
DB locale → JWT court), jamais sur le flux. **Honnêteté UX obligatoire** : zero-knowledge sur le
contenu, mais observateur de **métadonnées** (graphe qui-parle-à-qui, IP, timing, volumes).

Build block recommandé : **relais WS from-scratch** (rooms = primitive d'appairage) ; s'inspirer de
coturn (HMAC éphémère + quotas) pour l'auth multi-tenant ; DERP comme preuve du zero-knowledge.
Sharding par pairing-id + Redis/NATS en backplane quand la charge viendra (pas avant).

Sources : Noise spec ; WireGuard paper (Noise_IK) ; Tailscale DERP / how-it-works ; RFC 6455/6762/
7519 ; Apple DTS (WKWebView ne surcharge pas le trust TLS du WS) ; coturn ; socket.io rooms + Redis
adapter ; Phoenix 2M websockets / "A Million WebSockets and Go" ; Stripe Billing/Entitlements/webhooks ;
OWASP (secrets en query string).
