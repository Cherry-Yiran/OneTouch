import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindowMac,
  AudioLines,
  BellOff,
  BrushCleaning,
  Coffee,
  Disc3,
  Eye,
  EyeOff,
  FolderDown,
  FolderOpen,
  Gauge,
  Grid3X3,
  Headphones,
  Keyboard,
  Languages,
  LayoutDashboard,
  Lock,
  MicOff,
  MonitorCog,
  MonitorUp,
  MoonStar,
  Music2,
  PanelTopClose,
  PanelsTopLeft,
  Paintbrush,
  Power,
  SlidersHorizontal,
  Sun,
  ToggleRight,
  Trash2,
  Zap,
} from 'lucide-react';
import Preferences, { PREFERENCES_COPY } from './Preferences.jsx';
import ResolutionPanel from './ResolutionPanel.jsx';
import TimerPanel from './TimerPanel.jsx';
import DiskPanel from './DiskPanel.jsx';
import {
  CONTROL_KINDS,
  controlKind,
  controlSwitchState,
  quitAppsRequestCount,
  usesSwitchAffordance,
} from './controlInteractions.js';
import {
  checkNativeAppUpdate,
  getNativeAppIdentifier,
  getNativeAppName,
  getNativeAppVersion,
  getNativeAutostartEnabled,
  getNativeDisplayConfiguration,
  getNativeExternalDisks,
  getNativeSnapshot,
  clearNativeGlobalShortcuts,
  hideNativeWindow,
  isNativeApp,
  listenForNativeCustomization,
  listenForNativePopoverActions,
  listenForNativePreferencesActions,
  openNativePreferences,
  openNativeSystemSettings,
  quitNativeApp,
  relaunchNativeApp,
  resizeNativePopover,
  sendNativeCustomizationToPopover,
  setNativeAutostartEnabled,
  setNativeDisplayMode,
  setNativeEjectExclusions,
  setNativeSwitch,
  showNativeAccessibilityGuide,
  showLegacyPopover,
  showNativePopover,
  showNativeTimerMenu,
  syncNativeGlobalShortcuts,
  updateNativePreferences,
  updateNativeAccessibilityGuide,
  updateNativePopover,
  validateNativeGlobalShortcut,
} from './nativeBridge.js';
import { recoveryPaneForError } from './nativeErrors.js';
import {
  RELEASE_NOTES,
  RELEASE_NOTES_VERSION,
  shouldPresentReleaseNotes,
  updateCheckIsDue,
} from './releaseNotes.js';
import { displayResolutionSummary, primaryDisplay } from './resolutionModel.js';
import {
  conflictingShortcutId,
  formatShortcut,
  restoreShortcuts,
} from './shortcutModel.js';
import {
  deadlineForTimerChoice,
  formatTimerRemaining,
  nextTimerDeadline,
  restoreTimers,
  timerRetryDeadline,
  TIMED_CONTROL_IDS,
} from './timerModel.js';
import {
  clampVisibleControlIds,
  toggleVisibleControl,
} from './visibility.js';

const COPY = {
  en: {
    quitAppsNone: 'No other apps are open',
    quitAppsRequested: 'Quit requested · {count} apps',
    quitApps: ['Quit other apps', 'Keeps your current app, OneTouch and Finder'],
    preview: 'Preview mode', connected: 'macOS connected', available: 'available', unavailableFeature: 'Not available', unknownState: 'Click once to authorise and read the current state', title: 'OneTouch', subtitle: 'Quick controls', customise: 'Customise', quit: 'Quit', settings: 'Settings', close: 'Close menu', outsideClose: 'Click outside to close', open: 'Open OneTouch menu', enabled: 'enabled', disabled: 'disabled', processing: 'Processing…', completed: 'Completed', trashAlreadyEmpty: 'Trash is already empty', downloadsAlreadyEmpty: 'Downloads folder is already empty', runAction: 'Run', chooseAction: 'Choose', openSettings: 'Open', confirmAction: 'Confirm', confirmHint: 'Click Confirm again to continue', openingSettings: 'Opening System Settings', unavailable: 'The macOS command could not be completed', permissionRequired: 'This control needs macOS permission', airpodsUnpaired: 'No paired Bluetooth headphones found', airpodsDisconnected: 'Not connected', resolutionPanelTitle: 'Screen resolution', resolutionBack: 'Back to controls', resolutionLoading: 'Reading available resolutions…', resolutionNoDisplay: 'No display', resolutionNoModes: 'No compatible resolutions were found.', resolutionDisplays: 'Displays', resolutionOptions: 'Available resolutions', resolutionHiDpi: 'HiDPI', resolutionStandard: 'Standard', retry: 'Try again', timerTitle: 'Turn off timer', timerBack: 'Back to controls', timerPrompt: 'Choose how long this stays on', timer30m: '30 minutes', timer1h: '1 hour', timer2h: '2 hours', timer4h: '4 hours', timerToday: 'Until the end of today', timerNone: 'No timer', timerNoneNote: 'Keep the current state until you change it', timerTurnsOff: 'OneTouch will turn it off automatically', timerExpired: 'Timer finished', timerRetry: 'Could not turn it off · retrying in 1 minute', timerLongPressHint: 'Click to choose a duration', diskLongPressHint: 'Hold to manage protected disks', diskPanelTitle: 'Protected disks', diskPanelSubtitle: 'Protected disks stay connected', diskBack: 'Back to controls', diskLoading: 'Reading ejectable disks…', diskNone: 'No ejectable disks or disk images are mounted.', diskProtected: 'Protected — OneTouch will skip this disk', diskWillEject: 'Will be ejected by the main switch', desktop: ['Hide desktop icons', 'Finder'], darkMode: ['Dark mode', 'Click the switch to choose a duration'], awake: ['Keep awake', 'Click the switch to choose a duration'], airpods: ['Bluetooth headphones', 'Automatically uses the connected or most recent audio device'], dnd: ['Focus', 'Click the switch to choose a duration'], nightShift: ['Night Shift', 'Warm the display colours'], screenSaver: ['Screen saver', 'Start a calm screen saver'], trueTone: ['True Tone', 'Match the display to ambient light'], frontApp: ['Switch front app', 'Bring the next app forward'], muteMic: ['Mute microphone', 'Restore the previous input volume when unmuted'], xcodeClean: ['Clean Xcode cache', 'Remove derived data'], emptyTrash: ['Empty Trash', 'Remove discarded files'], clearDownloads: ['Clear Downloads', 'Move all contents to Trash'], ejectDisk: ['Eject disks', 'Eject all · hold the switch to protect disks'], clipboard: ['Clear clipboard', 'Remove copied content'], hideWindow: ['Hide window', 'Hide the front app'], hideDock: ['Hide Dock', 'Show or hide the Dock'], lowPower: ['Low power mode', 'Reduce energy use'], highPower: ['High Power mode', 'Increase sustained performance on supported Macs'], music: ['Music playback', 'Play or pause the current queue'], spotify: ['Spotify playback', 'Play or pause Spotify'], hiddenFiles: ['Show hidden files', 'Reveal files in Finder'], displaySleep: ['Display sleep', 'Turn the display off'], resolution: ['Screen resolution', 'Choose directly in OneTouch'], hideWidgets: ['Hide desktop widgets', 'Keep the desktop clear in every workspace mode'], stageManager: ['Stage Manager', 'Organise open windows around the current task'], cleanScreen: ['Clean screen', 'Hold Esc to finish'], lockKeyboard: ['Lock keyboard', 'Use the menu to unlock'], lockScreen: ['Lock screen', 'Require your password'],
  },
  zh: {
    quitAppsNone: '没有需要关闭的应用',
    quitAppsRequested: '已请求关闭 {count} 个应用',
    quitApps: ['关闭其他应用', '保留当前应用、OneTouch 与 Finder'],
    preview: '预览模式', connected: '已连接 macOS', available: '可用', unavailableFeature: '当前不可用', unknownState: '点击一次授权并读取当前状态', title: 'OneTouch', subtitle: '快捷控制', customise: '自定义', quit: '退出', settings: '设置', close: '关闭菜单', outsideClose: '点击空白处关闭', open: '打开 OneTouch 菜单', enabled: '已开启', disabled: '已关闭', processing: '正在处理中…', completed: '已完成', trashAlreadyEmpty: '垃圾桶已经空了', downloadsAlreadyEmpty: '下载文件夹已经空了', runAction: '执行', chooseAction: '选择', openSettings: '打开', confirmAction: '确认', confirmHint: '再次点击“确认”继续', openingSettings: '正在打开系统设置', unavailable: '无法完成 macOS 命令', permissionRequired: '此功能需要 macOS 权限', airpodsUnpaired: '没有找到已配对的蓝牙耳机', airpodsDisconnected: '暂未连接', resolutionPanelTitle: '屏幕分辨率', resolutionBack: '返回控制列表', resolutionLoading: '正在读取可用分辨率…', resolutionNoDisplay: '没有显示器', resolutionNoModes: '没有找到兼容的分辨率。', resolutionDisplays: '显示器', resolutionOptions: '可用分辨率', resolutionHiDpi: 'HiDPI', resolutionStandard: '标准', retry: '重试', timerTitle: '定时关闭', timerBack: '返回控制列表', timerPrompt: '选择保持开启的时长', timer30m: '30 分钟', timer1h: '1 小时', timer2h: '2 小时', timer4h: '4 小时', timerToday: '直到今天结束', timerNone: '不定时', timerNoneNote: '保持当前状态，直到你再次切换', timerTurnsOff: '到时由 OneTouch 自动关闭', timerExpired: '定时已结束', timerRetry: '关闭失败 · 1 分钟后重试', timerLongPressHint: '点击选择开启时长', diskLongPressHint: '长按管理受保护磁盘', diskPanelTitle: '受保护的磁盘', diskPanelSubtitle: '受保护的磁盘会保持连接', diskBack: '返回控制列表', diskLoading: '正在读取可推出磁盘…', diskNone: '当前没有可推出的磁盘或磁盘映像。', diskProtected: '已保护，OneTouch 会跳过它', diskWillEject: '主开关执行时会推出', desktop: ['隐藏桌面图标', 'Finder'], darkMode: ['深色模式', '点击开关选择开启时长'], awake: ['保持唤醒', '点击开关选择开启时长'], airpods: ['蓝牙耳机', '自动选择已连接或最近使用的音频设备'], dnd: ['专注模式', '点击开关选择开启时长'], nightShift: ['夜览', '调暖显示屏色温'], screenSaver: ['屏幕保护程序', '启动安静的屏幕保护'], trueTone: ['原彩显示', '根据环境光调整显示效果'], frontApp: ['切换前台应用', '将下一个应用带到前台'], muteMic: ['麦克风静音', '取消静音时恢复上次输入音量'], xcodeClean: ['清理 Xcode 缓存', '删除派生数据'], emptyTrash: ['清空废纸篓', '移除已丢弃的文件'], clearDownloads: ['清理下载文件夹', '将全部内容移到废纸篓'], ejectDisk: ['推出磁盘', '短按全部推出 · 长按保护磁盘'], clipboard: ['清空剪贴板', '移除已复制的内容'], hideWindow: ['隐藏窗口', '隐藏前台应用'], hideDock: ['隐藏 Dock', '显示或隐藏 Dock'], lowPower: ['低电量模式', '降低 Mac 能耗'], highPower: ['高能耗模式', '在支持的 Mac 上提高持续性能'], music: ['音乐播放', '播放或暂停当前队列'], spotify: ['Spotify 播放', '播放或暂停 Spotify'], hiddenFiles: ['显示隐藏文件', '在 Finder 中显示文件'], displaySleep: ['显示器休眠', '关闭显示屏'], resolution: ['屏幕分辨率', '直接在 OneTouch 中选择'], hideWidgets: ['隐藏桌面小组件', '在普通桌面和台前调度中保持整洁'], stageManager: ['台前调度', '围绕当前任务整理已打开的窗口'], cleanScreen: ['屏幕清洁', '长按 Esc 退出'], lockKeyboard: ['锁定键盘', '从菜单中解锁'], lockScreen: ['锁定屏幕', '需要密码才能继续'],
  },
};

