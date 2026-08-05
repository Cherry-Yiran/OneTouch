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
  const shell = styles.match(/\.native-popover-shell\s*\{(?<rules>[\s\S]*?)\n\}/)?.groups?.rules ?? '';

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

test('native update and whats-new notices preserve the fixed control rows', () => {
  assert.match(macosHelper, /SBNativeAnnouncementHeight\s*=\s*60\.0/);
  assert.match(macosHelper, /SBNativeExpandedAnnouncementHeight\s*=\s*112\.0/);
  assert.match(macosHelper, /noticeButton\.bezelStyle = NSBezelStyleRounded/);
  assert.match(macosHelper, /progress\.style = NSProgressIndicatorStyleSpinning/);
  assert.match(macosHelper, /\[self updateHeader:model\]/);
  assert.match(macosHelper, /SBNativeAnnouncementHeightForModel\(model\)/);
  assert.match(app, /action === 'updateInstall'/);
  assert.match(app, /action === 'whatsNewExpand'/);
  assert.match(app, /action === 'whatsNewDismiss'/);
  assert.match(app, /announcement: nativeAnnouncement/);
});
