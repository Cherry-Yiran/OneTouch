const MODIFIER_CODES = new Set([
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'ShiftLeft',
  'ShiftRight',
]);

const SPECIAL_KEYS = new Map([
  [' ', 'Space'],
  ['ArrowUp', 'ArrowUp'],
  ['ArrowDown', 'ArrowDown'],
  ['ArrowLeft', 'ArrowLeft'],
  ['ArrowRight', 'ArrowRight'],
  ['Enter', 'Enter'],
  ['Tab', 'Tab'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['PageUp', 'PageUp'],
  ['PageDown', 'PageDown'],
  ['Escape', 'Escape'],
]);

const CODE_KEYS = new Map([
  ['Backquote', 'Backquote'],
  ['Minus', 'Minus'],
  ['Equal', 'Equal'],
  ['BracketLeft', 'BracketLeft'],
  ['BracketRight', 'BracketRight'],
  ['Backslash', 'Backslash'],
  ['Semicolon', 'Semicolon'],
  ['Quote', 'Quote'],
  ['Comma', 'Comma'],
  ['Period', 'Period'],
  ['Slash', 'Slash'],
]);

function shortcutKey(event) {
  if (MODIFIER_CODES.has(event.code)) return null;
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key;
  return SPECIAL_KEYS.get(event.key) || CODE_KEYS.get(event.code) || null;
}

export function shortcutFromKeyboardEvent(event) {
  const key = shortcutKey(event);
  if (!key) return { shortcut: null, reason: 'key' };
  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    return { shortcut: null, reason: 'modifier' };
  }

  const parts = [];
  if (event.metaKey) parts.push('CommandOrControl');
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return { shortcut: parts.join('+'), reason: null };
}

export function formatShortcut(shortcut) {
  if (!shortcut) return '';
  const symbols = {
    CommandOrControl: '⌘',
    Control: '⌃',
    Alt: '⌥',
    Shift: '⇧',
    Space: 'Space',
  };
  return shortcut.split('+').map((part) => symbols[part] || part).join(' ');
}

export function conflictingShortcutId(shortcuts, id, shortcut) {
  return Object.entries(shortcuts || {})
    .find(([candidateId, candidate]) => candidateId !== id && candidate === shortcut)?.[0] || null;
}

export function restoreShortcuts(value, validIds) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, shortcut]) => (
        validIds.includes(id) && typeof shortcut === 'string' && shortcut.length > 0
      )),
    );
  } catch {
    return {};
  }
}
