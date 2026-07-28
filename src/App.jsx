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
import Preferences from './Preferences.jsx';
import ResolutionPanel from './ResolutionPanel.jsx';
import TimerPanel from './TimerPanel.jsx';
import DiskPanel from './DiskPanel.jsx';
import {
  CONTROL_KINDS,
  controlKind,
  requiresConfirmation,
} from './controlInteractions.js';
import {
  getNativeAppVersion,
  getNativeAutostartEnabled,
  getNativeDisplayConfiguration,
  getNativeExternalDisks,
  getNativeSnapshot,
  clearNativeGlobalShortcuts,
  hideNativeWindow,
  isNativeApp,
  listenForNativeCustomization,
  openNativePreferences,
  openNativeSystemSettings,
  quitNativeApp,
  resizeNativePopover,
  sendNativeCustomizationToPopover,
  setNativeAutostartEnabled,
  setNativeMenuIcon,
  setNativeDisplayMode,
  setNativeEjectExclusions,
  setNativeSwitch,
  showNativePopover,
  syncNativeGlobalShortcuts,
} from './nativeBridge.js';
import { recoveryPaneForError } from './nativeErrors.js';
import { displayResolutionSummary, primaryDisplay } from './resolutionModel.js';
import { restoreShortcuts } from './shortcutModel.js';
import {
  formatTimerRemaining,
  nextTimerDeadline,
  restoreTimers,
  TIMED_CONTROL_IDS,
} from './timerModel.js';
import { clampVisibleControlIds, MAX_VISIBLE_CONTROLS } from './visibility.js';

