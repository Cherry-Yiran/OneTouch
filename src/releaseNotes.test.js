import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEW_FEATURE_IDS,
  NEW_FEATURES_VERSION,
  shouldShowNewFeatureBadges,
  updateCheckIsDue,
} from './releaseNotes.js';

test('does not show a feature badge when no new controls remain', () => {
  assert.equal(NEW_FEATURES_VERSION, '1.1.0');
  assert.deepEqual(NEW_FEATURE_IDS, []);
  assert.equal(shouldShowNewFeatureBadges('1.1.0', ''), false);
  assert.equal(shouldShowNewFeatureBadges('1.1.0-beta.1', ''), false);
  assert.equal(shouldShowNewFeatureBadges('1.1.0', '1.1.0'), false);
  assert.equal(shouldShowNewFeatureBadges('1.0.0', ''), false);
});

test('limits background update checks to once per day', () => {
  const now = 2_000_000_000_000;
  assert.equal(updateCheckIsDue('', now), true);
  assert.equal(updateCheckIsDue(String(now - 23 * 60 * 60 * 1000), now), false);
  assert.equal(updateCheckIsDue(String(now - 24 * 60 * 60 * 1000), now), true);
});
