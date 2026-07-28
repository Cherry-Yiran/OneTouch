import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampVisibleControlIds,
  MAX_VISIBLE_CONTROLS,
  toggleVisibleControl,
} from './visibility.js';

test('restored visible controls are capped at eight', () => {
  const restored = Array.from({ length: 12 }, (_, index) => `control-${index}`);
  assert.deepEqual(
    clampVisibleControlIds(restored),
    restored.slice(0, MAX_VISIBLE_CONTROLS),
  );
});

test('a ninth control cannot be selected', () => {
  const selected = Array.from({ length: MAX_VISIBLE_CONTROLS }, (_, index) => `control-${index}`);
  assert.deepEqual(toggleVisibleControl(selected, 'control-9'), selected);
});

test('a selected control can be removed at the limit', () => {
  const selected = Array.from({ length: MAX_VISIBLE_CONTROLS }, (_, index) => `control-${index}`);
  assert.deepEqual(
    toggleVisibleControl(selected, 'control-3'),
    selected.filter((id) => id !== 'control-3'),
  );
});

test('an available slot accepts one more control', () => {
  const selected = Array.from({ length: MAX_VISIBLE_CONTROLS - 1 }, (_, index) => `control-${index}`);
  assert.deepEqual(toggleVisibleControl(selected, 'control-7'), [...selected, 'control-7']);
});
