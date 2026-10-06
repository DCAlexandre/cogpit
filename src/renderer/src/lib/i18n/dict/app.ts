// Strings used directly in App.tsx: boot/loading, bulk-selection bar, the
// session/project context menus, and confirm/alert dialogs.
const app = {
  fr: {
    'app.booting': 'Démarrage de Cogpit…',
    'app.scanning': 'Analyse des sessions…',
    'app.selected': '{count} sélectionnée(s)',
    'app.cancel': 'Annuler',
    'app.terminalOpenFailed': "Impossible d'ouvrir un terminal.",
    'app.confirmDelete': 'Supprimer définitivement « {title} » ?',
    'app.confirmTrashProject': 'Mettre {count} session(s) de « {name} » à la corbeille ?',

    'menu.resume': 'Reprendre',
    'menu.newConversation': 'Nouvelle conversation',
    'menu.rename': 'Renommer',
    'menu.pin': 'Épingler',
    'menu.unpin': 'Désépingler',
    'menu.favorite': 'Ajouter aux favoris',
    'menu.unfavorite': 'Retirer des favoris',
    'menu.openFolder': 'Ouvrir le dossier',
    'menu.openInIde': 'Ouvrir dans {ide}',
    'menu.trash': 'Mettre à la corbeille',
    'menu.deletePermanent': 'Supprimer définitivement',
    'menu.showProject': 'Afficher le projet',
    'menu.hideProject': 'Masquer le projet',
    'menu.trashProject': 'Mettre le projet à la corbeille'
  },
  en: {
    'app.booting': 'Starting Cogpit…',
    'app.scanning': 'Scanning sessions…',
    'app.selected': '{count} selected',
    'app.cancel': 'Cancel',
    'app.terminalOpenFailed': "Couldn't open a terminal.",
    'app.confirmDelete': 'Permanently delete “{title}”?',
    'app.confirmTrashProject': 'Move {count} session(s) from “{name}” to the trash?',

    'menu.resume': 'Resume',
    'menu.newConversation': 'New conversation',
    'menu.rename': 'Rename',
    'menu.pin': 'Pin',
    'menu.unpin': 'Unpin',
    'menu.favorite': 'Add to favorites',
    'menu.unfavorite': 'Remove from favorites',
    'menu.openFolder': 'Open folder',
    'menu.openInIde': 'Open in {ide}',
    'menu.trash': 'Move to trash',
    'menu.deletePermanent': 'Delete permanently',
    'menu.showProject': 'Show project',
    'menu.hideProject': 'Hide project',
    'menu.trashProject': 'Move project to trash'
  }
}
export default app