export const ACCESSIBILITY_GUIDE_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Enable Accessibility',
    explanation: 'Grant access once so OneTouch controls can work without interrupting you later.',
    privacy: 'Only the controls you choose are executed. Keystrokes are never recorded or uploaded.',
    appName: 'OneTouch',
    dragHint: 'Drag into the list',
    fallback: 'Use + to choose OneTouch.app',
    close: 'Close',
    quit: 'Quit OneTouch',
    successTitle: 'Accessibility Enabled',
    successStatus: 'OneTouch is ready.',
  }),
  zh: Object.freeze({
    title: '开启辅助功能权限',
    explanation: '只需授权一次，之后使用 OneTouch 控制时不会再被打断。',
    privacy: '仅执行你主动选择的控制，不会记录或上传键盘内容。',
    appName: 'OneTouch',
    dragHint: '拖入辅助功能列表',
    fallback: '请使用 + 选择 OneTouch.app',
    close: '关闭',
    quit: '退出 OneTouch',
    successTitle: '辅助功能已开启',
    successStatus: 'OneTouch 已准备就绪。',
  }),
});

const KEYBOARD_CLEANING_COPY = Object.freeze({
  en: ['Keyboard cleaning', 'Ignore key presses while cleaning · turn off from the menu'],
  zh: ['键盘清洁', '清洁时忽略键盘输入 · 从菜单关闭'],
});

const SWITCHES = [
  { id: 'desktop', icon: Grid3X3 }, { id: 'darkMode', icon: MoonStar }, { id: 'awake', icon: Coffee }, { id: 'airpods', icon: Headphones }, { id: 'dnd', icon: BellOff }, { id: 'nightShift', icon: MoonStar }, { id: 'screenSaver', icon: MonitorUp }, { id: 'trueTone', icon: Sun },
  { id: 'frontApp', icon: AppWindowMac }, { id: 'muteMic', icon: MicOff }, { id: 'xcodeClean', icon: BrushCleaning }, { id: 'emptyTrash', icon: Trash2 }, { id: 'clearDownloads', icon: FolderDown }, { id: 'ejectDisk', icon: Disc3 }, { id: 'clipboard', icon: Paintbrush }, { id: 'hideWindow', icon: EyeOff }, { id: 'hideDock', icon: PanelTopClose }, { id: 'lowPower', icon: Zap }, { id: 'highPower', icon: Gauge }, { id: 'music', icon: Music2 }, { id: 'spotify', icon: AudioLines }, { id: 'hiddenFiles', icon: FolderOpen }, { id: 'displaySleep', icon: MonitorUp }, { id: 'resolution', icon: MonitorCog }, { id: 'hideWidgets', icon: LayoutDashboard }, { id: 'stageManager', icon: PanelsTopLeft }, { id: 'cleanScreen', icon: Eye }, { id: 'lockKeyboard', icon: Keyboard }, { id: 'lockScreen', icon: Lock },
  { id: 'quitApps', icon: AppWindowMac },
].map((item) => ({ ...item, kind: controlKind(item.id) }));

const NON_TOGGLE_CONTROL_IDS = SWITCHES
  .filter((item) => item.kind !== CONTROL_KINDS.TOGGLE)
  .map((item) => item.id);
const MIN_ACTION_PROGRESS_MS = 650;
const COMPLETION_FEEDBACK_MS = 1400;
const SECONDARY_PANEL_EXIT_MS = 100;
const GITHUB_URL = 'https://github.com/Cherry-Yiran/OneTouch';
const X_URL = 'https://x.com/hizhm1';
const TIMER_POPOVER_WIDTH = 178;
const TIMER_POPOVER_HEIGHT = 220;
const TIMER_POPOVER_GAP = 6;
const TIMER_POPOVER_MARGIN = 8;

const INITIAL_SWITCHES = { desktop: true, darkMode: true, awake: false, airpods: true, dnd: true, nightShift: true, screenSaver: false, trueTone: true, frontApp: false, muteMic: false, xcodeClean: false, emptyTrash: false, clearDownloads: false, ejectDisk: false, clipboard: false, hideWindow: false, hideDock: false, lowPower: false, highPower: false, music: false, spotify: false, hiddenFiles: false, displaySleep: false, resolution: false, hideWidgets: false, stageManager: false, cleanScreen: false, lockKeyboard: false, lockScreen: false, quitApps: false };

const DEFAULT_VISIBLE_IDS = SWITCHES.slice(0, 8).map((item) => item.id);
const ALL_SWITCH_IDS = SWITCHES.map((item) => item.id);
const NATIVE_SYMBOLS = Object.freeze({
  desktop: 'square.grid.3x3', darkMode: 'moon.stars', awake: 'cup.and.saucer', airpods: 'headphones',
  dnd: 'moon.fill', nightShift: 'moon.haze', screenSaver: 'display', trueTone: 'sun.max',
  frontApp: 'macwindow.on.rectangle', muteMic: 'mic.slash', xcodeClean: 'paintbrush', emptyTrash: 'trash', clearDownloads: 'folder.badge.minus',
  ejectDisk: 'eject', clipboard: 'clipboard', hideWindow: 'eye.slash', hideDock: 'dock.rectangle',
  lowPower: 'bolt', highPower: 'gauge.with.dots.needle.67percent', music: 'music.note', spotify: 'waveform',
  hiddenFiles: 'folder', displaySleep: 'display', resolution: 'display.and.arrow.down',
  hideWidgets: 'rectangle.3.group', stageManager: 'squares.leading.rectangle',
  cleanScreen: 'eye', lockKeyboard: 'keyboard', lockScreen: 'lock', quitApps: 'rectangle.stack.badge.minus',
});

function restoreIds(storageKey, fallback, includeNewItems = false) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(saved)) return fallback;
    const restored = [...new Set(saved.filter((id) => ALL_SWITCH_IDS.includes(id)))];
    return includeNewItems ? [...restored, ...ALL_SWITCH_IDS.filter((id) => !restored.includes(id))] : restored;
  } catch {
    return fallback;
  }
}

