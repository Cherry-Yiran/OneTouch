export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RELEASE_NOTES_VERSION = '0.3.3';

export const RELEASE_NOTES = Object.freeze({
  en: {
    title: 'Updated to %s',
    summary: 'Downloads cleanup and automatic update reminders are now available.',
    items: [
      'Move everything in Downloads to the Trash with one switch.',
      'See available updates directly in the main panel.',
      'Keep formal and Beta builds clearly separated.',
    ],
    view: 'View',
    done: 'Done',
  },
  zh: {
    title: '已更新至 %s',
    summary: '新增下载目录清理和自动更新提醒。',
    items: [
      '一键将下载文件夹内容移到废纸篓。',
      '有新版本时直接在主面板提醒。',
      '正式版与 Beta 测试版保持独立。',
    ],
    view: '查看',
    done: '完成',
  },
});

export function releaseNotesMatchVersion(version) {
  return typeof version === 'string' && (version === RELEASE_NOTES_VERSION
    || version.startsWith(`${RELEASE_NOTES_VERSION}-`));
}

export function shouldPresentReleaseNotes(version, seenVersion) {
  return releaseNotesMatchVersion(version) && seenVersion !== RELEASE_NOTES_VERSION;
}

export function updateCheckIsDue(lastCheckedAt, now = Date.now()) {
  const parsed = Number(lastCheckedAt);
  return !Number.isFinite(parsed)
    || parsed <= 0
    || now - parsed >= UPDATE_CHECK_INTERVAL_MS;
}
