// TrashModal + NewSessionModal + RenameModal strings.
const modals = {
  fr: {
    // TrashModal
    'trash.title': 'Corbeille',
    'trash.hintBefore': 'Les sessions restaurées réapparaissent dans',
    'trash.hintAfter': 'et redeviennent reprenables.',
    'trash.empty': 'Vider la corbeille',
    'trash.loading': 'Chargement…',
    'trash.emptyState': 'La corbeille est vide.',
    'trash.deletedAt': 'supprimée {when}',
    'trash.restore': 'Restaurer',
    'trash.deleteForever': 'Supprimer définitivement',
    // NewSessionModal
    'newsession.title': 'Nouvelle session',
    'newsession.introBefore': 'Lance',
    'newsession.introAfter': 'dans le dossier de ton choix.',
    'newsession.browse': 'Parcourir un dossier…',
    'newsession.recentProjects': 'projets récents',
    'newsession.filterPlaceholder': 'filtrer…',
    'newsession.noMatch': 'Aucun projet ne correspond.',
    // RenameModal
    'rename.title': 'Renommer la session',
    'rename.cancel': 'Annuler',
    'rename.save': 'Enregistrer',
    'rename.hint': "Un titre vide rétablit le titre d'origine. Le fichier de session n'est pas modifié.",
    'rename.placeholder': 'Titre de la session'
  } as Record<string, string>,
  en: {
    // TrashModal
    'trash.title': 'Trash',
    'trash.hintBefore': 'Restored sessions reappear in',
    'trash.hintAfter': 'and can be resumed again.',
    'trash.empty': 'Empty trash',
    'trash.loading': 'Loading…',
    'trash.emptyState': 'The trash is empty.',
    'trash.deletedAt': 'deleted {when}',
    'trash.restore': 'Restore',
    'trash.deleteForever': 'Delete permanently',
    // NewSessionModal
    'newsession.title': 'New session',
    'newsession.introBefore': 'Run',
    'newsession.introAfter': 'in the folder of your choice.',
    'newsession.browse': 'Browse a folder…',
    'newsession.recentProjects': 'recent projects',
    'newsession.filterPlaceholder': 'filter…',
    'newsession.noMatch': 'No matching project.',
    // RenameModal
    'rename.title': 'Rename session',
    'rename.cancel': 'Cancel',
    'rename.save': 'Save',
    'rename.hint': "An empty title restores the original title. The session file is not modified.",
    'rename.placeholder': 'Session title'
  } as Record<string, string>
}
export default modals