function sameIds(first, second) {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function sameShortcutMap(first, second) {
  const firstEntries = Object.entries(first || {});
  const secondEntries = Object.entries(second || {});
  return firstEntries.length === secondEntries.length
    && firstEntries.every(([id, shortcut]) => second[id] === shortcut);
}

function normaliseOrderedIds(ids) {
  if (!Array.isArray(ids)) return ALL_SWITCH_IDS;
  const restored = [...new Set(ids.filter((id) => ALL_SWITCH_IDS.includes(id)))];
  return [...restored, ...ALL_SWITCH_IDS.filter((id) => !restored.includes(id))];
}

function useSecondaryPress(onLongPress, blocked) {
  const pressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  const cancel = () => {
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    setPressing(false);
  };

  const open = (consumeNextClick = false) => {
    if (!onLongPress || blocked) return;
    cancel();
    longPressTriggeredRef.current = consumeNextClick;
    onLongPress();
  };

  const begin = (event) => {
    if (!onLongPress || blocked || event.button !== 0) return;
    longPressTriggeredRef.current = false;
    cancel();
    setPressing(true);
    pressTimerRef.current = window.setTimeout(() => open(true), 480);
  };

  const consumeClick = () => {
    if (!longPressTriggeredRef.current) return false;
    longPressTriggeredRef.current = false;
    return true;
  };

  useEffect(() => () => {
    window.clearTimeout(pressTimerRef.current);
  }, []);

  return { begin, cancel, consumeClick, open, pressing };
}

function Toggle({
  checked,
  loading = false,
  disabled = false,
  stateKnown = true,
  onChange,
  onLongPress,
  popoverOpen = false,
  timerTriggerId,
  label,
}) {
  const secondary = useSecondaryPress(onLongPress, loading || disabled);

  return (
    <button
      className={`toggle ${checked ? 'is-on' : ''} ${loading ? 'is-loading' : ''} ${disabled ? 'is-unavailable' : ''} ${!stateKnown ? 'is-unknown' : ''} ${onLongPress ? 'supports-long-press' : ''} ${secondary.pressing ? 'is-secondary-pressing' : ''} ${popoverOpen ? 'has-open-popover' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading}
      aria-haspopup={timerTriggerId ? 'menu' : undefined}
      aria-expanded={timerTriggerId ? popoverOpen : undefined}
      aria-controls={popoverOpen && timerTriggerId ? `timer-popover-${timerTriggerId}` : undefined}
      aria-label={label}
      data-state-known={stateKnown}
      data-timer-trigger={timerTriggerId}
      disabled={loading || disabled}
      onPointerDown={secondary.begin}
      onPointerUp={secondary.cancel}
      onPointerCancel={secondary.cancel}
      onPointerLeave={secondary.cancel}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        secondary.open(false);
      }}
      onKeyDown={(event) => {
        if (onLongPress && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          secondary.open(false);
        }
      }}
      onClick={(event) => {
        if (secondary.consumeClick()) return;
        onChange(event.currentTarget);
      }}
    >
      <span />
    </button>
  );
}

function RowAction({
  pending,
  completed,
  disabled,
  onClick,
  onLongPress,
  label,
}) {
  const secondary = useSecondaryPress(onLongPress, pending || disabled);

  return (
    <button
      className={`toggle momentary-control ${pending ? 'is-loading' : ''} ${completed ? 'is-on is-complete' : ''} ${onLongPress ? 'supports-long-press' : ''} ${secondary.pressing ? 'is-secondary-pressing' : ''}`}
      type="button"
      aria-busy={pending}
      aria-label={label}
      disabled={pending || disabled}
      onPointerDown={secondary.begin}
      onPointerUp={secondary.cancel}
      onPointerCancel={secondary.cancel}
      onPointerLeave={secondary.cancel}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        secondary.open(false);
      }}
      onKeyDown={(event) => {
        if (onLongPress && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          secondary.open(false);
        }
      }}
      onClick={() => {
        if (secondary.consumeClick()) return;
        onClick();
      }}
    >
      <span />
    </button>
  );
}

function localiseNativeError(error, language, text) {
  const message = String(error || '');
  if (language !== 'zh') return message || text.unavailable;
  if (/Accessibility permission/i.test(message)) return '需要在系统设置中允许辅助功能权限';
  if (/Automation permission|Apple events|not authorized to send/i.test(message)) return '需要在系统设置中允许自动化权限';
  if (/Bluetooth permission/i.test(message)) return '需要在系统设置中允许蓝牙权限';
  if (/Focus status permission.*denied/i.test(message)) return '专注状态权限已被拒绝，请允许后重试';
  if (/Focus status permission/i.test(message)) return '需要允许读取专注状态';
  if (/Downloads folder access is required/i.test(message)) return '需要允许 OneTouch 访问下载文件夹';
  if (/could not locate the Downloads folder/i.test(message)) return '无法找到下载文件夹';
  if (/Moved \d+ item\(s\).*could not move/i.test(message)) return '部分内容已移到废纸篓，但仍有文件无法处理';
  if (/could not move .* to Trash/i.test(message)) return '无法将下载文件夹中的内容移到废纸篓';
  if (/not supported by the active display/i.test(message)) return '当前显示器不支持此功能';
  if (/unavailable for the active display/i.test(message)) return '当前显示器无法使用此功能';
  if (/unsupported on this Mac/i.test(message)) return '这台 Mac 不支持此功能';
  if (/Spotify is not installed/i.test(message)) return '这台 Mac 尚未安装 Spotify';
  if (/could not quit the open applications/i.test(message)) return 'macOS 无法关闭当前应用';
  if (/No paired (AirPods|Bluetooth audio device)/i.test(message)) return text.airpodsUnpaired;
  if (/(AirPods|Bluetooth audio device) operation is already in progress/i.test(message)) return '蓝牙耳机正在处理中，请稍候';
  if (/(AirPods|Bluetooth audio device) did not respond/i.test(message)) return '蓝牙耳机响应超时，请稍后重试';
  if (/(AirPods|Bluetooth audio device) did not disconnect reliably|(AirPods|Bluetooth audio device) could not disconnect/i.test(message)) return '蓝牙耳机未能稳定断开，请确认当前没有应用正在使用它';
  if (/(AirPods|Bluetooth audio device) did not connect reliably|(AirPods|Bluetooth audio device) could not connect/i.test(message)) return '蓝牙耳机未能连接，请确认设备在附近且已开启';
  if (/No (ejectable volumes|external disks)/i.test(message)) return '没有检测到可推出的磁盘';
  if (/No active displays|display is no longer connected/i.test(message)) return '没有检测到可用的显示器';
  if (/resolution is no longer available/i.test(message)) return '这个分辨率已不可用，请重新选择';
  if (/(display|resolution).*(could not|rejected|did not reach)/i.test(message)) return 'macOS 未能切换到所选分辨率，请重试';
  if (/timed out|did not respond/i.test(message)) return 'macOS 响应超时，请稍后重试';
  return message || text.unavailable;
}

function audioDeviceDescription(snapshot, language, text) {
  if (!snapshot?.paired) return text.airpodsUnpaired;
  const battery = [
    snapshot.batteryLevel != null && `${language === 'zh' ? '电量' : 'Battery'} ${snapshot.batteryLevel}%`,
    snapshot.batteryLeft != null && `${language === 'zh' ? '左耳' : 'Left'} ${snapshot.batteryLeft}%`,
    snapshot.batteryRight != null && `${language === 'zh' ? '右耳' : 'Right'} ${snapshot.batteryRight}%`,
    snapshot.batteryCase != null && `${language === 'zh' ? '盒' : 'Case'} ${snapshot.batteryCase}%`,
  ].filter(Boolean).join(' · ');
  const connection = snapshot.connected ? (language === 'zh' ? '已连接' : 'Connected') : text.airpodsDisconnected;
  return battery ? `${connection} · ${battery}` : connection;
}

export default function App() {
  const nativeView = new URLSearchParams(window.location.search).get('view');
  const nativeApp = isNativeApp();
  const [language, setLanguage] = useState(() => localStorage.getItem('switchboard-language') || 'zh');
  const [appName, setAppName] = useState('OneTouch');
  const [appIdentifier, setAppIdentifier] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesInitialTab, setPreferencesInitialTab] = useState('general');
  const [switches, setSwitches] = useState(() => {
    try {
      const restored = { ...INITIAL_SWITCHES, ...JSON.parse(localStorage.getItem('switchboard-state') || '{}') };
      NON_TOGGLE_CONTROL_IDS.forEach((id) => { restored[id] = false; });
      return restored;
    } catch { return INITIAL_SWITCHES; }
  });
  const [visibleIds, setVisibleIds] = useState(() => {
    return clampVisibleControlIds(restoreIds('switchboard-visible', DEFAULT_VISIBLE_IDS));
  });
  const [orderedIds, setOrderedIds] = useState(() => {
    return restoreIds('switchboard-order', ALL_SWITCH_IDS, true);
  });
  const [shortcuts, setShortcuts] = useState(() => (
    restoreShortcuts(localStorage.getItem('switchboard-shortcuts'), ALL_SWITCH_IDS)
  ));
  const [timers, setTimers] = useState(() => (
    restoreTimers(localStorage.getItem('switchboard-timers'))
  ));
  const [startAtLogin, setStartAtLogin] = useState(false);
  const [startAtLoginLoading, setStartAtLoginLoading] = useState(nativeApp && nativeView === 'preferences');
  const [startAtLoginError, setStartAtLoginError] = useState('');
  const [nativePreferencesMessage, setNativePreferencesMessage] = useState('');
  const [nativePreferencesMessageError, setNativePreferencesMessageError] = useState(false);
  const [nativeUpdate, setNativeUpdate] = useState({ phase: 'idle', version: '', progress: null });
  const [whatsNewVisible, setWhatsNewVisible] = useState(false);
  const [whatsNewExpanded, setWhatsNewExpanded] = useState(false);
  const [pendingActionIds, setPendingActionIds] = useState(() => new Set());
  const [completedActionIds, setCompletedActionIds] = useState(() => new Set());
  const [actionResultMessages, setActionResultMessages] = useState({});
  const [nativeControls, setNativeControls] = useState(null);
  const [nativeSnapshotReady, setNativeSnapshotReady] = useState(!nativeApp);
  const [audioDeviceState, setAudioDeviceState] = useState(null);
  const [rowMessages, setRowMessages] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [resolutionPanelOpen, setResolutionPanelOpen] = useState(false);
  const [displayConfiguration, setDisplayConfiguration] = useState(null);
  const [selectedDisplayId, setSelectedDisplayId] = useState(null);
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const [resolutionError, setResolutionError] = useState('');
  const [pendingResolutionMode, setPendingResolutionMode] = useState('');
  const [timerPanelControlId, setTimerPanelControlId] = useState(null);
  const [timerPopoverAnchor, setTimerPopoverAnchor] = useState(null);
  const [timerSelectionPending, setTimerSelectionPending] = useState(false);
  const [diskPanelOpen, setDiskPanelOpen] = useState(false);
  const [closingSecondaryPanel, setClosingSecondaryPanel] = useState(null);
  const [externalDisks, setExternalDisks] = useState([]);
  const [externalDisksLoading, setExternalDisksLoading] = useState(false);
  const [externalDisksError, setExternalDisksError] = useState('');
  const [savingDiskName, setSavingDiskName] = useState('');
  const shortcutActionRef = useRef(null);
  const nativePopoverActionRef = useRef(null);
  const nativePreferencesActionRef = useRef(null);
  const pendingNativeUpdateRef = useRef(null);
  const timerRearmAttemptedRef = useRef(new Set());
  const secondaryCloseTimerRef = useRef(null);
  const secondaryClosingRef = useRef(null);
  const isBetaBuild = appIdentifier === 'design.ryan.onetouch.beta';
  const text = useMemo(() => ({
    ...COPY[language],
    title: appName,
    lockKeyboard: KEYBOARD_CLEANING_COPY[language],
  }), [appName, language]);

  const closeSecondaryPanel = (panel) => {
    if (secondaryClosingRef.current) return;
    secondaryClosingRef.current = panel;
    setClosingSecondaryPanel(panel);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    secondaryCloseTimerRef.current = window.setTimeout(() => {
      if (panel === 'resolution') setResolutionPanelOpen(false);
      if (panel === 'disk') setDiskPanelOpen(false);
      secondaryClosingRef.current = null;
      setClosingSecondaryPanel(null);
    }, reducedMotion ? 0 : SECONDARY_PANEL_EXIT_MS);
  };

  useEffect(() => () => {
    window.clearTimeout(secondaryCloseTimerRef.current);
  }, []);

  const closeTimerPopover = () => {
    setTimerPanelControlId(null);
    setTimerPopoverAnchor(null);
  };

  const openTimerPopover = (id, trigger) => {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const hostRect = trigger.closest('.status-popover')?.getBoundingClientRect() || {
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      left: 0,
      width: window.innerWidth,
    };
    const belowTop = rect.bottom - hostRect.top + TIMER_POPOVER_GAP;
    const fitsBelow = rect.bottom + TIMER_POPOVER_GAP + TIMER_POPOVER_HEIGHT
      <= hostRect.bottom - TIMER_POPOVER_MARGIN;
    const top = fitsBelow
      ? belowTop
      : Math.max(TIMER_POPOVER_MARGIN, rect.top - hostRect.top - TIMER_POPOVER_GAP - TIMER_POPOVER_HEIGHT);
    const left = Math.min(
      Math.max(TIMER_POPOVER_MARGIN, rect.right - hostRect.left - TIMER_POPOVER_WIDTH),
      hostRect.width - TIMER_POPOVER_WIDTH - TIMER_POPOVER_MARGIN,
    );
    setResolutionPanelOpen(false);
    setDiskPanelOpen(false);
    setTimerPopoverAnchor({
      top,
      left,
      placement: fitsBelow ? 'below' : 'above',
    });
    setTimerPanelControlId(id);
  };

  const openTimerPicker = async (id, trigger) => {
    if (!nativeApp) {
      openTimerPopover(id, trigger);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    setTimerPopoverAnchor(null);
    setTimerPanelControlId(id);
    try {
      const choice = await showNativeTimerMenu({
        right: rect.right,
        bottom: rect.bottom,
      }, language);
      closeTimerPopover();
      if (!choice) return;
      const deadline = deadlineForTimerChoice(choice);
      if (deadline !== undefined) await applyControlTimer(id, deadline);
    } catch (error) {
      closeTimerPopover();
      const message = localiseNativeError(error, language, text);
      setRowMessages((current) => ({
        ...current,
        [id]: { text: message, recoveryPane: null },
      }));
      setAnnouncement(`${text[id]?.[0] || id}: ${message}`);
    }
  };

  useEffect(() => localStorage.setItem('switchboard-language', language), [language]);
  useEffect(() => localStorage.setItem('switchboard-state', JSON.stringify(switches)), [switches]);
  useEffect(() => localStorage.setItem('switchboard-visible', JSON.stringify(visibleIds)), [visibleIds]);
  useEffect(() => localStorage.setItem('switchboard-order', JSON.stringify(orderedIds)), [orderedIds]);
  useEffect(() => localStorage.setItem('switchboard-shortcuts', JSON.stringify(shortcuts)), [shortcuts]);
  useEffect(() => localStorage.setItem('switchboard-timers', JSON.stringify(timers)), [timers]);
  useEffect(() => {
    getNativeAppIdentifier().then(setAppIdentifier).catch(() => setAppIdentifier(''));
    getNativeAppName().then(setAppName).catch(() => setAppName('OneTouch'));
    getNativeAppVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);
  useEffect(() => {
    if (!appVersion) return;
    const seenVersion = localStorage.getItem('onetouch-whats-new-seen-version') || '';
    setWhatsNewVisible(shouldPresentReleaseNotes(appVersion, seenVersion));
    setWhatsNewExpanded(false);
  }, [appVersion]);
  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover' || !appIdentifier || isBetaBuild) return undefined;
    const storageKey = `onetouch-update-last-check-${appIdentifier}`;
    if (!updateCheckIsDue(localStorage.getItem(storageKey))) return undefined;
    const timer = window.setTimeout(() => {
      checkForAppUpdate({ manual: false }).catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [appIdentifier, isBetaBuild, nativeApp, nativeView]);
  useEffect(() => {
    if (nativeView !== 'preferences') return;
    sendNativeCustomizationToPopover({ visibleIds, orderedIds, shortcuts }).catch(() => undefined);
  }, [nativeView, orderedIds, shortcuts, visibleIds]);
  useEffect(() => {
    if (nativeView !== 'popover') return undefined;
    let disposed = false;
    let unlisten = () => {};

    listenForNativeCustomization((customization) => {
      if (!customization || typeof customization !== 'object') return;
      if (Array.isArray(customization.visibleIds)) {
        const nextVisibleIds = clampVisibleControlIds(
          customization.visibleIds.filter((id) => ALL_SWITCH_IDS.includes(id)),
        );
        setVisibleIds((current) => sameIds(current, nextVisibleIds) ? current : nextVisibleIds);
      }
      if (Array.isArray(customization.orderedIds)) {
        const nextOrderedIds = normaliseOrderedIds(customization.orderedIds);
        setOrderedIds((current) => sameIds(current, nextOrderedIds) ? current : nextOrderedIds);
      }
      if (customization.shortcuts && typeof customization.shortcuts === 'object') {
        const nextShortcuts = restoreShortcuts(customization.shortcuts, ALL_SWITCH_IDS);
        setShortcuts((current) => sameShortcutMap(current, nextShortcuts) ? current : nextShortcuts);
      }
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      unlisten();
    };
  }, [nativeView]);

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return undefined;
    let disposed = false;
    let unlisten = () => {};
    listenForNativePopoverActions((payload) => {
      nativePopoverActionRef.current?.(payload);
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten();
    };
  }, [nativeApp, nativeView]);
  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return undefined;
    let disposed = false;
    let unlisten = () => {};
    listenForNativePreferencesActions((payload) => {
      nativePreferencesActionRef.current?.(payload);
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten();
    };
  }, [nativeApp, nativeView]);
  useEffect(() => {
    if (!nativeApp || !['popover', 'preferences'].includes(nativeView)) return undefined;
    let disposed = false;
    setStartAtLoginLoading(true);
    getNativeAutostartEnabled()
      .then((enabled) => {
        if (!disposed) setStartAtLogin(Boolean(enabled));
      })
      .catch(() => {
        if (!disposed) setStartAtLoginError(language === 'zh' ? '无法读取登录启动设置。' : 'Could not read the login setting.');
      })
      .finally(() => {
        if (!disposed) setStartAtLoginLoading(false);
      });
    return () => { disposed = true; };
  }, [language, nativeView]);
  useEffect(() => {
    document.documentElement.dataset.nativeView = nativeView || 'preview';
    return () => { delete document.documentElement.dataset.nativeView; };
  }, [nativeView]);
  useEffect(() => {
    if (!resolutionPanelOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !pendingResolutionMode) closeSecondaryPanel('resolution');
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pendingResolutionMode, resolutionPanelOpen, closingSecondaryPanel]);
  const refreshNativeSnapshot = async () => {
    if (!nativeApp) return null;
    const snapshot = await getNativeSnapshot();
    if (!snapshot) return null;
    setNativeControls(snapshot.controls || {});
    setNativeSnapshotReady(true);
    setAudioDeviceState(snapshot.audioDevice || null);
    setSwitches((current) => {
      const next = { ...current };
      Object.entries(snapshot.controls || {}).forEach(([id, control]) => {
        if (control.stateKnown !== false) next[id] = Boolean(control.state);
      });
      return next;
    });
    return snapshot;
  };

  useEffect(() => {
    if (!nativeApp) return undefined;
    refreshNativeSnapshot().catch(() => undefined);
    const refreshOnFocus = () => refreshNativeSnapshot().catch(() => undefined);
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [nativeApp]);

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover' || !nativeSnapshotReady) return;
    const now = Date.now();
    const activeTimerIds = new Set(
      Object.entries(timers)
        .filter(([, deadline]) => deadline > now)
        .map(([id]) => id),
    );
    timerRearmAttemptedRef.current.forEach((id) => {
      const control = nativeControls?.[id];
      const controlEnabled = control?.stateKnown !== false && Boolean(control?.state);
      if (!activeTimerIds.has(id) || controlEnabled) timerRearmAttemptedRef.current.delete(id);
    });

    Object.keys(timers).forEach((id) => {
      const control = nativeControls?.[id];
      const controlEnabled = control?.stateKnown !== false && Boolean(control?.state);
      if (
        timers[id] <= now
        || controlEnabled
        || control?.available === false
        || pendingActionIds.has(id)
        || timerRearmAttemptedRef.current.has(id)
      ) return;

      timerRearmAttemptedRef.current.add(id);
      setPendingActionIds((current) => new Set(current).add(id));
      setNativeSwitch(id, true)
        .then((result) => {
          const enabled = Boolean(result?.state ?? true);
          setSwitches((current) => ({ ...current, [id]: enabled }));
          setNativeControls((current) => current ? ({
            ...current,
            [id]: {
              ...current[id],
              state: enabled,
              stateKnown: result?.stateKnown !== false,
            },
          }) : current);
          setRowMessages((current) => ({ ...current, [id]: null }));
        })
        .catch((error) => {
          const message = localiseNativeError(error, language, text);
          setTimers((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
          setRowMessages((current) => ({
            ...current,
            [id]: { text: message, recoveryPane: recoveryPaneForError(error) },
          }));
          setAnnouncement(`${text[id]?.[0] || id}: ${message}`);
        })
        .finally(() => {
          setPendingActionIds((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        });
    });
  }, [
    language,
    nativeApp,
    nativeControls,
    nativeSnapshotReady,
    nativeView,
    pendingActionIds,
    text,
    timers,
  ]);

  useEffect(() => {
    if (nativeApp && nativeView !== 'popover') return undefined;
    const nextDeadline = nextTimerDeadline(timers);
    if (!nextDeadline) return undefined;
    const delay = Math.max(0, nextDeadline - Date.now());
    const timer = window.setTimeout(async () => {
      const dueIds = Object.entries(timers)
        .filter(([, deadline]) => deadline <= Date.now())
        .map(([id]) => id);
      const completedIds = [];
      const cancelledIds = [];
      const retryDeadlines = {};
      for (const id of dueIds) {
        try {
          const result = await setNativeSwitch(id, false);
          setSwitches((current) => ({ ...current, [id]: false }));
          setNativeControls((current) => current ? ({
            ...current,
            [id]: {
              ...current[id],
              state: Boolean(result?.state ?? false),
              stateKnown: result?.stateKnown !== false,
            },
          }) : current);
          setRowMessages((current) => ({ ...current, [id]: null }));
          setAnnouncement(`${text[id]?.[0] || id}: ${text.timerExpired}`);
          completedIds.push(id);
        } catch (error) {
          const message = localiseNativeError(error, language, text);
          const recoveryPane = recoveryPaneForError(error);
          if (recoveryPane) {
            cancelledIds.push(id);
          } else {
            retryDeadlines[id] = timerRetryDeadline();
          }
          setRowMessages((current) => ({
            ...current,
            [id]: {
              text: recoveryPane ? message : text.timerRetry,
              recoveryPane,
            },
          }));
          setAnnouncement(`${text[id]?.[0] || id}: ${message}${recoveryPane ? '' : ` · ${text.timerRetry}`}`);
        }
      }
      if (dueIds.length > 0) {
        setTimers((current) => {
          const next = { ...current };
          completedIds.forEach((id) => delete next[id]);
          cancelledIds.forEach((id) => delete next[id]);
          Object.entries(retryDeadlines).forEach(([id, deadline]) => {
            next[id] = deadline;
          });
          return next;
        });
      }
    }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [language, nativeApp, nativeView, text, timers]);

  const menuItems = useMemo(
    () => orderedIds
      .map((id) => SWITCHES.find((item) => item.id === id))
      .filter((item) => item && visibleIds.includes(item.id)),
    [orderedIds, visibleIds],
  );
  const currentResolutionSummary = displayResolutionSummary(displayConfiguration);

  useEffect(() => {
    if (nativeView !== 'popover' || nativeApp) return;
    resizeNativePopover(menuItems.length).catch(() => undefined);
  }, [menuItems.length, nativeApp, nativeView]);

  const loadDisplayConfiguration = async () => {
    setResolutionLoading(true);
    setResolutionError('');
    try {
      const configuration = await getNativeDisplayConfiguration();
      setDisplayConfiguration(configuration);
      const preferred = primaryDisplay(configuration);
      setSelectedDisplayId((current) => (
        configuration?.displays?.some((display) => display.id === current)
          ? current
          : preferred?.id ?? null
      ));
      return configuration;
    } catch (error) {
      const message = localiseNativeError(error, language, text);
      setResolutionError(message);
      setAnnouncement(`${text.resolutionPanelTitle}: ${message}`);
      return null;
    } finally {
      setResolutionLoading(false);
    }
  };

  const openResolutionPanel = async () => {
    closeTimerPopover();
    setDiskPanelOpen(false);
    setResolutionPanelOpen(true);
    setResolutionError('');
    if (nativeApp) await showLegacyPopover();
    await loadDisplayConfiguration();
  };

  const selectResolutionMode = async (displayId, mode) => {
    const key = `${displayId}:${mode.id}`;
    if (pendingResolutionMode) return;
    setPendingResolutionMode(key);
    setResolutionError('');
    setAnnouncement(`${text.resolutionPanelTitle}: ${text.processing}`);
    try {
      const configuration = await setNativeDisplayMode(displayId, mode.id);
      setDisplayConfiguration(configuration);
      setSelectedDisplayId(displayId);
      setRowMessages((current) => ({ ...current, resolution: null }));
      setAnnouncement(`${text.resolutionPanelTitle}: ${mode.width} × ${mode.height}`);
    } catch (error) {
      const message = localiseNativeError(error, language, text);
      setResolutionError(message);
      setRowMessages((current) => ({
        ...current,
        resolution: { text: message, recoveryPane: null },
      }));
      setAnnouncement(`${text.resolutionPanelTitle}: ${message}`);
    } finally {
      setPendingResolutionMode('');
    }
  };

  const activateControl = async (id, currentStateOverride) => {
    const control = nativeControls?.[id];
    if (nativeApp && control && !control.available) return;
    const kind = control?.mode || controlKind(id);
    const controlTitle = text[id]?.[0] || id;
    setRowMessages((current) => ({ ...current, [id]: null }));

    if (id === 'resolution') {
      await openResolutionPanel();
      return;
    }

    if (kind !== CONTROL_KINDS.TOGGLE) {
      if (pendingActionIds.has(id) || completedActionIds.has(id)) return;
      setActionResultMessages((current) => ({ ...current, [id]: null }));
      setAnnouncement(`${controlTitle}: ${text.processing}`);
      setPendingActionIds((current) => new Set(current).add(id));
      const progressStartedAt = Date.now();

      try {
        const result = await setNativeSwitch(id, true);
        if (kind === CONTROL_KINDS.ACTION) {
          const remainingProgress = MIN_ACTION_PROGRESS_MS - (Date.now() - progressStartedAt);
          if (remainingProgress > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, remainingProgress));
          }
          const quitAppsCount = id === 'quitApps' ? quitAppsRequestCount(result?.message) : null;
          const completionMessage = id === 'emptyTrash' && result?.message === 'trash-already-empty'
            ? text.trashAlreadyEmpty
            : id === 'clearDownloads' && result?.message === 'downloads-already-empty'
              ? text.downloadsAlreadyEmpty
              : quitAppsCount === 0
                ? text.quitAppsNone
                : quitAppsCount != null
                  ? text.quitAppsRequested.replace('{count}', String(quitAppsCount))
                  : text.completed;
          setAnnouncement(`${controlTitle}: ${completionMessage}`);
          setActionResultMessages((current) => ({ ...current, [id]: completionMessage }));
          setCompletedActionIds((current) => new Set(current).add(id));
          window.setTimeout(() => {
            setCompletedActionIds((current) => {
              const next = new Set(current);
              next.delete(id);
              return next;
            });
            setActionResultMessages((current) => ({ ...current, [id]: null }));
          }, COMPLETION_FEEDBACK_MS);
        } else {
          setAnnouncement(`${controlTitle}: ${text.openingSettings}`);
        }
      } catch (error) {
        const message = localiseNativeError(error, language, text);
        setActionResultMessages((current) => ({ ...current, [id]: null }));
        setRowMessages((current) => ({
          ...current,
          [id]: { text: message, recoveryPane: recoveryPaneForError(error) },
        }));
        setAnnouncement(`${controlTitle}: ${message}`);
      } finally {
        setPendingActionIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setSwitches((current) => ({ ...current, [id]: false }));
      }
      return;
    }

    const currentState = typeof currentStateOverride === 'boolean'
      ? currentStateOverride
      : Boolean(switches[id]);
    const enabled = !currentState;
    if (pendingActionIds.has(id)) return;
    const previous = currentState;
    setPendingActionIds((current) => new Set(current).add(id));
    setSwitches((current) => ({ ...current, [id]: enabled }));
    setAnnouncement(`${controlTitle}: ${text.processing}`);
    try {
      const result = await setNativeSwitch(id, enabled);
      setSwitches((current) => ({ ...current, [id]: Boolean(result?.state ?? enabled) }));
      setNativeControls((current) => current ? ({ ...current, [id]: { ...current[id], state: Boolean(result?.state ?? enabled), stateKnown: result?.stateKnown !== false } }) : current);
      setAnnouncement(`${controlTitle}: ${enabled ? text.enabled : text.disabled}`);
      if (id === 'airpods') {
        refreshNativeSnapshot().catch(() => undefined);
      } else if (['dnd', 'nightShift', 'trueTone', 'lowPower', 'highPower'].includes(id)) {
        await refreshNativeSnapshot();
      }
      if (!enabled && TIMED_CONTROL_IDS.includes(id)) {
        setTimers((current) => {
          if (!current[id]) return current;
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
      return true;
    } catch (error) {
      setSwitches((current) => ({ ...current, [id]: previous }));
      const message = localiseNativeError(error, language, text);
      setRowMessages((current) => ({
        ...current,
        [id]: { text: message, recoveryPane: recoveryPaneForError(error) },
      }));
      setAnnouncement(`${controlTitle}: ${message}`);
      return false;
    } finally {
      setPendingActionIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const applyControlTimer = async (id, deadline) => {
    if (timerSelectionPending) return;
    closeTimerPopover();
    setTimerSelectionPending(true);
    const control = nativeControls?.[id];
    const currentlyEnabled = control?.stateKnown !== false && typeof control?.state === 'boolean'
      ? control.state
      : Boolean(switches[id]);
    const enabled = currentlyEnabled || await activateControl(id, false);
    if (enabled) {
      setTimers((current) => {
        const next = { ...current };
        if (deadline) next[id] = deadline;
        else delete next[id];
        return next;
      });
      setAnnouncement(`${text[id]?.[0] || id}: ${deadline ? formatTimerRemaining(deadline, language) : text.enabled}`);
    }
    setTimerSelectionPending(false);
  };

  const loadExternalDisks = async () => {
    setExternalDisksLoading(true);
    setExternalDisksError('');
    try {
      setExternalDisks(await getNativeExternalDisks());
    } catch (error) {
      setExternalDisksError(localiseNativeError(error, language, text));
    } finally {
      setExternalDisksLoading(false);
    }
  };

  const openDiskPanel = async () => {
    setResolutionPanelOpen(false);
    closeTimerPopover();
    setDiskPanelOpen(true);
    await loadExternalDisks();
  };

  const toggleDiskExclusion = async (disk) => {
    if (savingDiskName) return;
    const previous = externalDisks;
    const next = externalDisks.map((item) => (
      item.id === disk.id ? { ...item, excluded: !item.excluded } : item
    ));
    setExternalDisks(next);
    setSavingDiskName(disk.name);
    setExternalDisksError('');
    try {
      await setNativeEjectExclusions(
        next.filter((item) => item.excluded).map((item) => item.name),
      );
    } catch (error) {
      setExternalDisks(previous);
      setExternalDisksError(localiseNativeError(error, language, text));
    } finally {
      setSavingDiskName('');
    }
  };

  shortcutActionRef.current = async (id) => {
    if (!ALL_SWITCH_IDS.includes(id)) return;
    const kind = nativeControls?.[id]?.mode || controlKind(id);
    if (kind === CONTROL_KINDS.CHOICE) {
      await showNativePopover();
    }

    let currentStateOverride;
    if (kind === CONTROL_KINDS.TOGGLE) {
      try {
        const snapshot = await refreshNativeSnapshot();
        const state = snapshot?.controls?.[id]?.state;
        if (snapshot?.controls?.[id]?.stateKnown !== false && typeof state === 'boolean') {
          currentStateOverride = state;
        }
      } catch {
        // The normal control path still reports a useful error if macOS cannot respond.
      }
    }
    await activateControl(id, currentStateOverride);
  };

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return;
    syncNativeGlobalShortcuts(shortcuts, (id) => {
      shortcutActionRef.current?.(id);
    }).then(({ failed }) => {
      if (failed.length > 0) {
        setAnnouncement(language === 'zh' ? '部分全局快捷键无法注册，请在偏好设置中重新录制。' : 'Some global shortcuts could not be registered. Record them again in Preferences.');
      }
    }).catch(() => {
      setAnnouncement(language === 'zh' ? '全局快捷键暂时不可用。' : 'Global shortcuts are temporarily unavailable.');
    });
  }, [language, nativeApp, nativeView, shortcuts]);

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return undefined;
    return () => {
      clearNativeGlobalShortcuts().catch(() => undefined);
    };
  }, [nativeApp, nativeView]);

  const updateStartAtLogin = async (enabled) => {
    if (startAtLoginLoading) return;
    const previous = startAtLogin;
    setStartAtLogin(Boolean(enabled));
    setStartAtLoginLoading(true);
    setStartAtLoginError('');
    try {
      const actual = await setNativeAutostartEnabled(enabled);
      setStartAtLogin(Boolean(actual));
    } catch {
      setStartAtLogin(previous);
      setStartAtLoginError(language === 'zh' ? '无法更新登录启动设置。' : 'Could not update the login setting.');
    } finally {
      setStartAtLoginLoading(false);
    }
  };

  const installPendingAppUpdate = async () => {
    const update = pendingNativeUpdateRef.current;
    if (!update) {
      await checkForAppUpdate({ manual: true });
      return;
    }
    let downloaded = 0;
    let contentLength = null;
    setNativeUpdate((current) => ({ ...current, phase: 'downloading', progress: 0 }));
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength || null;
          setNativeUpdate((current) => ({ ...current, phase: 'downloading', progress: 0 }));
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          const progress = contentLength
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : null;
          setNativeUpdate((current) => ({ ...current, phase: 'downloading', progress }));
        } else if (event.event === 'Finished') {
          setNativeUpdate((current) => ({ ...current, phase: 'installing', progress: 100 }));
        }
      });
      setNativeUpdate((current) => ({ ...current, phase: 'restarting', progress: 100 }));
      await relaunchNativeApp();
    } catch {
      setNativeUpdate((current) => ({ ...current, phase: 'error', progress: null }));
    }
  };

  const checkForAppUpdate = async ({ manual = false } = {}) => {
    if (isBetaBuild) {
      if (manual) setNativeUpdate({ phase: 'disabled', version: '', progress: null });
      return null;
    }
    pendingNativeUpdateRef.current = null;
    if (manual) setNativeUpdate({ phase: 'checking', version: '', progress: null });
    try {
      const update = await checkNativeAppUpdate();
      if (appIdentifier) {
        localStorage.setItem(`onetouch-update-last-check-${appIdentifier}`, String(Date.now()));
      }
      if (!update) {
        setNativeUpdate({ phase: manual ? 'upToDate' : 'idle', version: '', progress: null });
        return null;
      }
      pendingNativeUpdateRef.current = update;
      setNativeUpdate({ phase: 'available', version: update.version, progress: null });
      return update;
    } catch {
      setNativeUpdate({ phase: manual ? 'error' : 'idle', version: '', progress: null });
      return null;
    }
  };

  nativePreferencesActionRef.current = async ({
    action,
    controlId = '',
    payload = '',
  } = {}) => {
    const preferenceCopy = PREFERENCES_COPY[language];
    if (action === 'language' && ['zh', 'en'].includes(payload)) {
      setLanguage(payload);
      setNativePreferencesMessage('');
      setNativePreferencesMessageError(false);
      return;
    }
    if (action === 'startAtLogin') {
      await updateStartAtLogin(payload === '1');
      return;
    }
    if (action === 'appUpdate') {
      if (payload === 'install' && pendingNativeUpdateRef.current) {
        await installPendingAppUpdate();
        return;
      }
      await checkForAppUpdate({ manual: true });
      return;
    }
    if (action === 'visibility' && ALL_SWITCH_IDS.includes(controlId)) {
      const requestedVisible = payload === '1';
      setVisibleIds((current) => {
        if (current.includes(controlId) === requestedVisible) return current;
        return toggleVisibleControl(current, controlId);
      });
      return;
    }
    if (action === 'order') {
      try {
        const requested = JSON.parse(payload);
        const next = normaliseOrderedIds(requested);
        setOrderedIds((current) => sameIds(current, next) ? current : next);
      } catch {
        // Ignore malformed native ordering messages and preserve the saved order.
      }
      return;
    }
    if (action !== 'shortcut' || !ALL_SWITCH_IDS.includes(controlId)) return;

    if (!payload) {
      setShortcuts((current) => {
        const next = { ...current };
        delete next[controlId];
        return next;
      });
      setNativePreferencesMessage('');
      setNativePreferencesMessageError(false);
      return;
    }
    if (conflictingShortcutId(shortcuts, controlId, payload)) {
      setNativePreferencesMessage(preferenceCopy.shortcutDuplicate);
      setNativePreferencesMessageError(true);
      return;
    }
    try {
      await validateNativeGlobalShortcut(payload);
      setShortcuts((current) => ({ ...current, [controlId]: payload }));
      setNativePreferencesMessage(preferenceCopy.shortcutSaved);
      setNativePreferencesMessageError(false);
    } catch {
      setNativePreferencesMessage(preferenceCopy.shortcutUnavailable);
      setNativePreferencesMessageError(true);
    }
  };

  const recoverPermission = async (id, pane) => {
    const controlTitle = text[id]?.[0] || id;
    try {
      if (pane === 'accessibility') await showNativeAccessibilityGuide();
      else await openNativeSystemSettings(pane);
      setAnnouncement(`${controlTitle}: ${text.openingSettings}`);
    } catch (error) {
      const message = localiseNativeError(error, language, text);
      setAnnouncement(`${controlTitle}: ${message}`);
    }
  };

  const openPreferences = async (pane = 'general') => {
    if (nativeView === 'popover' && await openNativePreferences(pane)) return;
    setIsOpen(false);
    setPreferencesInitialTab(pane);
    setPreferencesOpen(true);
  };

  const quit = async () => {
    if (nativeView === 'popover' && await quitNativeApp()) return;
    setIsOpen(false);
  };

  nativePopoverActionRef.current = async ({ action, controlId, value } = {}) => {
    if (action === 'refresh') {
      await refreshNativeSnapshot().catch(() => undefined);
      return;
    }
    if (action === 'settings') {
      await openPreferences('general');
      return;
    }
    if (action === 'customise') {
      await openPreferences('customise');
      return;
    }
    if (action === 'quit') {
      await quit();
      return;
    }
    if (action === 'updateInstall') {
      await installPendingAppUpdate();
      return;
    }
    if (action === 'updateRetry') {
      await checkForAppUpdate({ manual: true });
      return;
    }
    if (action === 'whatsNewExpand') {
      setWhatsNewExpanded(true);
      return;
    }
    if (action === 'whatsNewDismiss') {
      localStorage.setItem('onetouch-whats-new-seen-version', RELEASE_NOTES_VERSION);
      setWhatsNewVisible(false);
      setWhatsNewExpanded(false);
      return;
    }
    if (!ALL_SWITCH_IDS.includes(controlId)) return;
    if (action === 'state') {
      const enabled = Boolean(value);
      setSwitches((current) => ({ ...current, [controlId]: enabled }));
      setNativeControls((current) => current ? ({
        ...current,
        [controlId]: {
          ...current[controlId],
          state: enabled,
          stateKnown: true,
        },
      }) : current);
      setPendingActionIds((current) => {
        const next = new Set(current);
        next.delete(controlId);
        return next;
      });
      return;
    }
    if (action === 'timer') {
      const choice = ['30m', '1h', '2h', '4h', 'today', 'none'][value];
      const deadline = deadlineForTimerChoice(choice);
      if (deadline !== undefined) await applyControlTimer(controlId, deadline);
      return;
    }

    const feedback = rowMessages[controlId];
    const control = nativeControls?.[controlId];
    const recoveryPane = (typeof feedback === 'object' && feedback?.recoveryPane)
      || recoveryPaneForError(control?.message);
    if (recoveryPane) {
      await recoverPermission(controlId, recoveryPane);
      return;
    }
    if (action === 'toggle') {
      await activateControl(controlId, !Boolean(value));
      return;
    }
    await activateControl(controlId);
  };

  const nativeAnnouncement = useMemo(() => {
    const copy = PREFERENCES_COPY[language];
    if (nativeUpdate.phase === 'available') {
      return {
        kind: 'update',
        title: copy.updateAvailable.replace('%s', nativeUpdate.version),
        message: copy.updateReadyNote,
        actionLabel: copy.downloadAndInstall,
        action: 'updateInstall',
        expanded: false,
      };
    }
    if (nativeUpdate.phase === 'downloading') {
      return {
        kind: 'update',
        title: copy.downloadingUpdate,
        message: nativeUpdate.progress == null ? '' : `${nativeUpdate.progress}%`,
        actionLabel: '',
        action: '',
        busy: true,
        expanded: false,
      };
    }
    if (nativeUpdate.phase === 'installing' || nativeUpdate.phase === 'restarting') {
      return {
        kind: 'update',
        title: nativeUpdate.phase === 'installing' ? copy.installingUpdate : copy.restartingAfterUpdate,
        message: copy.updateReadyNote,
        actionLabel: '',
        action: '',
        busy: true,
        expanded: false,
      };
    }
    if (nativeUpdate.phase === 'error') {
      return {
        kind: 'update',
        title: copy.updateFailed,
        message: '',
        actionLabel: copy.retryUpdate,
        action: 'updateRetry',
        error: true,
        expanded: false,
      };
    }
    if (!whatsNewVisible) return null;
    const releaseCopy = RELEASE_NOTES[language];
    return {
      kind: 'whatsNew',
      title: releaseCopy.title.replace('%s', appVersion),
      message: whatsNewExpanded ? releaseCopy.items.join('\n') : releaseCopy.summary,
      actionLabel: whatsNewExpanded ? releaseCopy.done : releaseCopy.view,
      action: whatsNewExpanded ? 'whatsNewDismiss' : 'whatsNewExpand',
      expanded: whatsNewExpanded,
    };
  }, [appVersion, language, nativeUpdate, whatsNewExpanded, whatsNewVisible]);

  const nativePopoverModel = useMemo(() => ({
    language,
    title: text.title,
    subtitle: text.subtitle,
    settingsLabel: text.settings,
    customiseLabel: text.customise,
    quitLabel: text.quit,
    announcement: nativeAnnouncement,
    rows: menuItems.map((item) => {
      const [defaultTitle, defaultDescription] = text[item.id];
      const control = nativeControls?.[item.id];
      const pending = pendingActionIds.has(item.id);
      const unavailable = Boolean(nativeApp && control && !control.available);
      const stateKnown = !nativeApp
        || (nativeSnapshotReady && Boolean(control) && control.stateKnown !== false);
      const kind = control?.mode || item.kind;
      const completed = completedActionIds.has(item.id);
      const { checked, locked: actionLocked } = controlSwitchState(
        kind,
        stateKnown && Boolean(switches[item.id]),
        { pending, completed },
      );
      const feedback = rowMessages[item.id];
      const error = typeof feedback === 'string' ? feedback : feedback?.text;
      const recoveryPane = feedback?.recoveryPane || recoveryPaneForError(control?.message);
      const title = item.id === 'airpods' && audioDeviceState?.paired
        ? audioDeviceState.name
        : defaultTitle;
      const unavailableMessage = item.id === 'airpods'
        ? text.airpodsUnpaired
        : localiseNativeError(control?.message, language, text);
      const description = item.id === 'airpods'
        ? audioDeviceDescription(audioDeviceState, language, text)
        : item.id === 'resolution' && currentResolutionSummary
          ? currentResolutionSummary
          : defaultDescription;
      const timerStatus = TIMED_CONTROL_IDS.includes(item.id) && checked
        ? timers[item.id]
          ? formatTimerRemaining(timers[item.id], language)
          : text.timerNone
        : '';
      const status = unavailable
        ? unavailableMessage
        : pending
          ? text.processing
          : completed
            ? actionResultMessages[item.id] || text.completed
            : error || timerStatus
              || (!stateKnown && kind === CONTROL_KINDS.TOGGLE ? text.unknownState : description);
      const actionLabel = recoveryPane
        ? text.openSettings
        : kind === CONTROL_KINDS.CHOICE
          ? text.chooseAction
          : kind === CONTROL_KINDS.SETTINGS
            ? text.openSettings
            : text.runAction;
      return {
        id: item.id,
        title,
        status,
        symbol: NATIVE_SYMBOLS[item.id] || 'circle',
        kind,
        checked,
        enabled: !unavailable,
        locked: actionLocked,
        pending,
        timed: TIMED_CONTROL_IDS.includes(item.id),
        error: Boolean(error),
        actionLabel,
      };
    }),
  }), [
    audioDeviceState,
    actionResultMessages,
    completedActionIds,
    currentResolutionSummary,
    language,
    menuItems,
    nativeAnnouncement,
    nativeApp,
    nativeControls,
    nativeSnapshotReady,
    pendingActionIds,
    rowMessages,
    switches,
    text,
    timers,
  ]);

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return;
    updateNativePopover(nativePopoverModel).catch(() => undefined);
  }, [nativeApp, nativePopoverModel, nativeView]);

  const accessibilityGuideModel = useMemo(() => ({
    ...ACCESSIBILITY_GUIDE_COPY[language],
    appName,
    language,
    autoShow: true,
  }), [appName, language]);

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return;
    updateNativeAccessibilityGuide(accessibilityGuideModel).catch(() => undefined);
  }, [accessibilityGuideModel, nativeApp, nativeView]);

  const nativePreferencesModel = useMemo(() => {
    const copy = {
      ...PREFERENCES_COPY[language],
      aboutTitle: appName,
    };
    let updateTitle = copy.checkForUpdates;
    let updateStatus = '';
    if (nativeUpdate.phase === 'checking') updateTitle = copy.checkingForUpdates;
    if (nativeUpdate.phase === 'available') {
      updateTitle = `${copy.downloadAndInstall} ${nativeUpdate.version}`;
      updateStatus = copy.updateAvailable.replace('%s', nativeUpdate.version);
    }
    if (nativeUpdate.phase === 'downloading') {
      updateTitle = nativeUpdate.progress == null
        ? copy.downloadingUpdate
        : `${copy.downloadingUpdate} ${nativeUpdate.progress}%`;
    }
    if (nativeUpdate.phase === 'installing') updateTitle = copy.installingUpdate;
    if (nativeUpdate.phase === 'restarting') updateTitle = copy.restartingAfterUpdate;
    if (nativeUpdate.phase === 'upToDate') updateStatus = copy.upToDate;
    if (nativeUpdate.phase === 'error') {
      updateTitle = copy.retryUpdate;
      updateStatus = copy.updateFailed;
    }
    if (isBetaBuild) {
      updateTitle = copy.betaUpdateTitle;
      updateStatus = copy.betaUpdateStatus;
    }
    return {
      language,
      appVersion,
      githubURL: GITHUB_URL,
      xURL: X_URL,
      startAtLogin,
      startAtLoginLoading,
      startAtLoginError,
      shortcutMessage: nativePreferencesMessage,
      shortcutMessageError: nativePreferencesMessageError,
      update: {
        phase: isBetaBuild ? 'disabled' : nativeUpdate.phase,
        title: updateTitle,
        status: updateStatus,
        disabled: isBetaBuild,
      },
      strings: copy,
      rows: orderedIds.map((id) => {
        const item = SWITCHES.find((candidate) => candidate.id === id);
        const kind = item?.kind || CONTROL_KINDS.TOGGLE;
        const kindLabelKey = `control${kind[0].toUpperCase()}${kind.slice(1)}`;
        return {
          id,
          title: text[id]?.[0] || id,
          kindLabel: copy[kindLabelKey] || '',
          symbol: NATIVE_SYMBOLS[id] || 'circle',
          visible: visibleIds.includes(id),
          shortcut: shortcuts[id] || '',
          shortcutDisplay: formatShortcut(shortcuts[id] || ''),
        };
      }),
    };
  }, [
    appName,
    appVersion,
    isBetaBuild,
    language,
    nativePreferencesMessage,
    nativePreferencesMessageError,
    nativeUpdate,
    orderedIds,
    shortcuts,
    startAtLogin,
    startAtLoginError,
    startAtLoginLoading,
    text,
    visibleIds,
  ]);

  useEffect(() => {
    if (!nativeApp || nativeView !== 'popover') return;
    updateNativePreferences(nativePreferencesModel).catch(() => undefined);
  }, [nativeApp, nativePreferencesModel, nativeView]);

  const preferences = (
    <Preferences
      language={language}
      setLanguage={setLanguage}
      items={SWITCHES}
      text={text}
      visibleIds={visibleIds}
      setVisibleIds={setVisibleIds}
      orderedIds={orderedIds}
      setOrderedIds={setOrderedIds}
      startAtLogin={startAtLogin}
      startAtLoginLoading={startAtLoginLoading}
      startAtLoginError={startAtLoginError}
      onStartAtLoginChange={updateStartAtLogin}
      shortcuts={shortcuts}
      setShortcuts={setShortcuts}
      nativeTitlebar={nativeView === 'preferences'}
      initialTab={preferencesInitialTab}
      appName={appName}
      appVersion={appVersion}
      onClose={nativeView === 'preferences' ? hideNativeWindow : () => setPreferencesOpen(false)}
    />
  );

  const popover = (
    <section className="status-popover" aria-label={text.title}>
      <header className="popover-head" aria-hidden={resolutionPanelOpen || diskPanelOpen}><div className="app-identity"><span className="app-mark"><ToggleRight size={19} /></span><span><strong>{text.title}</strong><small>{text.subtitle}</small></span></div></header>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div className="switch-list" aria-hidden={resolutionPanelOpen || diskPanelOpen} inert={resolutionPanelOpen || diskPanelOpen ? true : undefined}>{menuItems.map((item) => {
        const Icon = item.icon;
        const [defaultTitle, defaultDescription] = text[item.id];
        const control = nativeControls?.[item.id];
        const pending = pendingActionIds.has(item.id);
        const unavailable = Boolean(nativeApp && control && !control.available);
        const stateKnown = !nativeApp || (nativeSnapshotReady && Boolean(control) && control.stateKnown !== false);
        const kind = control?.mode || item.kind;
        const completed = completedActionIds.has(item.id);
        const { checked, locked: actionLocked } = controlSwitchState(
          kind,
          stateKnown && Boolean(switches[item.id]),
          { pending, completed },
        );
        const feedback = rowMessages[item.id];
        const error = typeof feedback === 'string' ? feedback : feedback?.text;
        const recoveryPane = feedback?.recoveryPane || recoveryPaneForError(control?.message);
        const recoverable = Boolean(recoveryPane);
        const hasError = Boolean(error);
        const title = item.id === 'airpods' && audioDeviceState?.paired ? audioDeviceState.name : defaultTitle;
        const unavailableMessage = item.id === 'airpods' ? text.airpodsUnpaired : localiseNativeError(control?.message, language, text);
        const description = item.id === 'airpods'
          ? audioDeviceDescription(audioDeviceState, language, text)
          : item.id === 'resolution' && currentResolutionSummary
            ? currentResolutionSummary
            : defaultDescription;
        const timerStatus = TIMED_CONTROL_IDS.includes(item.id) && checked
          ? timers[item.id]
            ? formatTimerRemaining(timers[item.id], language)
            : text.timerNone
          : '';
        const status = unavailable
          ? unavailableMessage
          : pending
            ? text.processing
            : completed
              ? actionResultMessages[item.id] || text.completed
              : error || timerStatus || (!stateKnown && kind === CONTROL_KINDS.TOGGLE ? text.unknownState : description);
        const controlLabel = `${title}: ${status}`;
        const affordance = usesSwitchAffordance(kind)
          ? <Toggle
              checked={checked}
              loading={pending}
              disabled={unavailable || actionLocked}
              stateKnown={stateKnown}
              timerTriggerId={TIMED_CONTROL_IDS.includes(item.id) ? item.id : undefined}
              popoverOpen={timerPanelControlId === item.id}
              onChange={(trigger) => {
                if (recoverable) {
                  recoverPermission(item.id, recoveryPane);
                  return;
                }
                if (kind === CONTROL_KINDS.ACTION || !TIMED_CONTROL_IDS.includes(item.id) || checked) {
                  closeTimerPopover();
                  activateControl(item.id);
                  return;
                }
                if (timerPanelControlId === item.id) closeTimerPopover();
                else openTimerPicker(item.id, trigger);
              }}
              onLongPress={item.id === 'ejectDisk' ? openDiskPanel : undefined}
              label={controlLabel}
            />
          : <RowAction pending={pending} completed={completed} disabled={unavailable} onClick={() => activateControl(item.id)} label={controlLabel} />;
        return <div className={`switch-row kind-${kind} ${checked ? 'is-active' : ''} ${pending ? 'is-pending' : ''} ${completed ? 'is-complete' : ''} ${unavailable ? 'is-unavailable' : ''} ${recoverable ? 'is-recoverable' : ''} ${!stateKnown ? 'is-unknown' : ''} ${hasError ? 'has-error' : ''}`} key={item.id}><span className="switch-icon"><Icon size={20} strokeWidth={1.65} /></span><span className="switch-copy"><strong>{title}</strong><small>{status}</small></span>{affordance}</div>;
      })}</div>
      <footer className="popover-foot" aria-hidden={resolutionPanelOpen || diskPanelOpen} inert={resolutionPanelOpen || diskPanelOpen ? true : undefined}><button type="button" className="foot-icon" aria-label={text.settings} onClick={() => openPreferences('general')}><SlidersHorizontal size={20} /></button><button type="button" className="customise" onClick={() => openPreferences('customise')}>{text.customise}</button><button type="button" className="foot-icon power" aria-label={text.quit} onClick={quit}><Power size={21} /></button></footer>
      {resolutionPanelOpen && (
        <ResolutionPanel
          copy={text}
          configuration={displayConfiguration}
          selectedDisplayId={selectedDisplayId}
          loading={resolutionLoading}
          error={resolutionError}
          pendingModeKey={pendingResolutionMode}
          closing={closingSecondaryPanel === 'resolution'}
          onClose={() => {
            if (!pendingResolutionMode) closeSecondaryPanel('resolution');
          }}
          onRetry={loadDisplayConfiguration}
          onSelectDisplay={setSelectedDisplayId}
          onSelectMode={selectResolutionMode}
        />
      )}
      {!nativeApp && timerPanelControlId && timerPopoverAnchor && (
        <TimerPanel
          controlId={timerPanelControlId}
          anchor={timerPopoverAnchor}
          copy={text}
          onClose={closeTimerPopover}
          onSelect={applyControlTimer}
        />
      )}
      {diskPanelOpen && (
        <DiskPanel
          disks={externalDisks}
          copy={text}
          loading={externalDisksLoading}
          error={externalDisksError}
          savingName={savingDiskName}
          closing={closingSecondaryPanel === 'disk'}
          onClose={() => {
            if (!savingDiskName) closeSecondaryPanel('disk');
          }}
          onRetry={loadExternalDisks}
          onToggle={toggleDiskExclusion}
        />
      )}
    </section>
  );

  if (nativeView === 'popover') {
    return <main className="native-popover-shell" data-language={language}>{popover}</main>;
  }

  if (nativeView === 'preferences') {
    return <main className="native-preferences-shell" data-language={language}>{preferences}</main>;
  }

  return (
    <main className="status-app" data-language={language}>
      <div className="mac-stage" aria-label="macOS status bar application preview">
        <div className="wallpaper-art" aria-hidden="true"><i /><i /><i /></div>
        <header className="menu-bar">
          <div className="menu-left"><span className="apple-mark">●</span><span>Finder</span><span>File</span><span>Edit</span><span>View</span></div>
          <div className="menu-right"><span>⌁</span><span>◒</span><span>◖</span><span>100%</span><button type="button" className="tray-trigger" aria-label={isOpen ? text.close : text.open} onClick={() => setIsOpen((value) => !value)}><ToggleRight size={16} /></button></div>
        </header>
        <button type="button" className="ambient-dismiss" aria-label={text.outsideClose} onClick={() => setIsOpen(false)} />

        {isOpen && popover}

        {preferencesOpen && <><button type="button" className="preferences-scrim" aria-label="Close preferences window" onClick={() => setPreferencesOpen(false)} />{preferences}</>}
        <div className="stage-caption"><Languages size={14} /> {language === 'zh' ? '状态栏应用原型 · 点击右上角图标展开' : 'STATUS BAR APP PREVIEW · CLICK THE TOP-RIGHT ICON'}</div>
      </div>
    </main>
  );
}