const COPY = {
  en: {
    preview: 'Preview mode', connected: 'macOS connected', available: 'available', unavailableFeature: 'Not available', unknownState: 'Click once to authorise and read the current state', title: 'OneTouch', subtitle: 'Quick controls', customise: 'Customise', quit: 'Quit', settings: 'Settings', close: 'Close menu', outsideClose: 'Click outside to close', open: 'Open OneTouch menu', enabled: 'enabled', disabled: 'disabled', processing: 'Working…', completed: 'Completed', runAction: 'Run', openSettings: 'Open', confirmAction: 'Confirm', confirmHint: 'Click Confirm again to continue', openingSettings: 'Opening System Settings', unavailable: 'The macOS command could not be completed', permissionRequired: 'This control needs macOS permission', airpodsUnpaired: 'No paired Bluetooth headphones found', airpodsDisconnected: 'Not connected', resolutionPanelTitle: 'Screen resolution', resolutionBack: 'Back to controls', resolutionLoading: 'Reading available resolutions…', resolutionNoDisplay: 'No display', resolutionNoModes: 'No compatible resolutions were found.', resolutionDisplays: 'Displays', resolutionOptions: 'Available resolutions', resolutionHiDpi: 'HiDPI', resolutionStandard: 'Standard', retry: 'Try again', timerTitle: 'Turn off timer', timerBack: 'Back to controls', timerPrompt: 'Choose how long this stays on', timer30m: '30 minutes', timer1h: '1 hour', timer2h: '2 hours', timer4h: '4 hours', timerToday: 'Until the end of today', timerNone: 'No timer', timerNoneNote: 'Keep the current state until you change it', timerTurnsOff: 'OneTouch will turn it off automatically', timerExpired: 'Timer finished', diskPanelTitle: 'Protected disks', diskPanelSubtitle: 'Protected disks stay connected', diskBack: 'Back to controls', diskLoading: 'Reading external disks…', diskNone: 'No external physical disks are connected.', diskProtected: 'Protected — OneTouch will skip this disk', diskWillEject: 'Will be ejected by the main switch', desktop: ['Hide desktop icons', 'Finder'], darkMode: ['Dark mode', 'Switch now · hold the switch for a timer'], awake: ['Keep awake', 'Prevent sleep · hold the switch for a timer'], airpods: ['Bluetooth headphones', 'Automatically uses the connected or most recent audio device'], dnd: ['Focus', 'Silence interruptions · hold the switch for a timer'], nightShift: ['Night Shift', 'Warm the display colours'], screenSaver: ['Screen saver', 'Start a calm screen saver'], trueTone: ['True Tone', 'Match the display to ambient light'], frontApp: ['Switch front app', 'Bring the next app forward'], muteMic: ['Mute microphone', 'Restore the previous input volume when unmuted'], xcodeClean: ['Clean Xcode cache', 'Remove derived data'], emptyTrash: ['Empty Trash', 'Remove discarded files'], ejectDisk: ['Eject external disks', 'Run now · hold the switch to protect disks'], clipboard: ['Clear clipboard', 'Remove copied content'], hideWindow: ['Hide window', 'Hide the front app'], hideDock: ['Hide Dock', 'Show or hide the Dock'], lowPower: ['Low power mode', 'Reduce energy use'], highPower: ['High Power mode', 'Increase sustained performance on supported Macs'], music: ['Music playback', 'Play or pause the current queue'], spotify: ['Spotify playback', 'Play or pause Spotify'], hiddenFiles: ['Show hidden files', 'Reveal files in Finder'], displaySleep: ['Display sleep', 'Turn the display off'], resolution: ['Screen resolution', 'Choose directly in OneTouch'], hideWidgets: ['Hide desktop widgets', 'Keep the desktop clear in every workspace mode'], stageManager: ['Stage Manager', 'Organise open windows around the current task'], cleanScreen: ['Clean screen', 'Hold Esc to finish'], lockKeyboard: ['Lock keyboard', 'Use the menu to unlock'], lockScreen: ['Lock screen', 'Require your password'],
  },
  zh: {
    preview: '预览模式', connected: '已连接 macOS', available: '可用', unavailableFeature: '当前不可用', unknownState: '点击一次授权并读取当前状态', title: 'OneTouch', subtitle: '快捷控制', customise: '自定义', quit: '退出', settings: '设置', close: '关闭菜单', outsideClose: '点击空白处关闭', open: '打开 OneTouch 菜单', enabled: '已开启', disabled: '已关闭', processing: '正在执行…', completed: '已完成', runAction: '执行', openSettings: '打开', confirmAction: '确认', confirmHint: '再次点击“确认”继续', openingSettings: '正在打开系统设置', unavailable: '无法完成 macOS 命令', permissionRequired: '此功能需要 macOS 权限', airpodsUnpaired: '没有找到已配对的蓝牙耳机', airpodsDisconnected: '暂未连接', resolutionPanelTitle: '屏幕分辨率', resolutionBack: '返回控制列表', resolutionLoading: '正在读取可用分辨率…', resolutionNoDisplay: '没有显示器', resolutionNoModes: '没有找到兼容的分辨率。', resolutionDisplays: '显示器', resolutionOptions: '可用分辨率', resolutionHiDpi: 'HiDPI', resolutionStandard: '标准', retry: '重试', timerTitle: '定时关闭', timerBack: '返回控制列表', timerPrompt: '选择保持开启的时长', timer30m: '30 分钟', timer1h: '1 小时', timer2h: '2 小时', timer4h: '4 小时', timerToday: '直到今天结束', timerNone: '不定时', timerNoneNote: '保持当前状态，直到你再次切换', timerTurnsOff: '到时由 OneTouch 自动关闭', timerExpired: '定时已结束', diskPanelTitle: '受保护的磁盘', diskPanelSubtitle: '受保护的磁盘会保持连接', diskBack: '返回控制列表', diskLoading: '正在读取外置磁盘…', diskNone: '当前没有连接外置物理磁盘。', diskProtected: '已保护，OneTouch 会跳过它', diskWillEject: '主开关执行时会推出', desktop: ['隐藏桌面图标', 'Finder'], darkMode: ['深色模式', '短按切换 · 长按开关可定时'], awake: ['保持唤醒', '阻止休眠 · 长按开关可定时'], airpods: ['蓝牙耳机', '自动选择已连接或最近使用的音频设备'], dnd: ['专注模式', '减少打扰 · 长按开关可定时'], nightShift: ['夜览', '调暖显示屏色温'], screenSaver: ['屏幕保护程序', '启动安静的屏幕保护'], trueTone: ['原彩显示', '根据环境光调整显示效果'], frontApp: ['切换前台应用', '将下一个应用带到前台'], muteMic: ['麦克风静音', '取消静音时恢复上次输入音量'], xcodeClean: ['清理 Xcode 缓存', '删除派生数据'], emptyTrash: ['清空废纸篓', '移除已丢弃的文件'], ejectDisk: ['推出外置磁盘', '短按执行 · 长按开关保护磁盘'], clipboard: ['清空剪贴板', '移除已复制的内容'], hideWindow: ['隐藏窗口', '隐藏前台应用'], hideDock: ['隐藏 Dock', '显示或隐藏 Dock'], lowPower: ['低电量模式', '降低 Mac 能耗'], highPower: ['高能耗模式', '在支持的 Mac 上提高持续性能'], music: ['音乐播放', '播放或暂停当前队列'], spotify: ['Spotify 播放', '播放或暂停 Spotify'], hiddenFiles: ['显示隐藏文件', '在 Finder 中显示文件'], displaySleep: ['显示器休眠', '关闭显示屏'], resolution: ['屏幕分辨率', '直接在 OneTouch 中选择'], hideWidgets: ['隐藏桌面小组件', '在普通桌面和台前调度中保持整洁'], stageManager: ['台前调度', '围绕当前任务整理已打开的窗口'], cleanScreen: ['屏幕清洁', '长按 Esc 退出'], lockKeyboard: ['锁定键盘', '从菜单中解锁'], lockScreen: ['锁定屏幕', '需要密码才能继续'],
  },
};

