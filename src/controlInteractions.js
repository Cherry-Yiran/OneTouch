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
  'clearDownloads',
  'ejectDisk',
  'clipboard',
  'hideWindow',
  'displaySleep',
  'lockScreen',
  'quitApps',
]);

const CHOICE_CONTROL_IDS = new Set(['resolution']);
const SETTINGS_CONTROL_IDS = new Set();

export function controlKind(id) {
  if (CHOICE_CONTROL_IDS.has(id)) return CONTROL_KINDS.CHOICE;
  if (SETTINGS_CONTROL_IDS.has(id)) return CONTROL_KINDS.SETTINGS;
  if (ACTION_CONTROL_IDS.has(id)) return CONTROL_KINDS.ACTION;
  return CONTROL_KINDS.TOGGLE;
}

export function usesSwitchAffordance(kind) {
  return kind === CONTROL_KINDS.TOGGLE || kind === CONTROL_KINDS.ACTION;
}

export function controlSwitchState(kind, currentState, { pending = false, completed = false } = {}) {
  if (kind === CONTROL_KINDS.ACTION) {
    return {
      checked: Boolean(pending),
      locked: Boolean(pending || completed),
    };
  }
  return {
    checked: kind === CONTROL_KINDS.TOGGLE && Boolean(currentState),
    locked: false,
  };
}

export function quitAppsRequestCount(message) {
  const match = /^quit-apps-requested:(\d+)$/.exec(String(message || ''));
  return match ? Number(match[1]) : null;
}
