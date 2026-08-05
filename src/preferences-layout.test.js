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
  assert.match(macosHelper, /SBNativePreferencesAboutHeight\s*=\s*244\.0/);
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

test('settings and customisation footer buttons open distinct native panes', () => {
  assert.match(
    macosHelper,
    /NSArray<NSString \*> \*actions = @\[@"settings", @"customise", @"quit"\]/,
  );
  assert.match(
    macosHelper,
    /int sb_native_preferences_show\(const char \*pane\)[\s\S]*?@"general": @0[\s\S]*?@"customise": @1[\s\S]*?controller\.selectedTabViewItemIndex/,
  );
  assert.match(nativeBridge, /invoke\('open_preferences', \{ pane \}\)/);
  assert.match(app, /action === 'customise'[\s\S]*?openPreferences\('customise'\)/);
  assert.match(app, /action === 'settings'[\s\S]*?openPreferences\('general'\)/);
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
  assert.match(
    macosHelper,
    /self\.loginSwitch = \[NSSwitch new\];[\s\S]*?self\.loginSwitch\.controlSize = NSControlSizeSmall/,
  );
});

test('native customisation uses checkboxes for multi-selection', () => {
  const customCell = macosHelper.match(
    /- \(NSView \*\)customCellForRow:[\s\S]*?\n}\n\n- \(NSView \*\)shortcutCellForRow:/,
  )?.[0] ?? '';

  assert.match(customCell, /\[NSButton checkboxWithTitle:@""/);
  assert.match(customCell, /checkbox\.controlSize = NSControlSizeSmall/);
  assert.doesNotMatch(customCell, /NSSwitch/);
  assert.match(macosHelper, /visibilityChanged:\(NSButton \*\)sender/);
  assert.doesNotMatch(macosHelper, /model\[@"maxVisible"\]/);
  assert.doesNotMatch(app, /maxVisible|MAX_VISIBLE_CONTROLS/);
  assert.doesNotMatch(preferences, /maxVisible|MAX_VISIBLE_CONTROLS/);
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

test('brand mark follows the system appearance while active controls use the accent color', () => {
  assert.match(
    macosHelper,
    /mark\.image = SBSingleSwitchTemplate\(20\.0\);[\s\S]*?mark\.contentTintColor = nil/,
  );
  assert.doesNotMatch(macosHelper, /mark\.contentTintColor = NSColor\.whiteColor/);
  assert.match(macosHelper, /active \? NSColor\.controlAccentColor : NSColor\.secondaryLabelColor/);
});

test('menu bar icon is fixed to one single-switch template', () => {
  assert.doesNotMatch(macosHelper, /iconPopup|iconChanged:|menuIcon/);
  assert.doesNotMatch(macosHelper, /@"switch\.2"/);
  assert.match(macosHelper, /SBSingleSwitchTemplate\(16\.0\)/);
  assert.match(macosHelper, /SBStatusIconView\.contentTintColor = nil/);
  assert.doesNotMatch(
    macosHelper,
    /SBStatusIconView\.contentTintColor = NSColor\.whiteColor/,
  );
  assert.match(macosHelper, /mark\.image = SBSingleSwitchTemplate\(20\.0\)/);
  assert.doesNotMatch(app, /menuIcon|setNativeMenuIcon/);
  assert.doesNotMatch(preferences, /Menu bar icon|菜单栏图标|setMenuIcon/);
  assert.doesNotMatch(nativeBridge, /setNativeMenuIcon|set_menu_icon/);
});

test('disk copy covers every system-ejectable disk and disk image', () => {
  assert.match(app, /ejectDisk: \['推出磁盘', '短按全部推出 · 长按保护磁盘'\]/);
  assert.match(app, /当前没有可推出的磁盘或磁盘映像/);
  assert.doesNotMatch(app, /当前没有连接外置物理磁盘/);
});

test('about page groups identity, updating, and native social links', () => {
  assert.doesNotMatch(macosHelper, /strings\[@"aboutLead"\]/);
  assert.doesNotMatch(macosHelper, /strings\[@"safety"\]/);
  assert.match(macosHelper, /identityStack\.spacing = 4\.0/);
  assert.match(macosHelper, /updateStack\.spacing = 6\.0/);
  assert.match(macosHelper, /socialStack\.orientation = NSUserInterfaceLayoutOrientationHorizontal/);
  assert.match(macosHelper, /socialStack\.spacing = 12\.0/);
  assert.match(macosHelper, /self\.aboutUpdateButton\.bezelStyle = NSBezelStyleRounded/);
  assert.match(macosHelper, /SBEmitNativePreferencesAction\(@"appUpdate", @"", request\)/);
  assert.match(macosHelper, /self\.aboutGitHubButton\.bezelStyle = NSBezelStyleAccessoryBarAction/);
  assert.match(macosHelper, /self\.aboutXButton\.bezelStyle = NSBezelStyleAccessoryBarAction/);
  assert.doesNotMatch(macosHelper, /arrow\.up\.right\.square/);
  assert.match(macosHelper, /NSWorkspace\.sharedWorkspace openURL:url/);
  assert.match(
    app,
    /const GITHUB_URL = 'https:\/\/github\.com\/Cherry-Yiran\/OneTouch'/,
  );
  assert.match(app, /const X_URL = 'https:\/\/x\.com\/hizhm1'/);
  assert.match(preferences, /x: 'X @hizhm1'/);
  assert.match(app, /githubURL: GITHUB_URL,[\s\S]*xURL: X_URL/);
  assert.match(nativeBridge, /@tauri-apps\/plugin-updater/);
  assert.match(nativeBridge, /@tauri-apps\/plugin-process/);
});
