import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const macosHelper = await readFile(
  new URL('../src-tauri/src/macos_helper.m', import.meta.url),
  'utf8',
);

test('native popover clips the shell and content to one shared radius', () => {
  const shells = [...styles.matchAll(/\.native-popover-shell\s*\{(?<rules>[\s\S]*?)\n\}/g)]
    .map((match) => match.groups?.rules ?? '');
  const shell = shells.find((rules) => /--native-popover-corner-radius:\s*20px/.test(rules)) ?? '';

  assert.match(shell, /--native-popover-corner-radius:\s*20px/);
  assert.match(shell, /overflow:\s*hidden/);
  assert.match(shell, /border-radius:\s*var\(--native-popover-corner-radius\)/);
  assert.match(
    styles,
    /\.native-popover-shell \.status-popover\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*var\(--native-popover-corner-radius\)/,
  );
});

test('native main popover keeps fixed chrome around a native scrolling row list', () => {
  assert.match(macosHelper, /separator\.boxType = NSBoxSeparator/);
  assert.match(macosHelper, /NSScrollView \*scroll = \[NSScrollView new\]/);
  assert.match(macosHelper, /scroll\.documentView = document/);
  assert.match(macosHelper, /rows\.count > SBNativeVisibleRowCapacity/);
  assert.match(macosHelper, /NSUInteger visibleRows = MIN\(rows\.count, SBNativeVisibleRowCapacity\)/);
  assert.match(
    macosHelper,
    /initWithFrame:NSMakeRect\(0\.0, 0\.0, SBNativePopoverWidth,[\s\S]*?rows\.count \* SBNativeRowHeight\)/,
  );
  assert.doesNotMatch(macosHelper, /document\.autoresizingMask/);
  assert.match(macosHelper, /header\.topAnchor constraintEqualToAnchor:rootView\.topAnchor/);
  assert.match(macosHelper, /footer\.bottomAnchor constraintEqualToAnchor:rootView\.bottomAnchor/);
  assert.match(
    macosHelper,
    /2\.0 \* SBNativeSeparatorHeight/,
  );
  // The browser fallback must not imitate AppKit's semantic separator with a
  // hand-authored CSS border.
  assert.match(
    styles,
    /\.native-popover-shell \.popover-head,[\s\S]*?\.native-popover-shell \.switch-row\s*\{\s*border:\s*0;/,
  );
});

test('an open detail panel removes the underlying controls from keyboard navigation', () => {
  const inertBindings = app.match(/inert=\{[^}]+\}/g) || [];
  assert.equal(inertBindings.length, 2);
  inertBindings.forEach((binding) => {
    assert.match(binding, /\?\s*true\s*:\s*undefined/);
  });
});

test('native update notices preserve the fixed control rows without release announcements', () => {
  assert.match(macosHelper, /SBNativeAnnouncementHeight\s*=\s*60\.0/);
  assert.match(macosHelper, /SBNativeExpandedAnnouncementHeight\s*=\s*112\.0/);
  assert.match(macosHelper, /noticeButton\.bezelStyle = NSBezelStyleRounded/);
  assert.match(macosHelper, /progress\.style = NSProgressIndicatorStyleSpinning/);
  assert.match(macosHelper, /\[self updateHeader:model\]/);
  assert.match(macosHelper, /SBNativeAnnouncementHeightForModel\(model\)/);
  assert.match(macosHelper, /headerHeightConstraint\.constant = SBNativeHeaderHeight/);
  assert.match(macosHelper, /noticeMessage\.maximumNumberOfLines = expanded \? 4 : 1/);
  assert.doesNotMatch(
    macosHelper,
    /announcement:%@:%d[\s\S]*announcement\[@"expanded"\]/,
  );
  assert.match(app, /action === 'updateInstall'/);
  assert.doesNotMatch(app, /whatsNewExpand|whatsNewDismiss|已更新至|Updated to/);
  assert.match(app, /announcement: nativeAnnouncement/);
  assert.match(app, /!nativePopoverActionsReady\) return/);
  assert.match(app, /setNativePopoverActionsReady\(true\)/);
});

test('new features use native system badges and clear the entry badge after customise opens', () => {
  assert.match(macosHelper, /SBSymbol\(@"circle\.fill", 7\.0/);
  assert.match(macosHelper, /badge\.contentTintColor = NSColor\.systemRedColor/);
  assert.match(macosHelper, /model\[@"showCustomiseBadge"\]/);
  assert.match(macosHelper, /row\[@"newFeature"\]/);
  assert.match(macosHelper, /newFeatureBadge\.leadingAnchor constraintEqualToAnchor:title\.trailingAnchor constant:6\.0/);
  assert.match(macosHelper, /newFeatureBadge\.trailingAnchor constraintLessThanOrEqualToAnchor:handle\.leadingAnchor/);
  assert.match(macosHelper, /SBEmitNativePreferencesAction\(@"closed"/);
  assert.match(app, /setHasUnseenFeatures\(false\)/);
  assert.match(app, /action === 'closed'/);
  assert.match(app, /onetouch-new-features-seen-version/);
});
