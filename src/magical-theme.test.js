import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const design = await readFile(new URL('../design.md', import.meta.url), 'utf8');
const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const preferences = await readFile(new URL('./Preferences.jsx', import.meta.url), 'utf8');
const tauriConfig = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const infoPlist = await readFile(new URL('../src-tauri/Info.plist', import.meta.url), 'utf8');
const accentColor = await readFile(
  new URL('../src-tauri/ThemeAssets.xcassets/AccentColor.colorset/Contents.json', import.meta.url),
  'utf8',
);

test('Peach Star Magic keeps complete light and dark semantic theme tokens', () => {
  for (const token of ['#FFF8F2', '#F778A5', '#FFAA78', '#241A35', '#FF84B1', '#C8B2FF']) {
    assert.match(design, new RegExp(token, 'i'));
  }
  assert.match(styles, /@media \(prefers-color-scheme: light\)/);
  assert.match(styles, /--magic-panel-gradient/);
  assert.match(styles, /@media \(prefers-contrast: more\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
});

test('generated crests ship in both appearances with a browser and native fallback', () => {
  assert.match(app, /crestLightUrl/);
  assert.match(app, /crestDarkUrl/);
  assert.match(preferences, /crestLightUrl/);
  assert.match(preferences, /crestDarkUrl/);

  const resources = tauriConfig.bundle.resources;
  assert.equal(resources['../src/assets/magical/crest-light.png'], 'magical/crest-light.png');
  assert.equal(resources['../src/assets/magical/crest-dark.png'], 'magical/crest-dark.png');
  assert.equal(resources['theme/Assets.car'], 'Assets.car');
  assert.ok(root);
});

test('native AppKit controls use the branded light and dark accent asset', () => {
  assert.match(infoPlist, /<key>NSAccentColorName<\/key>\s*<string>AccentColor<\/string>/);
  assert.match(accentColor, /"red"\s*:\s*"0\.969"/);
  assert.match(accentColor, /"red"\s*:\s*"1\.000"/);
  assert.match(tauriConfig.build.beforeBuildCommand, /theme:assets/);
});

test('design source prohibits product-shape regressions and bitmap text assets', () => {
  assert.match(design, /普通桌面窗口/);
  assert.match(design, /未锚定面板/);
  assert.match(design, /Dock 图标/);
  assert.match(design, /文字位图/);
  assert.match(design, /禁止文字/);
  assert.match(design, /禁止水印/);
});
