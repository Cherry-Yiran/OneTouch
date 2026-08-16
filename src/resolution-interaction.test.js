import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('./nativeBridge.js', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../src-tauri/src/macos_helper.m', import.meta.url), 'utf8');
const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('screen resolution no longer opens the legacy WebView page', () => {
  assert.equal(existsSync(new URL('./ResolutionPanel.jsx', import.meta.url)), false);
  assert.doesNotMatch(app, /ResolutionPanel|showLegacyPopover|resolutionPanelOpen/);
  assert.doesNotMatch(bridge, /showLegacyPopover|show_legacy_popover/);
  assert.doesNotMatch(rust, /show_legacy_popover/);
  assert.doesNotMatch(styles, /\.resolution-panel|\.resolution-back|\.resolution-options/);
});

test('screen resolution uses the same switch-triggered native menu pattern as timed controls', () => {
  assert.match(helper, /SBShowResolutionMenuForView/);
  assert.match(helper, /self\.choice/);
  assert.match(helper, /SBEmitNativePopoverAction\(@"choice", self\.controlID, 1\)/);
  assert.match(app, /action === 'choice' && controlId === 'resolution'/);
  assert.match(bridge, /invoke\('show_resolution_menu'/);
  assert.match(rust, /fn show_resolution_menu/);
  assert.doesNotMatch(helper, /SBConfigureResolutionPicker|performPickerAction/);
});
