import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const macosHelper = await readFile(
  new URL('../src-tauri/src/macos_helper.m', import.meta.url),
  'utf8',
);
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const preferences = await readFile(new URL('./Preferences.jsx', import.meta.url), 'utf8');
const nativeBridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');

test('native general settings stay centered in the available content area', () => {
  const panel = styles.match(
    /\.native-preferences-shell \.general-panel\s*\{(?<rules>[\s\S]*?)\n\}/,
  )?.groups?.rules ?? '';

  assert.match(panel, /display:\s*flex/);
  assert.match(panel, /align-items:\s*center/);
  assert.match(panel, /justify-content:\s*center/);
  assert.match(panel, /margin:\s*0/);
});

test('native settings window follows the selected pane content height', () => {
  assert.match(macosHelper, /SBNativePreferencesContentWidth\s*=\s*400\.0/);
  assert.match(
    macosHelper,
    /NSMakeRect\(0, 0, SBNativePreferencesContentWidth,[\s\S]*SBNativePreferencesListHeight\)/,
  );
  assert.match(macosHelper, /SBNativePreferencesGeneralHeight\s*=\s*144\.0/);
  assert.match(macosHelper, /SBNativePreferencesListHeight\s*=\s*420\.0/);
  assert.match(macosHelper, /SBNativePreferencesAboutHeight\s*=\s*200\.0/);
  assert.match(
    macosHelper,
    /setSelectedTabViewItemIndex:[\s\S]*resizeWindowForSelectedTabAnimated:YES/,
  );
  assert.match(macosHelper, /setFrame:targetFrame display:YES animate:shouldAnimate/);
  assert.match(
    macosHelper,
    /showWindow:nil[\s\S]*dispatch_async\(dispatch_get_main_queue\(\)[\s\S]*resizeWindowForSelectedTabAnimated:NO/,
  );
});

test('native settings use compact shared spacing and shortcut controls', () => {
  assert.match(macosHelper, /SBNativePreferencesHorizontalInset\s*=\s*20\.0/);
  assert.match(macosHelper, /SBNativePreferencesRowHeight\s*=\s*34\.0/);
  assert.match(macosHelper, /SBNativePreferencesShortcutButtonWidth\s*=\s*72\.0/);
  assert.match(
    macosHelper,
    /languagePopup\.widthAnchor constraintEqualToConstant:184\.0/,
  );
  assert.doesNotMatch(macosHelper, /constraintGreaterThanOrEqualToConstant:92\.0/);
});

test('native settings use the system preference toolbar with a visible pane title', () => {
  assert.match(macosHelper, /NSWindowToolbarStylePreference/);
  assert.match(macosHelper, /window\.titleVisibility = NSWindowTitleVisible/);
  assert.match(macosHelper, /NSToolbarDisplayModeIconAndLabel/);
  assert.match(macosHelper, /NSToolbarSizeModeRegular/);
  assert.match(
    macosHelper,
    /updatePreferencesWindowTitle[\s\S]*self\.view\.window\.title = label/,
  );
  assert.doesNotMatch(macosHelper, /NSWindowToolbarStyleUnified/);
  assert.doesNotMatch(macosHelper, /configurePreferencesToolbarButtons/);
  assert.doesNotMatch(macosHelper, /NSToolbarDisplayModeIconOnly/);
});

test('brand mark is white while native controls keep the system accent color', () => {
  assert.match(
    macosHelper,
    /mark\.image = SBSingleSwitchTemplate\(20\.0\);\s*mark\.contentTintColor = NSColor\.whiteColor/,
  );
  assert.match(macosHelper, /active \? NSColor\.controlAccentColor : NSColor\.secondaryLabelColor/);
});

test('menu bar icon is fixed to one single-switch template', () => {
  assert.doesNotMatch(macosHelper, /iconPopup|iconChanged:|menuIcon/);
  assert.doesNotMatch(macosHelper, /@"switch\.2"/);
  assert.match(macosHelper, /SBSingleSwitchTemplate\(16\.0\)/);
  assert.match(macosHelper, /mark\.image = SBSingleSwitchTemplate\(20\.0\)/);
  assert.doesNotMatch(app, /menuIcon|setNativeMenuIcon/);
  assert.doesNotMatch(preferences, /Menu bar icon|菜单栏图标|setMenuIcon/);
  assert.doesNotMatch(nativeBridge, /setNativeMenuIcon|set_menu_icon/);
});

test('about page keeps the app identity, version, and native GitHub link', () => {
  assert.doesNotMatch(macosHelper, /strings\[@"aboutLead"\]/);
  assert.doesNotMatch(macosHelper, /strings\[@"safety"\]/);
  assert.match(
    macosHelper,
    /for \(NSView \*view in @\[mark, title, self\.aboutVersion, self\.aboutGitHubButton\]\)/,
  );
  assert.match(macosHelper, /self\.aboutGitHubButton\.bezelStyle = NSBezelStyleAccessoryBarAction/);
  assert.match(macosHelper, /NSWorkspace\.sharedWorkspace openURL:url/);
  assert.match(
    app,
    /const GITHUB_URL = 'https:\/\/github\.com\/Cherry-Yiran\?tab=repositories'/,
  );
});
