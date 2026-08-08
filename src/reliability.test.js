import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const diskPanel = await readFile(new URL('./DiskPanel.jsx', import.meta.url), 'utf8');

test('retries native event subscriptions instead of silently losing controls', () => {
  assert.match(app, /const NATIVE_LISTENER_RETRY_MS = 500/);
  assert.match(app, /function listenWithRetry\(/);
  assert.match(app, /window\.setTimeout\(connect, NATIVE_LISTENER_RETRY_MS\)/);
  assert.match(app, /listenWithRetry\(\s*listenForNativePopoverActions/s);
  assert.match(app, /listenWithRetry\(\s*listenForNativePreferencesActions/s);
});

test('coalesces concurrent native snapshots', () => {
  assert.match(app, /const nativeSnapshotRequestRef = useRef\(null\)/);
  assert.match(app, /if \(nativeSnapshotRequestRef\.current\) return nativeSnapshotRequestRef\.current/);
  assert.match(app, /nativeSnapshotRequestRef\.current = request/);
  assert.match(app, /nativeSnapshotRequestRef\.current === request/);
});

test('tracks disk exclusion work by stable device id', () => {
  assert.match(app, /setSavingDiskId\(disk\.id\)/);
  assert.match(app, /map\(\(item\) => item\.id\)/);
  assert.match(diskPanel, /savingId === disk\.id/);
  assert.doesNotMatch(diskPanel, /savingName === disk\.name/);
});
