import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

test('native popover clips the shell and content to one shared radius', () => {
  const shell = styles.match(/\.native-popover-shell\s*\{(?<rules>[\s\S]*?)\n\}/)?.groups?.rules ?? '';

  assert.match(shell, /--native-popover-corner-radius:\s*20px/);
  assert.match(shell, /overflow:\s*hidden/);
  assert.match(shell, /border-radius:\s*var\(--native-popover-corner-radius\)/);
  assert.match(
    styles,
    /\.native-popover-shell \.status-popover\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*var\(--native-popover-corner-radius\)/,
  );
});
