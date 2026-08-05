import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const formalConfig = JSON.parse(await readFile(
  new URL('../src-tauri/tauri.conf.json', import.meta.url),
  'utf8',
));
const betaConfig = JSON.parse(await readFile(
  new URL('../src-tauri/tauri.beta.conf.json', import.meta.url),
  'utf8',
));
const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
));
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const bridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');

test('keeps beta builds distinct from formal releases', () => {
  assert.equal(formalConfig.productName, 'OneTouch');
  assert.equal(formalConfig.version, '0.3.3');
  assert.equal(formalConfig.identifier, 'design.ryan.onetouch.menubar');
  assert.equal(betaConfig.productName, 'OneTouch Beta');
  assert.equal(betaConfig.version, '0.3.3');
  assert.equal(packageJson.version, formalConfig.version);
  assert.equal(betaConfig.identifier, 'design.ryan.onetouch.beta');
  assert.notEqual(betaConfig.productName, formalConfig.productName);
  assert.notEqual(betaConfig.identifier, formalConfig.identifier);
  assert.equal(betaConfig.bundle.createUpdaterArtifacts, false);
});

test('provides a dedicated beta build command', () => {
  assert.match(packageJson.scripts['native:build:beta'], /tauri\.beta\.conf\.json/);
  assert.match(packageJson.scripts['native:build:beta'], /--bundles app/);
});

test('uses the bundle product name in the panel and About page', () => {
  assert.match(bridge, /export async function getNativeAppName\(\)/);
  assert.match(bridge, /return getName\(\)/);
  assert.match(app, /getNativeAppName\(\)\.then\(setAppName\)/);
  assert.match(app, /title: appName/);
  assert.match(app, /aboutTitle: appName/);
  assert.match(app, /appName=\{appName\}/);
});

test('uses the bundle identifier to isolate beta updates', () => {
  assert.match(bridge, /export async function getNativeAppIdentifier\(\)/);
  assert.match(bridge, /return getIdentifier\(\)/);
  assert.match(app, /appIdentifier === 'design\.ryan\.onetouch\.beta'/);
  assert.match(app, /if \(isBetaBuild\)[\s\S]*phase: 'disabled'/);
  assert.match(app, /!appIdentifier \|\| isBetaBuild/);
});
