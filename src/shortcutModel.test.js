import assert from 'node:assert/strict';
import test from 'node:test';

import {
  conflictingShortcutId,
  formatShortcut,
  restoreShortcuts,
  shortcutFromKeyboardEvent,
} from './shortcutModel.js';

test('records a command shortcut in the Tauri global shortcut format', () => {
  assert.deepEqual(
    shortcutFromKeyboardEvent({
      code: 'KeyK',
      key: 'k',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    }),
    { shortcut: 'CommandOrControl+Shift+K', reason: null },
  );
  assert.equal(formatShortcut('CommandOrControl+Shift+K'), '⌘ ⇧ K');
});

test('rejects unmodified keys so OneTouch cannot capture normal typing', () => {
  assert.equal(shortcutFromKeyboardEvent({
    code: 'KeyK',
    key: 'k',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  }).reason, 'modifier');
});

test('detects duplicates and drops stale stored controls', () => {
  assert.equal(conflictingShortcutId({ darkMode: 'CommandOrControl+D' }, 'awake', 'CommandOrControl+D'), 'darkMode');
  assert.deepEqual(
    restoreShortcuts('{"darkMode":"CommandOrControl+D","removed":"Alt+R"}', ['darkMode']),
    { darkMode: 'CommandOrControl+D' },
  );
});
