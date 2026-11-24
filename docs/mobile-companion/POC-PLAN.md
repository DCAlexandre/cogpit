# POC companion mobile — plan (révisé, avec Noise E2E)

> Statut : **plan à valider avant exécution.** Le code vit dans `poc/` (jetable, gitignoré).
> Ce POC valide les théories risquées AVANT de bâtir l'archi réelle (`PLAN.md`).

## Ce qui change vs le 1er POC

Le 1er POC était **sans chiffrement** → passer par Cloudflare exposait le contenu en clair
(rejeté, car viole « rester privé »). **Révision : le POC intègre Noise (E2E).** Le contenu
est alors chiffré **sur tous les transports**, y compris Cloudflare (qui ne voit que du
chiffré). On valide donc d'un coup : **streaming + E2E + joignabilité distante privée**.

Décisions actées : **Noise utilisé dans TOUS les modes** ; produit = LAN → WireGuard →
Cloudflare (toujours avec Noise).

## Objectifs (théories à prouver)

1. **Streaming** PC→mobile rendu en chat, **dans le canal chiffré**.
2. **Canal E2E** : handshake + AEAD en **pur JS (`@noble`)**, tournant dans un navigateur
   (proxy fidèle de la future WebView Capacitor).
3. **Joignabilité à distance** via **WireGuard** (privé) ET **Cloudflare** — ce dernier
   acceptable **uniquement parce que** le contenu est E2E.
4. **Authentification du PC** par clé publique **épinglée** (via QR) → empêche tout MITM,
   y compris Cloudflare.

## Critères d'acceptation (le « double check »)

- **[AC1]** Le téléphone fait le handshake et affiche la liste + un transcript, **en LAN et via Cloudflare**.
- **[AC2]** **Live** : un nouveau message côté PC apparaît tout seul sur le tél (dans le canal chiffré).
- **[AC3]** **Preuve de confidentialité** : les octets réellement envoyés « sur le fil » (log serveur
  de ce qui part + ce que Cloudflare relaie) sont du **chiffré** — aucun texte de conversation lisible.
  Seul le tél (avec la clé) déchiffre.
- **[AC4]** **Aucun endpoint en clair** : aucune route ne renvoie de contenu non chiffré
  (contrairement au 1er POC). Même la liste des sessions passe dans le canal Noise.
- **[AC5]** **Épinglage** : une connexion sans la bonne clé publique du PC **échoue** au handshake.
- **[AC6]** **Critère global** : aucun contenu en clair exposé à l'extérieur, sur aucun transport.

## Périmètre

**DANS :** WebSocket binaire ; handshake X25519 + AEAD ChaCha20-Poly1305 (`@noble`) ; page
navigateur (chat type WhatsApp) ; serveur Node lisant `~/.claude` en lecture seule ; tunnel
Cloudflare optionnel ; appairage par QR (clé publique PC dans le **fragment** d'URL, jamais
transmis au serveur ni à Cloudflare).

**HORS :** Capacitor ; stockage Keychain/Keystore ; Noise_IK complet / anti-rejeu / rekey
(le POC = handshake minimal mais sain ; le **produit** utilisera une lib Noise auditée) ;
interaction / Agent SDK (= POC-B).

## Conception

- **`poc/noise.mjs`** — crypto partagée (handshake + framing AEAD), importée côté serveur **et**
  navigateur. PC = keypair statique X25519 (générée au 1er run, stockée en fichier local). Le tél
  génère un éphémère, fait l'ECDH avec la clé statique **épinglée** du PC → clés de session AEAD
  (schéma type Noise IK simplifié : justifie « illisible pour un tiers » + « PC authentifié »).
- **`poc/server.mjs`** — serveur WS : handshake côté PC, puis répond **chiffré** (liste sessions /
  stream transcript ; réutilise la lecture JSONL du `server.cjs` actuel).
- **`poc/index.html` (+ client)** — lit la clé publique PC depuis le **fragment** (`#<pub>`), fait
  le handshake, déchiffre, rend le chat.
- **`poc/tunnel.mjs`** *(optionnel)* — quick tunnel Cloudflare vers le WS ; l'URL affichée (QR)
  contient `#<pub>` (fragment = jamais envoyé au serveur ni à Cloudflare).
- **Appairage POC** — le PC imprime un **QR** = `http(s)://<host>/#<clé-pub-PC>`. Le tél le scanne →
  il a l'URL **et** la clé à épingler.

## Exécution (ce que je lancerai APRÈS ton accord)

1. Remplacer les fichiers en clair par les versions chiffrées (supprimer `server.cjs` / `tunnel.cjs`).
2. `npm install` dans `poc/` : `@noble/ciphers`, `@noble/curves` (+ `cloudflared`, `qrcode-terminal` déjà là).
3. **Test LAN** (toi, navigateur du tél) → AC1 / AC2 / AC4 / AC5.
4. **Preuve chiffré** (AC3) : je logge les octets réellement envoyés + tu vérifies qu'ils sont
   illisibles ; test d'une connexion **sans** la clé (échec attendu).
5. *(Optionnel)* **Cloudflare** : **toi** tu lances le tunnel (ou via `!`), on refait AC1/AC2 à
   distance et on confirme AC3 (Cloudflare ne relaie que du chiffré). → le garde-fou ne bloquera
   plus, puisqu'il n'y a plus de contenu en clair exposé.

## Risques / notes

- **Crypto maison = POC uniquement.** Le produit utilisera **`@chainsafe/libp2p-noise`**
  (Noise_IK complet) — ne jamais expédier le handshake maison.
- Navigateur (POC) ≈ WebView (produit) pour le JS/crypto ; le produit utilisera un **plugin WS
  natif** (pinning / binaire) — non requis ici (ws:// + Noise en LAN ; wss valide via Cloudflare).
- Noise minimal du POC : pas d'anti-rejeu/rekey → acceptable pour une démo courte, pas pour la prod.
