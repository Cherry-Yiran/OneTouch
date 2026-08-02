import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = JSON.parse(await readFile(
  new URL('../src-tauri/tauri.conf.json', import.meta.url),
  'utf8',
));
const capabilities = JSON.parse(await readFile(
  new URL('../src-tauri/capabilities/default.json', import.meta.url),
  'utf8',
));
const workflow = await readFile(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8',
);
const bridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');

test('release builds create signed updater artifacts from GitHub Releases', () => {
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.ok(config.plugins.updater.pubkey.length > 100);
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/Cherry-Yiran/OneTouch/releases/latest/download/latest.json',
  ]);
  assert.ok(capabilities.permissions.includes('updater:default'));
  assert.ok(capabilities.permissions.includes('process:allow-restart'));
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD \}\}/);
  assert.match(workflow, /tauri-apps\/tauri-action@v1/);
});

test('the native bridge checks, installs, and relaunches through official Tauri plugins', () => {
  assert.match(bridge, /import\('@tauri-apps\/plugin-updater'\)/);
  assert.match(bridge, /return check\(\)/);
  assert.match(bridge, /import\('@tauri-apps\/plugin-process'\)/);
  assert.match(bridge, /await relaunch\(\)/);
});
