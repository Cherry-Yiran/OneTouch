import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const rust = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const timers = await readFile(new URL('./timerModel.js', import.meta.url), 'utf8');

test('removed closed-lid control cannot return through UI, native state, or timers', () => {
  for (const source of [app, rust, timers]) {
    assert.doesNotMatch(source, /agentMode|Closed-lid work|合盖运行/);
  }
  assert.doesNotMatch(rust, /agent_caffeinate|set_agent_mode/);
});