const SWITCHES = [
  { id: 'desktop', icon: Grid3X3 }, { id: 'darkMode', icon: MoonStar }, { id: 'awake', icon: Coffee }, { id: 'airpods', icon: Headphones }, { id: 'dnd', icon: BellOff }, { id: 'nightShift', icon: MoonStar }, { id: 'screenSaver', icon: MonitorUp }, { id: 'trueTone', icon: Sun },
  { id: 'frontApp', icon: AppWindowMac }, { id: 'muteMic', icon: MicOff }, { id: 'xcodeClean', icon: BrushCleaning }, { id: 'emptyTrash', icon: Trash2 }, { id: 'ejectDisk', icon: Disc3 }, { id: 'clipboard', icon: Paintbrush }, { id: 'hideWindow', icon: EyeOff }, { id: 'hideDock', icon: PanelTopClose }, { id: 'lowPower', icon: Zap }, { id: 'highPower', icon: Gauge }, { id: 'music', icon: Music2 }, { id: 'spotify', icon: AudioLines }, { id: 'hiddenFiles', icon: FolderOpen }, { id: 'displaySleep', icon: MonitorUp }, { id: 'resolution', icon: MonitorCog }, { id: 'hideWidgets', icon: LayoutDashboard }, { id: 'stageManager', icon: PanelsTopLeft }, { id: 'cleanScreen', icon: Eye }, { id: 'lockKeyboard', icon: Keyboard }, { id: 'lockScreen', icon: Lock },
].map((item) => ({ ...item, kind: controlKind(item.id) }));

const NON_TOGGLE_CONTROL_IDS = SWITCHES
  .filter((item) => item.kind !== CONTROL_KINDS.TOGGLE)
  .map((item) => item.id);
const COMPLETION_FEEDBACK_MS = 1400;

const INITIAL_SWITCHES = { desktop: true, darkMode: true, awake: false, airpods: true, dnd: true, nightShift: true, screenSaver: false, trueTone: true, frontApp: false, muteMic: false, xcodeClean: false, emptyTrash: false, ejectDisk: false, clipboard: false, hideWindow: false, hideDock: false, lowPower: false, highPower: false, music: false, spotify: false, hiddenFiles: false, displaySleep: false, resolution: false, hideWidgets: false, stageManager: false, cleanScreen: false, lockKeyboard: false, lockScreen: false };

const DEFAULT_VISIBLE_IDS = SWITCHES.slice(0, 8).map((item) => item.id);
const ALL_SWITCH_IDS = SWITCHES.map((item) => item.id);
const MENU_BAR_ICONS = { switch: ToggleRight, command: ToggleRight, dots: Grid3X3, bolt: Zap };

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

