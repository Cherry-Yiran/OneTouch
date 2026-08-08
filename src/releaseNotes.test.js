import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEW_FEATURE_IDS,
  NEW_FEATURES_VERSION,
  shouldShowNewFeatureBadges,
  updateCheckIsDue,
} from './releaseNotes.js';

test('shows lightweight feature badges once for formal and beta builds', () => {
  assert.equal(NEW_FEATURES_VERSION, '0.3.4');
  assert.deepEqual(NEW_FEATURE_IDS, ['clearDownloads']);
  assert.equal(shouldShowNewFeatureBadges('0.3.4', ''), true);
  assert.equal(shouldShowNewFeatureBadges('0.3.4-beta.1', ''), true);
  assert.equal(shouldShowNewFeatureBadges('0.3.4', '0.3.4'), false);
  assert.equal(shouldShowNewFeatureBadges('0.3.3', ''), false);
});

test('limits background update checks to once per day', () => {
  const now = 2_000_000_000_000;
  assert.equal(updateCheckIsDue('', now), true);
  assert.equal(updateCheckIsDue(String(now - 23 * 60 * 60 * 1000), now), false);
  assert.equal(updateCheckIsDue(String(now - 24 * 60 * 60 * 1000), now), true);
});
