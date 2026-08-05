export const SYSTEM_SETTINGS_PANES = Object.freeze({
  ACCESSIBILITY: 'accessibility',
  AUTOMATION: 'automation',
  BLUETOOTH: 'bluetooth',
  FOCUS: 'focus',
  FILES_AND_FOLDERS: 'filesAndFolders',
});

export function recoveryPaneForError(error) {
  const message = String(error || '');
  if (/Accessibility permission|assistive access/i.test(message)) {
    return SYSTEM_SETTINGS_PANES.ACCESSIBILITY;
  }
  if (/Automation permission|Apple events|not authorized to send/i.test(message)) {
    return SYSTEM_SETTINGS_PANES.AUTOMATION;
  }
  if (/Focus status permission/i.test(message)) {
    return SYSTEM_SETTINGS_PANES.FOCUS;
  }
  if (/Bluetooth permission/i.test(message)) {
    return SYSTEM_SETTINGS_PANES.BLUETOOTH;
  }
  if (/Downloads folder access/i.test(message)) {
    return SYSTEM_SETTINGS_PANES.FILES_AND_FOLDERS;
  }
  return null;
}
