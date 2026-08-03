import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const bridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');
const helper = await readFile(
  new URL('../src-tauri/src/macos_helper.m', import.meta.url),
  'utf8',
);

function objectiveCMethod(source, start, next) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(next, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing method: ${start}`);
  assert.notEqual(endIndex, -1, `missing method boundary: ${next}`);
  return source.slice(startIndex, endIndex);
}

test('ships bilingual native Accessibility guide copy', () => {
  assert.match(app, /ACCESSIBILITY_GUIDE_COPY/);
  assert.match(app, /Enable Accessibility/);
  assert.match(app, /开启辅助功能权限/);
  assert.match(app, /Grant access once/);
  assert.match(app, /只需授权一次/);
  assert.match(app, /Keystrokes are never recorded or uploaded/);
  assert.match(app, /不会记录或上传键盘内容/);
  assert.match(app, /Quit OneTouch/);
  assert.match(app, /退出 OneTouch/);
  assert.match(app, /autoShow: true/);
  assert.match(app, /updateNativeAccessibilityGuide\(accessibilityGuideModel\)/);
});

test('routes Accessibility recovery through the native guide', () => {
  assert.match(app, /pane === 'accessibility'/);
  assert.match(app, /showNativeAccessibilityGuide\(\)/);
  assert.match(bridge, /invoke\('update_accessibility_guide'/);
  assert.match(bridge, /invoke\('show_accessibility_guide'/);
});

test('uses the app bundle URL as a native drag payload without prompting AX checks', () => {
  assert.match(helper, /initWithPasteboardWriter:self\.appURL/);
  assert.match(helper, /pathExtension\.lowercaseString isEqualToString:@"app"/);
  assert.match(helper, /AXIsProcessTrusted\(\)/);
  assert.doesNotMatch(helper, /AXIsProcessTrustedWithOptions/);
});

test('keeps the native permission guide compact and explicit', () => {
  assert.match(helper, /SBAccessibilityGuideWidth = 420\.0/);
  assert.match(helper, /SBAccessibilityGuideHeight = 242\.0/);
  assert.match(helper, /self\.titleLabel\.topAnchor constraintEqualToAnchor:self\.contentHostView\.topAnchor\s+constant:20\.0/);
  assert.match(helper, /self\.dragView\.topAnchor constraintEqualToAnchor:self\.explanationLabel\.bottomAnchor\s+constant:14\.0/);
  assert.match(helper, /self\.dragView\.heightAnchor constraintEqualToConstant:68\.0/);
  assert.match(helper, /systemFontOfSize:16\.0/);
  assert.match(helper, /systemFontOfSize:14\.0/);
  assert.match(helper, /bezierPathWithRoundedRect:borderRect/);
  assert.match(helper, /NSColor\.controlBackgroundColor setFill/);
  assert.match(helper, /NSColor\.quaternaryLabelColor setStroke/);
  assert.match(helper, /NSColor\.unemphasizedSelectedContentBackgroundColor setFill/);
  assert.match(helper, /viewDidChangeEffectiveAppearance/);
  assert.match(helper, /path\.lineWidth = 1\.0/);
  assert.doesNotMatch(helper, /systemFontOfSize:20\.0/);
  assert.doesNotMatch(helper, /hand\.draw/);
  assert.match(helper, /buttonWithTitle:self\.model\[@"quit"\]/);
  assert.match(helper, /NSBezelStyleRounded/);
});

test('does not reopen System Settings in the background after permission is revoked', () => {
  const permissionTick = objectiveCMethod(
    helper,
    '- (void)permissionTick:',
    '- (void)trackingTick:',
  );
  assert.match(permissionTick, /SBHideNativePopover\(NO\)/);
  assert.match(permissionTick, /\[self hide\]/);
  assert.doesNotMatch(permissionTick, /showOpeningSystemSettings:YES/);
});

test('enters the main menu automatically after Accessibility is granted', () => {
  const showSuccess = objectiveCMethod(
    helper,
    '- (void)showSuccess',
    '- (void)hide',
  );
  assert.match(showSuccess, /successStatusLabel/);
  assert.match(showSuccess, /SBShowNativePopover\(NO\)/);
});
