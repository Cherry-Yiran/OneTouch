import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const bridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');
const rust = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

test('all process-owned controls share one deterministic exit cleanup', () => {
  assert.match(rust, /fn stop_transient_features\(state: &NativeState\)/);
  assert.match(rust, /stop_transient_features[\s\S]*set_clean_screen\(false\)/);
  assert.match(rust, /stop_transient_features[\s\S]*set_keyboard_locked\(false\)/);
  assert.match(rust, /stop_transient_features[\s\S]*set_awake\(false, state\)/);
  assert.match(rust, /quit_app[\s\S]*stop_transient_features\(state\.inner\(\)\)/);
  assert.match(rust, /RunEvent::Exit[\s\S]*stop_transient_features\(state\.inner\(\)\)/);
});

test('quitting ends only timer-owned system modes and clears their saved deadlines', () => {
  assert.match(rust, /fn stop_timed_system_controls_on_quit/);
  assert.match(rust, /"darkMode" \| "dnd"/);
  assert.match(rust, /fn quit_app\(app: AppHandle, timed_control_ids: Vec<String>\)/);
  assert.match(bridge, /quitNativeApp\(timedControlIds = \[\]\)/);
  assert.match(bridge, /invoke\('quit_app', \{ timedControlIds \}\)/);
  assert.match(app, /const timedControlIds = Object\.keys\(timers\)/);
  assert.match(app, /localStorage\.setItem\('switchboard-timers', '\{\}'\)/);
  assert.match(app, /quitNativeApp\(timedControlIds\)/);
  assert.match(app, /PROCESS_OWNED_TIMED_CONTROL_IDS = new Set\(\['awake'\]\)/);
  assert.match(app, /PROCESS_OWNED_TIMED_CONTROL_IDS\.has\(id\)[\s\S]*delete next\[id\]/);
});

test('beta builds disable login launch and cannot turn it back on', () => {
  assert.match(app, /isBetaBuild\s*\? setNativeAutostartEnabled\(false\)/);
  assert.match(app, /if \(isBetaBuild\)[\s\S]*await setNativeAutostartEnabled\(false\)/);
  assert.match(app, /startAtLoginDisabled: isBetaBuild/);
});
