import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

test('native general settings stay centered in the available content area', () => {
  const panel = styles.match(
    /\.native-preferences-shell \.general-panel\s*\{(?<rules>[\s\S]*?)\n\}/,
  )?.groups?.rules ?? '';

  assert.match(panel, /display:\s*flex/);
  assert.match(panel, /align-items:\s*center/);
  assert.match(panel, /justify-content:\s*center/);
  assert.match(panel, /margin:\s*0/);
});
