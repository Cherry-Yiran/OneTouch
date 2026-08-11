import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('./TimerPanel.jsx', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const nativeBridge = await readFile(new URL('./nativeBridge.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

test('the macOS app delegates timer choices to a native menu', () => {
  assert.match(app, /await showNativeTimerMenu\(/);
  assert.match(nativeBridge, /invoke\('show_timer_menu'/);
  assert.match(app, /!nativeApp && timerPanelControlId && timerPopoverAnchor/);
});

test('browser preview keeps an anchored non-modal fallback', () => {
  const popoverRules = [...styles.matchAll(/\.timer-popover\s*\{(?<rules>[\s\S]*?)\n\}/g)]
    .map((match) => match.groups?.rules ?? '')
    .find((rules) => /position:\s*absolute/.test(rules)) ?? '';

  assert.match(panel, /className=\{`timer-popover is-\$\{anchor\.placement\}`\}/);
  assert.match(panel, /role="menu"/);
  assert.match(app, /openTimerPopover\(id, trigger\)/);
  assert.match(app, /aria-haspopup=\{timerTriggerId \? 'menu'/);
  assert.doesNotMatch(panel, /secondary-panel/);
  assert.match(popoverRules, /position:\s*absolute/);
  assert.doesNotMatch(popoverRules, /inset:\s*0/);
});

test('timed controls use a normal click instead of a long press', () => {
  assert.doesNotMatch(app, /onLongPress=\{TIMED_CONTROL_IDS/);
  assert.match(
    app,
    /if \(kind === CONTROL_KINDS\.ACTION \|\| !TIMED_CONTROL_IDS\.includes\(item\.id\) \|\| checked\)/,
  );
});

test('the indefinite choice still enables the selected control', () => {
  assert.match(app, /currentlyEnabled \|\| await activateControl\(id, false\)/);
  assert.match(app, /if \(deadline\) next\[id\] = deadline;\s*else delete next\[id\]/);
  assert.match(app, /TIMED_CONTROL_IDS\.includes\(item\.id\) && checked[\s\S]*?: text\.timerNone/);
});