function Toggle({
  checked,
  loading = false,
  disabled = false,
  stateKnown = true,
  onChange,
  onLongPress,
  label,
}) {
  const pressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => () => {
    window.clearTimeout(pressTimerRef.current);
  }, []);

  const cancelLongPress = () => {
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  const beginLongPress = (event) => {
    if (!onLongPress || event.button !== 0 || loading || disabled) return;
    longPressTriggeredRef.current = false;
    cancelLongPress();
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
    }, 480);
  };

  return (
    <button
      className={`toggle ${checked ? 'is-on' : ''} ${loading ? 'is-loading' : ''} ${disabled ? 'is-unavailable' : ''} ${!stateKnown ? 'is-unknown' : ''} ${onLongPress ? 'supports-long-press' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading}
      aria-label={label}
      data-state-known={stateKnown}
      disabled={loading || disabled}
      onPointerDown={beginLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress();
      }}
      onKeyDown={(event) => {
        if (onLongPress && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          onLongPress();
        }
      }}
      onClick={() => {
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          return;
        }
        onChange();
      }}
    >
      <span />
    </button>
  );
}

function RowAction({
  pending,
  confirming,
  completed,
  disabled,
  onClick,
  onLongPress,
  label,
}) {
  const pressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => () => {
    window.clearTimeout(pressTimerRef.current);
  }, []);

  const cancelLongPress = () => {
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  return (
    <button
      className={`toggle momentary-control ${pending ? 'is-loading' : ''} ${confirming ? 'is-confirming' : ''} ${completed ? 'is-on is-complete' : ''} ${onLongPress ? 'supports-long-press' : ''}`}
      type="button"
      aria-busy={pending}
      aria-label={label}
      disabled={pending || disabled}
      onPointerDown={(event) => {
        if (!onLongPress || event.button !== 0 || pending || disabled) return;
        longPressTriggeredRef.current = false;
        cancelLongPress();
        pressTimerRef.current = window.setTimeout(() => {
          longPressTriggeredRef.current = true;
          onLongPress();
        }, 480);
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress();
      }}
      onKeyDown={(event) => {
        if (onLongPress && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          onLongPress();
        }
      }}
      onClick={() => {
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          return;
        }
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
  if (/not supported by the active display/i.test(message)) return '当前显示器不支持此功能';
  if (/unavailable for the active display/i.test(message)) return '当前显示器无法使用此功能';
  if (/unsupported on this Mac/i.test(message)) return '这台 Mac 不支持此功能';
  if (/Spotify is not installed/i.test(message)) return '这台 Mac 尚未安装 Spotify';
  if (/No paired (AirPods|Bluetooth audio device)/i.test(message)) return text.airpodsUnpaired;
  if (/(AirPods|Bluetooth audio device) operation is already in progress/i.test(message)) return '蓝牙耳机正在处理中，请稍候';
  if (/(AirPods|Bluetooth audio device) did not respond/i.test(message)) return '蓝牙耳机响应超时，请稍后重试';
  if (/(AirPods|Bluetooth audio device) did not disconnect reliably|(AirPods|Bluetooth audio device) could not disconnect/i.test(message)) return '蓝牙耳机未能稳定断开，请确认当前没有应用正在使用它';
  if (/(AirPods|Bluetooth audio device) did not connect reliably|(AirPods|Bluetooth audio device) could not connect/i.test(message)) return '蓝牙耳机未能连接，请确认设备在附近且已开启';
  if (/No external disks/i.test(message)) return '没有检测到可推出的外置磁盘';
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
  const [appVersion, setAppVersion] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [menuIcon, setMenuIcon] = useState(() => {
    const savedIcon = localStorage.getItem('switchboard-menu-icon');
    return !savedIcon || savedIcon === 'command' ? 'switch' : savedIcon;
  });
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
  const [pendingActionIds, setPendingActionIds] = useState(() => new Set());
  const [completedActionIds, setCompletedActionIds] = useState(() => new Set());
  const [confirmingActionId, setConfirmingActionId] = useState(null);
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
  const [timerSelectionPending, setTimerSelectionPending] = useState(false);
  const [diskPanelOpen, setDiskPanelOpen] = useState(false);
  const [externalDisks, setExternalDisks] = useState([]);
  const [externalDisksLoading, setExternalDisksLoading] = useState(false);
  const [externalDisksError, setExternalDisksError] = useState('');
  const [savingDiskName, setSavingDiskName] = useState('');
  const shortcutActionRef = useRef(null);
  const text = COPY[language];

  useEffect(() => localStorage.setItem('switchboard-language', language), [language]);
  useEffect(() => localStorage.setItem('switchboard-state', JSON.stringify(switches)), [switches]);
  useEffect(() => localStorage.setItem('switchboard-visible', JSON.stringify(visibleIds)), [visibleIds]);
  useEffect(() => localStorage.setItem('switchboard-order', JSON.stringify(orderedIds)), [orderedIds]);
  useEffect(() => localStorage.setItem('switchboard-shortcuts', JSON.stringify(shortcuts)), [shortcuts]);
  useEffect(() => localStorage.setItem('switchboard-timers', JSON.stringify(timers)), [timers]);
  useEffect(() => localStorage.setItem('switchboard-menu-icon', menuIcon), [menuIcon]);
  useEffect(() => {
    getNativeAppVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);
  useEffect(() => {
    if (!confirmingActionId) return undefined;
    const timer = window.setTimeout(() => setConfirmingActionId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmingActionId]);
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
    if (nativeView !== 'preferences') return undefined;
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
    if (!nativeApp) return;
    const timer = window.setTimeout(() => {
      setNativeMenuIcon(menuIcon).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [menuIcon, nativeApp]);
  useEffect(() => {
    document.documentElement.dataset.nativeView = nativeView || 'preview';
    return () => { delete document.documentElement.dataset.nativeView; };
  }, [nativeView]);
  useEffect(() => {
    if (!resolutionPanelOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !pendingResolutionMode) setResolutionPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pendingResolutionMode, resolutionPanelOpen]);
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
    if (nativeApp && nativeView !== 'popover') return undefined;
    const nextDeadline = nextTimerDeadline(timers);
    if (!nextDeadline) return undefined;
    const delay = Math.max(0, nextDeadline - Date.now());
    const timer = window.setTimeout(async () => {
      const dueIds = Object.entries(timers)
        .filter(([, deadline]) => deadline <= Date.now())
        .map(([id]) => id);
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
          setAnnouncement(`${text[id]?.[0] || id}: ${text.timerExpired}`);
        } catch (error) {
          const message = localiseNativeError(error, language, text);
          setRowMessages((current) => ({
            ...current,
            [id]: { text: message, recoveryPane: recoveryPaneForError(error) },
          }));
          setAnnouncement(`${text[id]?.[0] || id}: ${message}`);
        }
      }
      if (dueIds.length > 0) {
        setTimers((current) => {
          const next = { ...current };
          dueIds.forEach((id) => delete next[id]);
          return next;
        });
      }
    }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [language, nativeApp, nativeView, text, timers]);

  const menuItems = useMemo(
    () => orderedIds
      .map((id) => SWITCHES.find((item) => item.id === id))
      .filter((item) => item && visibleIds.includes(item.id))
      .slice(0, MAX_VISIBLE_CONTROLS),
    [orderedIds, visibleIds],
  );
  const TrayIcon = MENU_BAR_ICONS[menuIcon] || ToggleRight;
  const currentResolutionSummary = displayResolutionSummary(displayConfiguration);

  useEffect(() => {
    if (nativeView !== 'popover') return;
    resizeNativePopover(menuItems.length).catch(() => undefined);
  }, [menuItems.length, nativeView]);

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
    setTimerPanelControlId(null);
    setDiskPanelOpen(false);
    setResolutionPanelOpen(true);
    setResolutionError('');
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
    setCompletedActionIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

    if (id === 'resolution') {
      await openResolutionPanel();
      return;
    }

    if (kind !== CONTROL_KINDS.TOGGLE) {
      if (pendingActionIds.has(id)) return;
      if (kind === CONTROL_KINDS.ACTION && requiresConfirmation(id) && confirmingActionId !== id) {
        setConfirmingActionId(id);
        setAnnouncement(`${controlTitle}: ${text.confirmHint}`);
        return;
      }
      setConfirmingActionId(null);
      setAnnouncement(`${controlTitle}: ${text.processing}`);
      setPendingActionIds((current) => new Set(current).add(id));

      try {
        await setNativeSwitch(id, true);
        if (kind === CONTROL_KINDS.ACTION) {
          setAnnouncement(`${controlTitle}: ${text.completed}`);
          setCompletedActionIds((current) => new Set(current).add(id));
          window.setTimeout(() => {
            setCompletedActionIds((current) => {
              const next = new Set(current);
              next.delete(id);
              return next;
            });
          }, COMPLETION_FEEDBACK_MS);
        } else {
          setAnnouncement(`${controlTitle}: ${text.openingSettings}`);
        }
      } catch (error) {
        const message = localiseNativeError(error, language, text);
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

    setConfirmingActionId(null);
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
    if (!deadline) {
      setTimers((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setTimerPanelControlId(null);
      return;
    }

    setTimerSelectionPending(true);
    const control = nativeControls?.[id];
    const currentlyEnabled = control?.stateKnown !== false && typeof control?.state === 'boolean'
      ? control.state
      : Boolean(switches[id]);
    const enabled = currentlyEnabled || await activateControl(id, false);
    if (enabled) {
      setTimers((current) => ({ ...current, [id]: deadline }));
      setTimerPanelControlId(null);
      setAnnouncement(`${text[id]?.[0] || id}: ${formatTimerRemaining(deadline, language)}`);
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
    setTimerPanelControlId(null);
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
    if (kind === CONTROL_KINDS.CHOICE || requiresConfirmation(id)) {
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

  const recoverPermission = async (id, pane) => {
    const controlTitle = text[id]?.[0] || id;
    try {
      await openNativeSystemSettings(pane);
      setAnnouncement(`${controlTitle}: ${text.openingSettings}`);
    } catch (error) {
      const message = localiseNativeError(error, language, text);
      setAnnouncement(`${controlTitle}: ${message}`);
    }
  };

  const openPreferences = async () => {
    if (nativeView === 'popover' && await openNativePreferences()) return;
    setIsOpen(false);
    setPreferencesOpen(true);
  };

  const quit = async () => {
    if (nativeView === 'popover' && await quitNativeApp()) return;
    setIsOpen(false);
  };

  const preferences = (
    <Preferences
      language={language}
      setLanguage={setLanguage}
      menuIcon={menuIcon}
      setMenuIcon={setMenuIcon}
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
      appVersion={appVersion}
      onClose={nativeView === 'preferences' ? hideNativeWindow : () => setPreferencesOpen(false)}
    />
  );

  const popover = (
    <section className="status-popover" aria-label={text.title}>
      <header className="popover-head" aria-hidden={resolutionPanelOpen || Boolean(timerPanelControlId) || diskPanelOpen}><div className="app-identity"><span className="app-mark"><ToggleRight size={19} /></span><span><strong>{text.title}</strong><small>{text.subtitle}</small></span></div></header>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div className="switch-list" aria-hidden={resolutionPanelOpen || Boolean(timerPanelControlId) || diskPanelOpen} inert={resolutionPanelOpen || timerPanelControlId || diskPanelOpen ? '' : undefined}>{menuItems.map((item) => {
        const Icon = item.icon;
        const [defaultTitle, defaultDescription] = text[item.id];
        const control = nativeControls?.[item.id];
        const pending = pendingActionIds.has(item.id);
        const unavailable = Boolean(nativeApp && control && !control.available);
        const stateKnown = !nativeApp || (nativeSnapshotReady && Boolean(control) && control.stateKnown !== false);
        const kind = control?.mode || item.kind;
        const confirming = confirmingActionId === item.id;
        const completed = completedActionIds.has(item.id);
        const checked = kind === CONTROL_KINDS.TOGGLE && stateKnown && switches[item.id];
        const feedback = rowMessages[item.id];
        const error = typeof feedback === 'string' ? feedback : feedback?.text;
        const recoveryPane = feedback?.recoveryPane || recoveryPaneForError(control?.message);
        const recoverable = Boolean(recoveryPane);
        const hasError = Boolean(error || (unavailable && control?.message));
        const title = item.id === 'airpods' && audioDeviceState?.paired ? audioDeviceState.name : defaultTitle;
        const unavailableMessage = item.id === 'airpods' ? text.airpodsUnpaired : localiseNativeError(control?.message, language, text);
        const description = item.id === 'airpods'
          ? audioDeviceDescription(audioDeviceState, language, text)
          : item.id === 'resolution' && currentResolutionSummary
            ? currentResolutionSummary
            : defaultDescription;
        const timerStatus = timers[item.id] && checked
          ? formatTimerRemaining(timers[item.id], language)
          : '';
        const status = unavailable
          ? unavailableMessage
          : pending
            ? text.processing
            : confirming
              ? text.confirmHint
              : completed
                ? text.completed
                : error || timerStatus || (!stateKnown && kind === CONTROL_KINDS.TOGGLE ? text.unknownState : description);
        const controlLabel = `${title}: ${status}`;
        const affordance = recoverable
          ? <RowAction pending={false} confirming={false} completed={false} disabled={false} onClick={() => recoverPermission(item.id, recoveryPane)} label={`${title}: ${text.openSettings}`} />
          : kind === CONTROL_KINDS.TOGGLE
            ? <Toggle checked={checked} loading={pending} disabled={unavailable} stateKnown={stateKnown} onChange={() => activateControl(item.id)} onLongPress={TIMED_CONTROL_IDS.includes(item.id) ? () => { setResolutionPanelOpen(false); setDiskPanelOpen(false); setTimerPanelControlId(item.id); } : undefined} label={controlLabel} />
            : <RowAction pending={pending} confirming={confirming} completed={completed} disabled={unavailable} onClick={() => activateControl(item.id)} onLongPress={item.id === 'ejectDisk' ? openDiskPanel : undefined} label={controlLabel} />;
        return <div className={`switch-row kind-${kind} ${checked ? 'is-active' : ''} ${pending ? 'is-pending' : ''} ${confirming ? 'is-confirming' : ''} ${completed ? 'is-complete' : ''} ${unavailable ? 'is-unavailable' : ''} ${recoverable ? 'is-recoverable' : ''} ${!stateKnown ? 'is-unknown' : ''} ${hasError ? 'has-error' : ''}`} key={item.id}><span className="switch-icon"><Icon size={20} strokeWidth={1.65} /></span><span className="switch-copy"><strong>{title}</strong><small>{status}</small></span>{affordance}</div>;
      })}</div>
      <footer className="popover-foot" aria-hidden={resolutionPanelOpen || Boolean(timerPanelControlId) || diskPanelOpen} inert={resolutionPanelOpen || timerPanelControlId || diskPanelOpen ? '' : undefined}><button type="button" className="foot-icon" aria-label={text.settings} onClick={openPreferences}><SlidersHorizontal size={20} /></button><button type="button" className="customise" onClick={openPreferences}>{text.customise}</button><button type="button" className="foot-icon power" aria-label={text.quit} onClick={quit}><Power size={21} /></button></footer>
      {resolutionPanelOpen && (
        <ResolutionPanel
          copy={text}
          configuration={displayConfiguration}
          selectedDisplayId={selectedDisplayId}
          loading={resolutionLoading}
          error={resolutionError}
          pendingModeKey={pendingResolutionMode}
          onClose={() => {
            if (!pendingResolutionMode) setResolutionPanelOpen(false);
          }}
          onRetry={loadDisplayConfiguration}
          onSelectDisplay={setSelectedDisplayId}
          onSelectMode={selectResolutionMode}
        />
      )}
      {timerPanelControlId && (
        <TimerPanel
          controlId={timerPanelControlId}
          title={text[timerPanelControlId]?.[0] || timerPanelControlId}
          deadline={timers[timerPanelControlId] || null}
          language={language}
          copy={text}
          pending={timerSelectionPending}
          onClose={() => {
            if (!timerSelectionPending) setTimerPanelControlId(null);
          }}
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
          onClose={() => {
            if (!savingDiskName) setDiskPanelOpen(false);
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
          <div className="menu-right"><span>⌁</span><span>◒</span><span>◖</span><span>100%</span><button type="button" className="tray-trigger" aria-label={isOpen ? text.close : text.open} onClick={() => setIsOpen((value) => !value)}><TrayIcon size={16} /></button></div>
        </header>
        <button type="button" className="ambient-dismiss" aria-label={text.outsideClose} onClick={() => setIsOpen(false)} />

        {isOpen && popover}

        {preferencesOpen && <><button type="button" className="preferences-scrim" aria-label="Close preferences window" onClick={() => setPreferencesOpen(false)} />{preferences}</>}
        <div className="stage-caption"><Languages size={14} /> {language === 'zh' ? '状态栏应用原型 · 点击右上角图标展开' : 'STATUS BAR APP PREVIEW · CLICK THE TOP-RIGHT ICON'}</div>
      </div>
    </main>
  );
}
