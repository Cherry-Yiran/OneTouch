export const TIMED_CONTROL_IDS = Object.freeze(['awake', 'darkMode', 'dnd']);

export const TIMER_PRESETS = Object.freeze([
  { id: '30m', milliseconds: 30 * 60 * 1000 },
  { id: '1h', milliseconds: 60 * 60 * 1000 },
  { id: '2h', milliseconds: 2 * 60 * 60 * 1000 },
  { id: '4h', milliseconds: 4 * 60 * 60 * 1000 },
]);

export function restoreTimers(value, validIds = TIMED_CONTROL_IDS) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, deadline]) => (
        validIds.includes(id)
        && Number.isFinite(deadline)
        && deadline > 0
      )),
    );
  } catch {
    return {};
  }
}

export function endOfDayDeadline(now = Date.now()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function nextTimerDeadline(timers) {
  const deadlines = Object.values(timers || {}).filter(Number.isFinite);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

export function formatTimerRemaining(deadline, language, now = Date.now()) {
  if (!Number.isFinite(deadline)) return '';
  const minutes = Math.max(1, Math.ceil((deadline - now) / 60000));
  if (minutes < 60) return language === 'zh' ? `剩余 ${minutes} 分钟` : `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (language === 'zh') return remainder ? `剩余 ${hours} 小时 ${remainder} 分钟` : `剩余 ${hours} 小时`;
  return remainder ? `${hours} hr ${remainder} min left` : `${hours} hr left`;
}
