export const CONTROL_KINDS = Object.freeze({
  TOGGLE: 'toggle',
  ACTION: 'action',
  CHOICE: 'choice',
  SETTINGS: 'settings',
});

const ACTION_CONTROL_IDS = new Set([
  'screenSaver',
  'frontApp',
  'xcodeClean',
  'emptyTrash',
  'ejectDisk',
  'clipboard',
  'hideWindow',
  'displaySleep',
  'lockScreen',
]);

const CHOICE_CONTROL_IDS = new Set(['resolution']);
const SETTINGS_CONTROL_IDS = new Set();

const DESTRUCTIVE_CONTROL_IDS = new Set([
  'xcodeClean',
  'emptyTrash',
  'ejectDisk',
  'clipboard',
]);

export function controlKind(id) {
  if (CHOICE_CONTROL_IDS.has(id)) return CONTROL_KINDS.CHOICE;
  if (SETTINGS_CONTROL_IDS.has(id)) return CONTROL_KINDS.SETTINGS;
  if (ACTION_CONTROL_IDS.has(id)) return CONTROL_KINDS.ACTION;
  return CONTROL_KINDS.TOGGLE;
}

export function requiresConfirmation(id) {
  return DESTRUCTIVE_CONTROL_IDS.has(id);
}
