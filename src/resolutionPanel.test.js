import assert from 'node:assert/strict';
import test from 'node:test';

import {
  displayResolutionSummary,
  primaryDisplay,
} from './resolutionModel.js';

const configuration = {
  displays: [
    { id: 2, name: 'External', main: false, currentWidth: 1920, currentHeight: 1080 },
    { id: 1, name: 'Built-in', main: true, currentWidth: 1728, currentHeight: 1117 },
  ],
};

test('selects the main display for the compact resolution summary', () => {
  assert.equal(primaryDisplay(configuration)?.id, 1);
  assert.equal(displayResolutionSummary(configuration), '1728 × 1117');
});

test('falls back cleanly when no display information is available', () => {
  assert.equal(primaryDisplay({ displays: [] }), null);
  assert.equal(displayResolutionSummary(null), null);
});
