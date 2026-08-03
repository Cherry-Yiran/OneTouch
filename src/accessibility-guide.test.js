import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const bridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');
const helper = await readFile(
  new URL('../src-tauri/src/macos_helper.m', import.meta.url),
  'utf8',
);

test('ships bilingual native Accessibility guide copy', () => {
  assert.match(app, /ACCESSIBILITY_GUIDE_COPY/);
  assert.match(app, /Enable Accessibility/);
  assert.match(app, /开启辅助功能权限/);
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

test('keeps the enlarged drag guide focused on one direct action', () => {
  assert.match(helper, /SBAccessibilityGuideWidth = 420\.0/);
  assert.match(helper, /SBAccessibilityGuideHeight = 158\.0/);
  assert.match(helper, /self\.titleLabel\.topAnchor constraintEqualToAnchor:self\.contentHostView\.topAnchor\s+constant:20\.0/);
  assert.match(helper, /self\.dragView\.topAnchor constraintEqualToAnchor:self\.titleLabel\.bottomAnchor\s+constant:20\.0/);
  assert.match(helper, /self\.dragView\.bottomAnchor constraintEqualToAnchor:self\.contentHostView\.bottomAnchor\s+constant:-20\.0/);
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
  assert.doesNotMatch(helper, /reopenButton/);
  assert.doesNotMatch(helper, /instructionLabel/);
  assert.doesNotMatch(app, /reopen: '重新打开'/);
  assert.doesNotMatch(app, /instruction: '将 OneTouch/);
});
