import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROL_KINDS,
  controlKind,
  requiresConfirmation,
} from './controlInteractions.js';

test('classifies persistent controls as toggles', () => {
  assert.equal(controlKind('darkMode'), CONTROL_KINDS.TOGGLE);
  assert.equal(controlKind('cleanScreen'), CONTROL_KINDS.TOGGLE);
  assert.equal(controlKind('hideWidgets'), CONTROL_KINDS.TOGGLE);
  assert.equal(controlKind('stageManager'), CONTROL_KINDS.TOGGLE);
});

test('classifies one-time operations as actions', () => {
  assert.equal(controlKind('screenSaver'), CONTROL_KINDS.ACTION);
  assert.equal(controlKind('emptyTrash'), CONTROL_KINDS.ACTION);
});

test('classifies direct system selections as choices', () => {
  assert.equal(controlKind('resolution'), CONTROL_KINDS.CHOICE);
});

test('only potentially destructive actions require confirmation', () => {
  for (const id of ['xcodeClean', 'emptyTrash', 'ejectDisk', 'clipboard']) {
    assert.equal(requiresConfirmation(id), true);
  }
  assert.equal(requiresConfirmation('screenSaver'), false);
  assert.equal(requiresConfirmation('darkMode'), false);
});
