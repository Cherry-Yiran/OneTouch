import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const diskPanel = await readFile(new URL('./DiskPanel.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

test('the remaining disk secondary view keeps its enter and exit transition', () => {
  assert.match(diskPanel, /secondary-panel/);
  assert.match(diskPanel, /is-closing/);
  assert.match(styles, /@keyframes secondary-panel-enter/);
  assert.match(styles, /@keyframes secondary-panel-exit/);
  assert.match(styles, /\.secondary-panel\.is-closing/);
  assert.match(styles, /translateY\(4px\)/);
  assert.doesNotMatch(styles, /secondary-panel-enter[\s\S]*?translateX\(/);
});

test('secondary page exit respects reduced motion', () => {
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /reducedMotion \? 0 : SECONDARY_PANEL_EXIT_MS/);
});
