import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampVisibleControlIds,
  toggleVisibleControl,
} from './visibility.js';

test('restored visible controls keep every unique selection', () => {
  const restored = Array.from({ length: 12 }, (_, index) => `control-${index}`);
  assert.deepEqual(clampVisibleControlIds([...restored, 'control-3']), restored);
});

test('a selected control can be removed from an unrestricted selection', () => {
  const selected = Array.from({ length: 12 }, (_, index) => `control-${index}`);
  assert.deepEqual(
    toggleVisibleControl(selected, 'control-3'),
    selected.filter((id) => id !== 'control-3'),
  );
});

test('any number of controls can be selected', () => {
  const selected = Array.from({ length: 12 }, (_, index) => `control-${index}`);
  assert.deepEqual(toggleVisibleControl(selected, 'control-12'), [...selected, 'control-12']);
});
