import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELEASE_NOTES,
  RELEASE_NOTES_VERSION,
  shouldPresentReleaseNotes,
  updateCheckIsDue,
} from './releaseNotes.js';

test('shows the current release notes once for formal and beta builds', () => {
  assert.equal(RELEASE_NOTES_VERSION, '0.3.3');
  assert.equal(shouldPresentReleaseNotes('0.3.3', ''), true);
  assert.equal(shouldPresentReleaseNotes('0.3.3-beta.1', ''), true);
  assert.equal(shouldPresentReleaseNotes('0.3.3', '0.3.3'), false);
  assert.equal(shouldPresentReleaseNotes('0.3.2', ''), false);
  assert.equal(RELEASE_NOTES.zh.items.length, 3);
  assert.equal(RELEASE_NOTES.en.items.length, 3);
});

test('limits background update checks to once per day', () => {
  const now = 2_000_000_000_000;
  assert.equal(updateCheckIsDue('', now), true);
  assert.equal(updateCheckIsDue(String(now - 23 * 60 * 60 * 1000), now), false);
  assert.equal(updateCheckIsDue(String(now - 24 * 60 * 60 * 1000), now), true);
});
