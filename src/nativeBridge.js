function isTauri() {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function invoke(command, args = {}) {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke(command, args);
}

export function isNativeApp() {
  return isTauri();
}

export async function setNativeSwitch(id, enabled) {
  if (!isTauri()) return { mode: 'preview' };
  return invoke('set_switch', { id, enabled });
}

export async function getNativeSnapshot() {
  if (!isTauri()) return null;
  return invoke('get_native_snapshot');
}

const PREVIEW_DISPLAY_CONFIGURATION = {
  displays: [{
    id: 1,
    name: 'Built-in Retina Display',
    main: true,
    builtIn: true,
    currentModeId: 2,
    currentWidth: 1728,
    currentHeight: 1117,
    modes: [
      { id: 1, width: 1440, height: 932, pixelWidth: 2880, pixelHeight: 1864, refreshRate: 120, hiDpi: true, current: false },
      { id: 2, width: 1728, height: 1117, pixelWidth: 3456, pixelHeight: 2234, refreshRate: 120, hiDpi: true, current: true },
      { id: 3, width: 2056, height: 1329, pixelWidth: 4112, pixelHeight: 2658, refreshRate: 120, hiDpi: true, current: false },
    ],
  }],
};

export async function getNativeDisplayConfiguration() {
  if (!isTauri()) return structuredClone(PREVIEW_DISPLAY_CONFIGURATION);
  return invoke('get_display_configuration');
}

export async function setNativeDisplayMode(displayId, modeId) {
  if (!isTauri()) {
    const configuration = structuredClone(PREVIEW_DISPLAY_CONFIGURATION);
    const display = configuration.displays.find((item) => item.id === displayId);
    if (display) {
      display.modes.forEach((mode) => { mode.current = mode.id === modeId; });
      const selected = display.modes.find((mode) => mode.id === modeId);
      if (selected) {
        display.currentModeId = selected.id;
        display.currentWidth = selected.width;
        display.currentHeight = selected.height;
      }
    }
    return configuration;
  }
  return invoke('set_display_mode', { displayId, modeId });
}

export async function getNativeExternalDisks() {
  if (!isTauri()) {
    return [
      { id: '/dev/disk4', name: 'Project SSD', excluded: false },
      { id: '/dev/disk7', name: 'Time Machine', excluded: true },
    ];
  }
  return invoke('get_external_disks');
}

export async function setNativeEjectExclusions(exclusions) {
  if (!isTauri()) return true;
  await invoke('set_eject_exclusions', { exclusions });
  return true;
}

let previewAutostartEnabled = false;
let shortcutSyncQueue = Promise.resolve();

export async function getNativeAutostartEnabled() {
  if (!isTauri()) return previewAutostartEnabled;
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return isEnabled();
}

export async function setNativeAutostartEnabled(enabled) {
  if (!isTauri()) {
    previewAutostartEnabled = Boolean(enabled);
    return previewAutostartEnabled;
  }
  const { disable, enable, isEnabled } = await import('@tauri-apps/plugin-autostart');
  if (enabled) await enable();
  else await disable();
  return isEnabled();
}

export async function validateNativeGlobalShortcut(shortcut) {
  if (!isTauri()) return true;
  const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut');
  await register(shortcut, () => {});
  await unregister(shortcut);
  return true;
}

export function syncNativeGlobalShortcuts(shortcuts, onTrigger) {
  if (!isTauri()) return Promise.resolve({ failed: [] });
  shortcutSyncQueue = shortcutSyncQueue.catch(() => undefined).then(async () => {
    const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
    await unregisterAll();
    const failed = [];
    for (const [id, shortcut] of Object.entries(shortcuts || {})) {
      if (!shortcut) continue;
      try {
        await register(shortcut, (event) => {
          if (event.state === 'Pressed') onTrigger(id);
        });
      } catch (error) {
        failed.push({ id, shortcut, error: String(error) });
      }
    }
    return { failed };
  });
  return shortcutSyncQueue;
}

export function clearNativeGlobalShortcuts() {
  if (!isTauri()) return Promise.resolve();
  shortcutSyncQueue = shortcutSyncQueue.catch(() => undefined).then(async () => {
    const { unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
    await unregisterAll();
  });
  return shortcutSyncQueue;
}

export async function getNativeAppVersion() {
  if (!isTauri()) return '0.1.0';
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export async function checkNativeAppUpdate() {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  return check();
}

export async function relaunchNativeApp() {
  if (!isTauri()) return false;
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
  return true;
}

export async function openNativePreferences() {
  if (!isTauri()) return false;
  await invoke('open_preferences');
  return true;
}

export async function openNativeSystemSettings(pane) {
  if (!isTauri()) return false;
  await invoke('open_system_settings', { pane });
  return true;
}

export async function hideNativeWindow() {
  if (!isTauri()) return false;
  await invoke('hide_current_window');
  return true;
}

export async function resizeNativePopover(itemCount) {
  if (!isTauri()) return false;
  await invoke('resize_popover', { itemCount });
  return true;
}

export async function showNativePopover() {
  if (!isTauri()) return false;
  await invoke('show_popover');
  return true;
}

export async function showLegacyPopover() {
  if (!isTauri()) return false;
  await invoke('show_legacy_popover');
  return true;
}

export async function updateNativePopover(model) {
  if (!isTauri()) return false;
  await invoke('update_native_popover', { model });
  return true;
}

export async function updateNativePreferences(model) {
  if (!isTauri()) return false;
  await invoke('update_native_preferences', { model });
  return true;
}

export async function listenForNativePopoverActions(handler) {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen('native-popover-action', (event) => handler(event.payload));
}

export async function listenForNativePreferencesActions(handler) {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen('native-preferences-action', (event) => handler(event.payload));
}

export async function showNativeTimerMenu(anchor, language) {
  if (!isTauri()) return null;
  return invoke('show_timer_menu', {
    anchorRight: anchor.right,
    anchorBottom: anchor.bottom,
    language,
  });
}

export async function sendNativeCustomizationToPopover(customization) {
  if (!isTauri()) return false;
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('popover', 'switchboard-customization-changed', customization);
  return true;
}

export async function listenForNativeCustomization(handler) {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen('switchboard-customization-changed', (event) => handler(event.payload));
}

export async function quitNativeApp() {
  if (!isTauri()) return false;
  await invoke('quit_app');
  return true;
}
