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
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const rust = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

test('release builds create signed updater artifacts from GitHub Releases', () => {
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.ok(config.plugins.updater.pubkey.length > 100);
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/Cherry-Yiran/OneTouch/releases/latest/download/latest.json',
  ]);
  assert.ok(!capabilities.permissions.some((permission) => permission.startsWith('updater:')));
  assert.ok(capabilities.permissions.includes('process:allow-restart'));
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD \}\}/);
  assert.match(workflow, /APPLE_CERTIFICATE: \$\{\{ secrets\.APPLE_CERTIFICATE \}\}/);
  assert.match(workflow, /APPLE_CERTIFICATE_PASSWORD: \$\{\{ secrets\.APPLE_CERTIFICATE_PASSWORD \}\}/);
  assert.match(workflow, /APPLE_SIGNING_IDENTITY: \$\{\{ secrets\.APPLE_SIGNING_IDENTITY \}\}/);
  assert.doesNotMatch(workflow, /APPLE_ID: \$\{\{ secrets\.APPLE_ID \}\}/);
  assert.doesNotMatch(workflow, /APPLE_PASSWORD: \$\{\{ secrets\.APPLE_PASSWORD \}\}/);
  assert.doesNotMatch(workflow, /APPLE_TEAM_ID: \$\{\{ secrets\.APPLE_TEAM_ID \}\}/);
  assert.match(workflow, /Import stable OneTouch signing identity/);
  assert.match(workflow, /sudo security add-trusted-cert/);
  assert.match(workflow, /security find-identity -v -p codesigning/);
  const actionReferences = [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gm)]
    .map(([, reference]) => reference);
  assert.ok(actionReferences.length >= 6);
  actionReferences.forEach((reference) => {
    assert.match(reference, /@[0-9a-f]{40}$/);
  });
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /runs-on: macos-26/);
  assert.notEqual(config.bundle.macOS.signingIdentity, '-');
  assert.match(workflow, /Require stable macOS code signing/);
  assert.doesNotMatch(workflow, /Developer ID Application identity/);
  assert.match(workflow, /releaseDraft: true/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /Verify updater manifest and downloadable artifact/);
  assert.match(workflow, /gh release download "\$release_tag"/);
  assert.match(workflow, /curl --fail --location/);
  assert.match(workflow, /cmp "\$archive" "\$updater_dir\/downloaded\.app\.tar\.gz"/);
  assert.doesNotMatch(workflow, /spctl --assess --type execute/);
  assert.doesNotMatch(workflow, /xcrun stapler validate/);
  assert.match(workflow, /gh release edit "\$release_tag" --draft=false/);
});

test('the native bridge checks and installs only through the guarded Rust updater boundary', () => {
  assert.doesNotMatch(bridge, /@tauri-apps\/plugin-updater/);
  assert.match(bridge, /invoke\('check_native_app_update'\)/);
  assert.match(bridge, /invoke\('install_native_app_update'\)/);
  assert.match(bridge, /import\('@tauri-apps\/plugin-process'\)/);
  assert.match(bridge, /await relaunch\(\)/);

  assert.match(rust, /TRUSTED_UPDATE_EXECUTABLE/);
  assert.match(rust, /trusted_update_executable/);
  assert.match(rust, /build_native_updater\(&app, Some\(&executable\)\)/);
  assert.match(rust, /builder = builder\.executable_path\(executable\)/);
  assert.match(rust, /env::set_var\("TMPDIR", TRUSTED_UPDATE_TEMP_ROOT\)/);
  assert.match(rust, /UPDATE_CHECK_ATTEMPTS:\s*usize\s*=\s*3/);
  assert.match(rust, /UPDATE_DOWNLOAD_ATTEMPTS:\s*usize\s*=\s*3/);
  assert.match(rust, /check_updater_with_retry/);
  assert.match(rust, /download_update_with_retry/);
  assert.match(rust, /phase:\s*"download-start"/);
  assert.match(app, /phase === 'download-start'[\s\S]*downloaded:\s*0[\s\S]*progress:\s*0/);
  assert.match(app, /updateFailureText\(copy, nativeUpdate\.errorStage\)/);
});

test('checks quietly in the background and keeps manual installation user initiated', () => {
  assert.match(app, /updateCheckIsDue\(localStorage\.getItem\(storageKey\)\)/);
  assert.match(app, /checkForAppUpdate\(\{ manual: false \}\)/);
  assert.match(app, /setTimeout\([\s\S]*2500/);
  assert.match(app, /nativeUpdateCheckPromiseRef\.current \|\| checkNativeAppUpdate\(\)/);
  assert.match(app, /if \(nativeUpdateInstallPromiseRef\.current\)/);
  assert.match(app, /action === 'updateInstall'[\s\S]*installPendingAppUpdate\(\)/);
  assert.match(app, /const installPromise = installNativeAppUpdate\(\)/);
  assert.match(app, /await relaunchNativeApp\(\)/);
});
