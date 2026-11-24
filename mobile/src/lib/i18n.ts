/** Minimal self-contained i18n for the mobile app (fr/en), same approach as the
 *  desktop. POC note: kept separate from the desktop dicts for a robust build;
 *  unify later if desired. */
type Dict = Record<string, string>

const fr: Dict = {
  'app.title': 'COGPIT',
  'pairing.needed': 'Appairage requis',
  'pairing.hint': 'Ouvre Cogpit sur ton PC → Réglages → Accès mobile, puis scanne le QR code.',
  'pairing.scan': 'Scanner le QR code',
  'pairing.scanning': 'Scan en cours…',
  'pairing.invalid': 'URL d’appairage invalide',
  'pairing.scanfail': 'Scan annulé ou échoué',
  'pairing.camdenied': 'Accès caméra refusé',
  'pairing.installing': 'Module scanner en cours d’installation — réessaie dans un instant',
  'state.connecting': 'Connexion…',
  'state.handshaking': 'Établissement du canal chiffré…',
  'state.closed': 'Déconnecté',
  'state.error.handshake': 'Échec du handshake (clé invalide ?)',
  'state.error.decrypt': 'Clé d’appairage invalide',
  'state.error.socket': 'Impossible de joindre le PC',
  'state.loading': 'Chargement des conversations…',
  'state.reconnect': 'Reconnecter',
  'state.repair': 'Changer d’appareil',
  'recent.title': 'Récentes',
  'projects.title': 'Projets',
  'projects.empty': 'Aucun projet',
  'projects.convos': 'conversations',
  'projects.convo': 'conversation',
  'list.title': 'Conversations',
  'list.empty': 'Aucune conversation',
  'list.msgs': 'msg',
  'list.agent': 'agent',
  'devices.title': 'Appareils associés',
  'devices.none': 'Aucun appareil associé pour le moment.',
  'devices.add': 'Associer un nouvel appareil',
  'devices.connect': 'Se connecter',
  'devices.remove': 'Dissocier',
  'devices.removeConfirm': 'Dissocier cet appareil ? Il faudra re-scanner le QR code pour le réassocier.',
  'devices.reconnecting': 'Reconnexion…',
  'nav.back': 'Retour',
  'chat.back': 'Retour',
  'chat.placeholder': 'Message…',
  'chat.send': 'Envoyer',
  'chat.readonly': 'Lecture seule (interaction indisponible sur le PC)',
  'chat.thinking': 'Claude réfléchit…',
  'role.you': 'vous',
  'role.claude': 'claude',
  'perm.title': 'Autoriser cet outil ?',
  'perm.allow': 'Autoriser',
  'perm.deny': 'Refuser',
  'secure.badge': 'chiffré E2E'
}

const en: Dict = {
  'app.title': 'COGPIT',
  'pairing.needed': 'Pairing required',
  'pairing.hint': 'Open Cogpit on your PC → Settings → Mobile access, then scan the QR code.',
  'pairing.scan': 'Scan QR code',
  'pairing.scanning': 'Scanning…',
  'pairing.invalid': 'Invalid pairing URL',
  'pairing.scanfail': 'Scan cancelled or failed',
  'pairing.camdenied': 'Camera access denied',
  'pairing.installing': 'Scanner module installing — retry in a moment',
  'state.connecting': 'Connecting…',
  'state.handshaking': 'Establishing encrypted channel…',
  'state.closed': 'Disconnected',
  'state.error.handshake': 'Handshake failed (wrong key?)',
  'state.error.decrypt': 'Invalid pairing key',
  'state.error.socket': 'Cannot reach the PC',
  'state.loading': 'Loading conversations…',
  'state.reconnect': 'Reconnect',
  'state.repair': 'Change device',
  'recent.title': 'Recent',
  'projects.title': 'Projects',
  'projects.empty': 'No projects',
  'projects.convos': 'conversations',
  'projects.convo': 'conversation',
  'list.title': 'Conversations',
  'list.empty': 'No conversations',
  'list.msgs': 'msg',
  'list.agent': 'agent',
  'devices.title': 'Paired devices',
  'devices.none': 'No paired devices yet.',
  'devices.add': 'Pair a new device',
  'devices.connect': 'Connect',
  'devices.remove': 'Unpair',
  'devices.removeConfirm': 'Unpair this device? You will need to re-scan the QR code to pair it again.',
  'devices.reconnecting': 'Reconnecting…',
  'nav.back': 'Back',
  'chat.back': 'Back',
  'chat.placeholder': 'Message…',
  'chat.send': 'Send',
  'chat.readonly': 'Read-only (interaction unavailable on the PC)',
  'chat.thinking': 'Claude is thinking…',
  'role.you': 'you',
  'role.claude': 'claude',
  'perm.title': 'Allow this tool?',
  'perm.allow': 'Allow',
  'perm.deny': 'Deny',
  'secure.badge': 'E2E encrypted'
}

const locale: 'fr' | 'en' = (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'
const DICT = locale === 'fr' ? fr : en

export function t(key: string): string {
  return DICT[key] ?? en[key] ?? key
}

export function relTime(iso: string | null): string {
  if (!iso) return ''
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return locale === 'fr' ? 'à l’instant' : 'just now'
  if (d < 3600) return `${Math.floor(d / 60)} min`
  if (d < 86400) return `${Math.floor(d / 3600)} h`
  return `${Math.floor(d / 86400)} j`
}
