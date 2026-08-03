import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const bridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');
const helper = await readFile(
  new URL('../src-tauri/src/macos_helper.m', import.meta.url),
  'utf8',
);
const tauriConfig = JSON.parse(
  await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
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

test('uses the app bundle URL and the official explicit Accessibility prompt', () => {
  assert.match(helper, /initWithPasteboardWriter:self\.appURL/);
  assert.match(helper, /pathExtension\.lowercaseString isEqualToString:@"app"/);
  assert.match(helper, /AXIsProcessTrusted\(\)/);
  assert.match(helper, /AXIsProcessTrustedWithOptions/);
  assert.match(helper, /kAXTrustedCheckOptionPrompt/);
  const permissionTick = objectiveCMethod(
    helper,
    '- (void)permissionTick:',
    '- (void)trackingTick:',
  );
  assert.doesNotMatch(permissionTick, /AXIsProcessTrustedWithOptions/);
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

test('finishes Accessibility onboarding without opening the main menu', () => {
  const showSuccess = objectiveCMethod(
    helper,
    '- (void)showSuccess',
    '- (void)hide',
  );
  assert.match(showSuccess, /successStatusLabel/);
  assert.match(showSuccess, /\[self hide\]/);
  assert.match(showSuccess, /SBEnsureStatusItemAvailable/);
  assert.doesNotMatch(showSuccess, /SBShowNativePopover/);
  assert.doesNotMatch(showSuccess, /SBShowBestAvailableNativePopover/);
});

test('keeps the main controls as an anchored menu-bar panel', () => {
  const createPopover = objectiveCMethod(
    helper,
    'int sb_native_popover_create(SBNativePopoverCallback callback) {',
    'int sb_native_popover_update_json(const char *model_json) {',
  );
  assert.doesNotMatch(helper, /SBNativePopoverDetached/);
  assert.doesNotMatch(helper, /SBShowDetachedNativePopover/);
  assert.doesNotMatch(helper, /SBShowBestAvailableNativePopover/);
  assert.doesNotMatch(createPopover, /NSWindowStyleMaskClosable/);
  assert.doesNotMatch(createPopover, /NSWindowStyleMaskMiniaturizable/);
  assert.match(createPopover, /NSWindowTitleHidden/);
  assert.match(helper, /canBecomeMainWindow[\s\S]*return NO/);
});

test('uses the migrated bundle identity and a public AppKit status item', () => {
  assert.equal(tauriConfig.identifier, 'design.ryan.onetouch.menubar');
  assert.match(helper, /SBEnsureStatusItemAvailable/);
  assert.match(helper, /NSContainsRect\(screen\.frame, frame\)/);
  assert.match(helper, /150\.0 \* NSEC_PER_MSEC/);
  assert.match(helper, /500\.0 \* NSEC_PER_MSEC/);
  assert.match(helper, /statusItemWithLength:24\.0/);
  assert.doesNotMatch(helper, /SBPrimaryStatusItemAutosaveName/);
  assert.doesNotMatch(helper, /_initWithStatusBar:length:priority:systemInsertOrder:activeItem:/);
  assert.doesNotMatch(helper, /setAutosaveName:/);
  assert.doesNotMatch(helper, /_insertStatusItem:/);
  assert.doesNotMatch(helper, /_wakeStatusItem/);
  assert.doesNotMatch(helper, /SBStatusItemBehaviorNeverClip/);
  assert.doesNotMatch(helper, /_setDropPriority:/);
  assert.doesNotMatch(helper, /OneTouchStatusDebug/);
  assert.doesNotMatch(helper, /removeStatusItem/);
  assert.doesNotMatch(helper, /SBStatusItem\.visible = YES/);
});
