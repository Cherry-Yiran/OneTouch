import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SYSTEM_SETTINGS_PANES,
  recoveryPaneForError,
} from './nativeErrors.js';

test('maps permission failures to a recoverable System Settings pane', () => {
  assert.equal(
    recoveryPaneForError('Accessibility permission is required'),
    SYSTEM_SETTINGS_PANES.ACCESSIBILITY,
  );
  assert.equal(
    recoveryPaneForError('Not authorized to send Apple events to System Events'),
    SYSTEM_SETTINGS_PANES.AUTOMATION,
  );
  assert.equal(
    recoveryPaneForError('Focus status permission was denied'),
    SYSTEM_SETTINGS_PANES.FOCUS,
  );
});

test('does not offer settings recovery for ordinary operation failures', () => {
  assert.equal(recoveryPaneForError('No external disks are connected'), null);
  assert.equal(recoveryPaneForError('The Bluetooth audio device did not respond'), null);
});
