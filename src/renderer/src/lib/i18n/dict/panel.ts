// SessionPanel + TranscriptView strings.
const panel = {
  fr: {
    // SessionPanel
    'panel.subAgent': 'sous-agent',
    'panel.rename': 'Renommer',
    'panel.resume': 'Reprendre',
    'panel.favorite': 'Favori',
    'panel.pin': 'Épingler',
    'panel.openFolder': 'Ouvrir le dossier',
    'panel.openInIde': 'Ouvrir dans {name}',
    'panel.trash': 'Mettre à la corbeille',
    'panel.tabOverview': 'Aperçu',
    'panel.tabDetails': 'Détails',
    'panel.fieldProject': 'Projet',
    'panel.fieldFolder': 'Dossier',
    'panel.fieldBranch': 'Branche',
    'panel.fieldClaudeVersion': 'Version Claude',
    'panel.fieldMessages': 'Messages',
    'panel.fieldCreated': 'Créée',
    'panel.fieldModified': 'Modifiée',
    'panel.fieldSize': 'Taille',
    'panel.fieldTitle': 'Titre',
    'panel.fieldId': 'ID',
    'panel.fieldFile': 'Fichier',
    'panel.dangerZone': 'Zone de danger',
    'panel.dangerDescription':
      'Supprime définitivement le fichier de session (sans passer par la corbeille).',
    'panel.deletePermanently': 'Supprimer définitivement',
    // TranscriptView
    'transcript.readError': 'Lecture impossible : {error}',
    'transcript.loading': 'Lecture de la conversation…',
    'transcript.empty': 'Aucun message lisible dans cette session.',
    'transcript.roleUser': 'Vous',
    'transcript.roleAssistant': 'Claude'
  } as Record<string, string>,
  en: {
    // SessionPanel
    'panel.subAgent': 'sub-agent',
    'panel.rename': 'Rename',
    'panel.resume': 'Resume',
    'panel.favorite': 'Favorite',
    'panel.pin': 'Pin',
    'panel.openFolder': 'Open folder',
    'panel.openInIde': 'Open in {name}',
    'panel.trash': 'Move to trash',
    'panel.tabOverview': 'Overview',
    'panel.tabDetails': 'Details',
    'panel.fieldProject': 'Project',
    'panel.fieldFolder': 'Folder',
    'panel.fieldBranch': 'Branch',
    'panel.fieldClaudeVersion': 'Claude version',
    'panel.fieldMessages': 'Messages',
    'panel.fieldCreated': 'Created',
    'panel.fieldModified': 'Modified',
    'panel.fieldSize': 'Size',
    'panel.fieldTitle': 'Title',
    'panel.fieldId': 'ID',
    'panel.fieldFile': 'File',
    'panel.dangerZone': 'Danger zone',
    'panel.dangerDescription':
      'Permanently deletes the session file (bypassing the trash).',
    'panel.deletePermanently': 'Delete permanently',
    // TranscriptView
    'transcript.readError': 'Unable to read: {error}',
    'transcript.loading': 'Reading the conversation…',
    'transcript.empty': 'No readable message in this session.',
    'transcript.roleUser': 'You',
    'transcript.roleAssistant': 'Claude'
  } as Record<string, string>
}
export default panel
