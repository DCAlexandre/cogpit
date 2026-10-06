// TerminalDock + TerminalView + BootSequence + WindowControls strings.
const terminal = {
  fr: {
    // TerminalDock
    'dock.resize': 'Redimensionner',
    'dock.label': 'terminaux',
    'dock.closeSession': 'Fermer la session',
    'dock.show': 'Afficher les terminaux',
    'dock.collapse': 'Réduire (les sessions continuent de tourner)',
    'dock.showAria': 'Afficher les terminaux',
    'dock.collapseAria': 'Réduire le dock, sessions conservées',
    // TerminalView
    'terminal.ended': '\r\n\x1b[2m— session terminée —\x1b[0m',
    'terminal.unavailable': '\x1b[31mTerminal intégré indisponible.\x1b[0m',
    'terminal.opened': 'Terminal ouvert ({via}).',
    'terminal.openFailed': "Aucun terminal n'a pu être lancé.",
    'terminal.fallbackIntro':
      "Le terminal intégré n'est pas disponible. Cogpit ouvrira ta console habituelle dans le bon dossier.",
    'terminal.folder': 'dossier',
    'terminal.command': 'commande',
    'terminal.copyCommand': 'Copier la commande',
    'terminal.openInTerminal': 'Ouvrir dans un terminal',
    // BootSequence
    'boot.powerOn': 'mise sous tension du poste',
    // WindowControls
    'window.minimize': 'Réduire',
    'window.restore': 'Restaurer',
    'window.maximize': 'Agrandir',
    'window.close': 'Fermer'
  },
  en: {
    // TerminalDock
    'dock.resize': 'Resize',
    'dock.label': 'terminals',
    'dock.closeSession': 'Close session',
    'dock.show': 'Show terminals',
    'dock.collapse': 'Collapse (sessions keep running)',
    'dock.showAria': 'Show terminals',
    'dock.collapseAria': 'Collapse the dock, sessions preserved',
    // TerminalView
    'terminal.ended': '\r\n\x1b[2m— session ended —\x1b[0m',
    'terminal.unavailable': '\x1b[31mIntegrated terminal unavailable.\x1b[0m',
    'terminal.opened': 'Terminal opened ({via}).',
    'terminal.openFailed': 'No terminal could be launched.',
    'terminal.fallbackIntro':
      'The integrated terminal is not available. Cogpit will open your usual console in the right folder.',
    'terminal.folder': 'folder',
    'terminal.command': 'command',
    'terminal.copyCommand': 'Copy the command',
    'terminal.openInTerminal': 'Open in a terminal',
    // BootSequence
    'boot.powerOn': 'powering on the deck',
    // WindowControls
    'window.minimize': 'Minimize',
    'window.restore': 'Restore',
    'window.maximize': 'Maximize',
    'window.close': 'Close'
  }
}
export default terminal
