import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CONTROL_KINDS,
  controlKind,
  controlSwitchState,
  quitAppsRequestCount,
  usesSwitchAffordance,
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
  assert.equal(controlKind('clearDownloads'), CONTROL_KINDS.ACTION);
  assert.equal(controlKind('quitApps'), CONTROL_KINDS.ACTION);
});

test('reads the number of applications that received a normal quit request', () => {
  assert.equal(quitAppsRequestCount('quit-apps-requested:7'), 7);
  assert.equal(quitAppsRequestCount('quit-apps-requested:0'), 0);
  assert.equal(quitAppsRequestCount('unexpected'), null);
});

test('persistent, one-time, and direct-choice controls share the switch affordance', () => {
  assert.equal(usesSwitchAffordance(CONTROL_KINDS.TOGGLE), true);
  assert.equal(usesSwitchAffordance(CONTROL_KINDS.ACTION), true);
  assert.equal(usesSwitchAffordance(CONTROL_KINDS.CHOICE), true);
  assert.equal(usesSwitchAffordance(CONTROL_KINDS.SETTINGS), false);
});

test('classifies direct system selections as choices', () => {
  assert.equal(controlKind('resolution'), CONTROL_KINDS.CHOICE);
  assert.equal(usesSwitchAffordance(controlKind('resolution')), true);
  assert.deepEqual(
    controlSwitchState(CONTROL_KINDS.CHOICE, false, { pending: true }),
    { checked: true, locked: true },
  );
});

test('one-time actions use the same direct switch interaction', () => {
  for (const id of ['xcodeClean', 'emptyTrash', 'clearDownloads', 'ejectDisk', 'clipboard']) {
    assert.equal(controlKind(id), CONTROL_KINDS.ACTION);
    assert.equal(usesSwitchAffordance(controlKind(id)), true);
  }
});

test('one-time action stays on only while processing, then turns off for its result', () => {
  assert.deepEqual(
    controlSwitchState(CONTROL_KINDS.ACTION, false),
    { checked: false, locked: false },
  );
  assert.deepEqual(
    controlSwitchState(CONTROL_KINDS.ACTION, false, { pending: true }),
    { checked: true, locked: true },
  );
  assert.deepEqual(
    controlSwitchState(CONTROL_KINDS.ACTION, false, { completed: true }),
    { checked: false, locked: true },
  );
  assert.deepEqual(
    controlSwitchState(CONTROL_KINDS.ACTION, false),
    { checked: false, locked: false },
  );
});

test('the app never gates a one-time switch behind a second confirmation click', () => {
  const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /requiresConfirmation|confirmingActionId/);
  assert.match(appSource, /MIN_ACTION_PROGRESS_MS/);
  assert.match(appSource, /COMPLETION_FEEDBACK_MS/);
  assert.match(appSource, /正在处理中…/);
  assert.match(appSource, /trash-already-empty/);
  assert.match(appSource, /垃圾桶已经空了/);
  assert.match(appSource, /downloads-already-empty/);
  assert.match(appSource, /下载文件夹已经空了/);
});
