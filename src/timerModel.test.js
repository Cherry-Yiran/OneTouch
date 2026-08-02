import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deadlineForTimerChoice,
  endOfDayDeadline,
  formatTimerRemaining,
  nextTimerDeadline,
  restoreTimers,
  timerRetryDeadline,
} from './timerModel.js';

test('restores only supported finite timer deadlines', () => {
  assert.deepEqual(
    restoreTimers('{"awake":2000,"removed":3000,"dnd":"later"}'),
    { awake: 2000 },
  );
});

test('finds the next timer and formats its remaining duration', () => {
  assert.equal(nextTimerDeadline({ awake: 5000, dnd: 3000 }), 3000);
  assert.equal(formatTimerRemaining(7_200_000, 'zh', 0), '剩余 2 小时');
  assert.equal(formatTimerRemaining(5_400_000, 'en', 0), '1 hr 30 min left');
});

test('end-of-day deadlines stay within the current local day', () => {
  const now = new Date(2026, 6, 27, 12, 0, 0).getTime();
  const deadline = new Date(endOfDayDeadline(now));
  assert.equal(deadline.getDate(), 27);
  assert.equal(deadline.getHours(), 23);
  assert.equal(deadline.getMinutes(), 59);
});

test('native timer menu choices map to the same timer deadlines', () => {
  const now = new Date(2026, 6, 30, 12, 0, 0).getTime();
  assert.equal(deadlineForTimerChoice('30m', now), now + 30 * 60 * 1000);
  assert.equal(deadlineForTimerChoice('today', now), endOfDayDeadline(now));
  assert.equal(deadlineForTimerChoice('none', now), null);
  assert.equal(deadlineForTimerChoice('unknown', now), undefined);
});

test('a transient timer failure is retried after one minute', () => {
  assert.equal(timerRetryDeadline(1_000), 61_000);
});
