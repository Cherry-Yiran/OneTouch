use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env,
    ffi::{CStr, CString},
    fs,
    io::Read,
    os::raw::{c_char, c_int, c_void},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(not(target_os = "macos"))]
use tauri::{
    image::Image,
    tray::TrayIconBuilder,
    window::{Effect, EffectState, EffectsBuilder},
    TitleBarStyle,
};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Rect, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const ALL_CONTROL_IDS: [&str; 29] = [
    "desktop",
    "darkMode",
    "awake",
    "airpods",
    "dnd",
    "nightShift",
    "screenSaver",
    "trueTone",
    "frontApp",
    "muteMic",
    "xcodeClean",
    "emptyTrash",
    "ejectDisk",
    "clipboard",
    "hideWindow",
    "hideDock",
    "lowPower",
    "highPower",
    "music",
    "spotify",
    "hiddenFiles",
    "displaySleep",
    "resolution",
    "hideWidgets",
    "stageManager",
    "cleanScreen",
    "lockKeyboard",
    "lockScreen",
    "quitApps",
];
// Keep native preferences in their legacy domain. WebView-backed settings are
// migrated separately before the first window is created under the clean ID.
const PREFERENCES_DOMAIN: &str = "design.ryan.switchboard.menubar.v2";
const PREVIOUS_INPUT_VOLUME_KEY: &str = "previousInputVolume";
const EJECT_EXCLUSIONS_KEY: &str = "ejectExclusions";

#[cfg(target_os = "macos")]
const LEGACY_WEBKIT_BUNDLE_ID: &str = "design.ryan.onetouch";
#[cfg(target_os = "macos")]
const CURRENT_WEBKIT_BUNDLE_ID: &str = "design.ryan.onetouch.menubar";

#[cfg(target_os = "macos")]
fn copy_directory_tree(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let destination_path = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory_tree(&entry.path(), &destination_path)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), destination_path)?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn migrate_legacy_webkit_data_in(library_directory: &Path) -> std::io::Result<bool> {
    let marker = library_directory
        .join("Application Support")
        .join("OneTouch")
        .join("Migrations")
        .join("webkit-bundle-identity-v1.complete");
    if marker.exists() {
        return Ok(false);
    }

    let webkit_directory = library_directory.join("WebKit");
    let source = webkit_directory.join(LEGACY_WEBKIT_BUNDLE_ID);
    let destination = webkit_directory.join(CURRENT_WEBKIT_BUNDLE_ID);
    let mut migrated = false;

    if source.is_dir() && !destination.exists() {
        let temporary_destination = webkit_directory.join(format!(
            ".{CURRENT_WEBKIT_BUNDLE_ID}.migration-{}",
            std::process::id()
        ));
        if temporary_destination.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "a previous OneTouch WebKit migration is still present",
            ));
        }

        if let Err(error) = copy_directory_tree(&source, &temporary_destination)
            .and_then(|_| fs::rename(&temporary_destination, &destination))
        {
            let _ = fs::remove_dir_all(&temporary_destination);
            return Err(error);
        }
        migrated = true;
    }

    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        marker,
        format!("{LEGACY_WEBKIT_BUNDLE_ID} -> {CURRENT_WEBKIT_BUNDLE_ID}\n"),
    )?;
    Ok(migrated)
}

#[cfg(target_os = "macos")]
fn migrate_legacy_webkit_data() -> std::io::Result<bool> {
    let home = env::var_os("HOME").ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "macOS home directory is unavailable",
        )
    })?;
    migrate_legacy_webkit_data_in(&Path::new(&home).join("Library"))
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn sb_status_item_create(
        callback: Option<extern "C" fn(x: f64, y: f64, width: f64, height: f64)>,
    ) -> c_int;
    fn sb_status_item_ensure_available() -> c_int;
    fn sb_accessibility_is_trusted() -> c_int;
    fn sb_accessibility_guide_create() -> c_int;
    fn sb_accessibility_guide_update_json(model_json: *const c_char) -> c_int;
    fn sb_accessibility_guide_show() -> c_int;
    fn sb_accessibility_guide_hide();
    fn sb_native_popover_create(
        callback: Option<
            extern "C" fn(action: *const c_char, control_id: *const c_char, value: c_int),
        >,
    ) -> c_int;
    fn sb_native_popover_update_json(model_json: *const c_char) -> c_int;
    fn sb_native_popover_show() -> c_int;
    fn sb_native_popover_show_persistent() -> c_int;
    fn sb_native_popover_toggle() -> c_int;
    fn sb_native_popover_hide();
    fn sb_native_popover_hide_for_app_window();
    fn sb_native_restore_previous_application();
    fn sb_native_preferences_create(
        callback: Option<
            extern "C" fn(action: *const c_char, control_id: *const c_char, payload: *const c_char),
        >,
    ) -> c_int;
    fn sb_native_preferences_update_json(model_json: *const c_char) -> c_int;
    fn sb_native_preferences_show(pane: *const c_char) -> c_int;
    fn sb_timer_menu_show(
        window_pointer: *mut c_void,
        anchor_right: f64,
        anchor_bottom: f64,
        use_chinese: c_int,
    ) -> c_int;
    fn sb_display_configuration_json() -> *mut c_char;
    fn sb_display_set_mode(display_id: u32, mode_id: i32, error_output: *mut *mut c_char) -> c_int;
    fn sb_audio_device_snapshot_json() -> *mut c_char;
    fn sb_audio_device_set_connected(enabled: c_int, error_output: *mut *mut c_char) -> c_int;
    fn sb_free_string(value: *mut c_char);
    fn sb_clean_screen_start(error_output: *mut *mut c_char) -> c_int;
    fn sb_clean_screen_stop();
    fn sb_clean_screen_active() -> c_int;
    fn sb_keyboard_lock_start(error_output: *mut *mut c_char) -> c_int;
    fn sb_keyboard_lock_stop();
    fn sb_keyboard_lock_active() -> c_int;
    fn sb_quit_nonessential_apps(
        requested_count: *mut c_int,
        error_output: *mut *mut c_char,
    ) -> c_int;
    fn sb_night_shift_get(
        status: *mut NativeFeatureStatus,
        error_output: *mut *mut c_char,
    ) -> c_int;
    fn sb_night_shift_set(
        enabled: c_int,
        status: *mut NativeFeatureStatus,
        error_output: *mut *mut c_char,
    ) -> c_int;
    fn sb_true_tone_get(status: *mut NativeFeatureStatus, error_output: *mut *mut c_char) -> c_int;
    fn sb_true_tone_set(
        enabled: c_int,
        status: *mut NativeFeatureStatus,
        error_output: *mut *mut c_char,
    ) -> c_int;
    fn sb_low_power_get(status: *mut NativeFeatureStatus, error_output: *mut *mut c_char) -> c_int;
    fn sb_low_power_set(
        enabled: c_int,
        status: *mut NativeFeatureStatus,
        error_output: *mut *mut c_char,
    ) -> c_int;
    fn sb_high_power_get(status: *mut NativeFeatureStatus, error_output: *mut *mut c_char)
        -> c_int;
    fn sb_high_power_set(
        enabled: c_int,
        status: *mut NativeFeatureStatus,
        error_output: *mut *mut c_char,
    ) -> c_int;
    fn sb_focus_get(status: *mut NativeFeatureStatus, error_output: *mut *mut c_char) -> c_int;
    fn sb_focus_set(
        enabled: c_int,
        status: *mut NativeFeatureStatus,
        error_output: *mut *mut c_char,
    ) -> c_int;
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
struct NativeFeatureStatus {
    available: c_int,
    state_known: c_int,
    enabled: c_int,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioDeviceSnapshot {
    paired: bool,
    connected: bool,
    name: String,
    battery_level: Option<u8>,
    battery_left: Option<u8>,
    battery_right: Option<u8>,
    battery_case: Option<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayModeOption {
    id: i32,
    width: usize,
    height: usize,
    pixel_width: usize,
    pixel_height: usize,
    refresh_rate: f64,
    hi_dpi: bool,
    current: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayOption {
    id: u32,
    name: String,
    main: bool,
    built_in: bool,
    current_mode_id: i32,
    current_width: usize,
    current_height: usize,
    modes: Vec<DisplayModeOption>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayConfiguration {
    displays: Vec<DisplayOption>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalDisk {
    id: String,
    name: String,
    excluded: bool,
}

#[derive(Clone, Debug, Deserialize)]
struct DiskutilVolumeInfo {
    #[serde(rename = "DeviceIdentifier")]
    device_identifier: Option<String>,
    #[serde(rename = "ParentWholeDisk")]
    parent_whole_disk: Option<String>,
    #[serde(rename = "VolumeName")]
    volume_name: Option<String>,
    #[serde(rename = "MountPoint")]
    mount_point: Option<String>,
    #[serde(rename = "Ejectable", default)]
    ejectable: bool,
    #[serde(rename = "Internal", default)]
    internal: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct EjectableDiskCandidate {
    id: String,
    name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlSnapshot {
    state: bool,
    state_known: bool,
    available: bool,
    mode: &'static str,
    message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeSnapshot {
    controls: HashMap<String, ControlSnapshot>,
    audio_device: AudioDeviceSnapshot,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwitchResult {
    state: bool,
    state_known: bool,
    mode: &'static str,
    message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePopoverAction {
    action: String,
    control_id: String,
    value: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePreferencesAction {
    action: String,
    control_id: String,
    payload: String,
}

#[cfg(not(target_os = "macos"))]
const TRAY_COMMAND_ICON: Image<'static> = tauri::include_image!("./icons/tray-command-lime.png");
#[cfg(not(target_os = "macos"))]
fn configure_popover_surface(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::Popover)
            .state(EffectState::Active)
            .build(),
    )?;
    Ok(())
}

#[derive(Default)]
struct NativeState {
    caffeinate: Mutex<Option<Child>>,
    previous_input_volume: Mutex<Option<u8>>,
    music_playing: Mutex<Option<bool>>,
    spotify_playing: Mutex<Option<bool>>,
    airpods_operation: Mutex<()>,
    tray_anchor: Mutex<Option<Rect>>,
    native_menu_active: Mutex<bool>,
}

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
// The native surface is activated only after its controller supplies a full model.
static NATIVE_POPOVER_MODEL_READY: AtomicBool = AtomicBool::new(false);

fn timer_menu_choice(selection: c_int) -> Option<&'static str> {
    match selection {
        0 => Some("30m"),
        1 => Some("1h"),
        2 => Some("2h"),
        3 => Some("4h"),
        4 => Some("today"),
        5 => Some("none"),
        _ => None,
    }
}

#[tauri::command]
fn show_timer_menu(
    app: AppHandle,
    window: WebviewWindow,
    anchor_right: f64,
    anchor_bottom: f64,
    language: String,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let native_window = window
            .ns_window()
            .map_err(|error| format!("The native OneTouch window is unavailable: {error}"))?;
        if let Ok(mut active) = app.state::<NativeState>().native_menu_active.lock() {
            *active = true;
        }
        let selection = unsafe {
            sb_timer_menu_show(
                native_window,
                anchor_right,
                anchor_bottom,
                c_int::from(language == "zh"),
            )
        };
        if let Ok(mut active) = app.state::<NativeState>().native_menu_active.lock() {
            *active = false;
        }
        let _ = window.set_focus();
        if selection == -2 {
            return Err("macOS could not present the native timer menu".to_string());
        }
        return Ok(timer_menu_choice(selection).map(str::to_string));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, window, anchor_right, anchor_bottom, language);
        Ok(None)
    }
}

fn run_process(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Unable to run {program}: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if message.is_empty() {
            format!("{program} exited with {}", output.status)
        } else {
            message
        })
    }
}

fn run_process_with_timeout(program: &str, args: &[&str], timeout: Duration) -> Result<(), String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to run {program}: {error}"))?;
    let started = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut message = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    let _ = stderr.read_to_string(&mut message);
                }

                return if status.success() {
                    Ok(())
                } else {
                    let message = message.trim();
                    Err(if message.is_empty() {
                        format!("{program} exited with {status}")
                    } else {
                        message.to_string()
                    })
                };
            }
            Ok(None) if started.elapsed() < timeout => {
                thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "macOS did not respond within {:.0} seconds. A permission request may be waiting.",
                    timeout.as_secs_f32()
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Unable to wait for {program}: {error}"));
            }
        }
    }
}

fn run_osascript(script: &str) -> Result<(), String> {
    run_process_with_timeout(
        "/usr/bin/osascript",
        &["-e", script],
        Duration::from_secs(8),
    )
}

fn run_control_center_toggle(id: &str, enabled: bool) -> Result<(), String> {
    let desired = if enabled { 1 } else { 0 };
    let (menu_identifier, target_identifier, focus_mode) = match id {
        "lowPower" => ("com.apple.menuextra.battery", "energy-mode-low", false),
        "highPower" => ("com.apple.menuextra.battery", "energy-mode-high", false),
        "dnd" => (
            "com.apple.menuextra.focusmode",
            "focus-mode-activity-com.apple.donotdisturb.mode.default",
            true,
        ),
        _ => return Err(format!("{id} has no Control Center switch")),
    };
    let target_match = if focus_mode && !enabled {
        "identifierValue starts with \"focus-mode-activity-\" and (value of candidate as integer) is 1".to_string()
    } else {
        format!("identifierValue is \"{target_identifier}\"")
    };
    let already_active = if focus_mode && enabled {
        r#"
          repeat with candidate in (entire contents of window 1)
            try
              set identifierValue to value of attribute "AXIdentifier" of candidate as text
              if identifierValue starts with "focus-mode-activity-" and (value of candidate as integer) is 1 then set activeFocusFound to true
            end try
          end repeat
        "#
    } else {
        ""
    };
    let target_discovery = if focus_mode {
        format!(
            r#"
      repeat with candidate in (entire contents of window 1)
        try
          set identifierValue to value of attribute "AXIdentifier" of candidate as text
          if {target_match} then set targetControl to candidate
        end try
      end repeat
            "#
        )
    } else {
        format!(
            r#"
      set targetControl to checkbox 1 of scroll area 1 of group 1 of window 1
      set identifierValue to value of attribute "AXIdentifier" of targetControl as text
      if identifierValue is not "{target_identifier}" then error "Unexpected Control Center switch"
            "#
        )
    };
    let skip_press = if focus_mode && enabled {
        "if activeFocusFound is false then perform action \"AXPress\" of targetControl".to_string()
    } else {
        format!(
            "if (value of targetControl as integer) is not {desired} then perform action \"AXPress\" of targetControl"
        )
    };
    let script = format!(
        r#"
tell application "System Events"
  tell process "ControlCenter"
    set statusItem to missing value
    set panelOpened to false
    repeat with candidate in menu bar items of menu bar 1
      try
        if (value of attribute "AXIdentifier" of candidate as text) is "{menu_identifier}" then set statusItem to candidate
      end try
    end repeat
    if statusItem is missing value then error "Control Center menu item is unavailable"
    try
      perform action "AXPress" of statusItem
      set panelOpened to true
      delay 0.2
      set targetControl to missing value
      set activeFocusFound to false
      {already_active}
      {target_discovery}
      if targetControl is missing value and activeFocusFound is false then error "Control Center switch is unavailable"
      if targetControl is not missing value then {skip_press}
      delay 0.25
      perform action "AXPress" of statusItem
      set panelOpened to false
    on error errorMessage number errorNumber
      if panelOpened then
        try
          perform action "AXPress" of statusItem
        end try
      end if
      error errorMessage number errorNumber
    end try
  end tell
end tell
        "#
    );
    run_process_with_timeout(
        "/usr/bin/osascript",
        &["-e", &script],
        Duration::from_secs(6),
    )
}

fn read_process(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_process_with_timeout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut output = Vec::new();
        stdout.read_to_end(&mut output).ok().map(|_| output)
    });
    let started = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = reader.join().ok().flatten()?;
                return status
                    .success()
                    .then(|| String::from_utf8_lossy(&output).trim().to_string());
            }
            Ok(None) if started.elapsed() < timeout => {
                thread::sleep(Duration::from_millis(50));
            }
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return None;
            }
        }
    }
}

fn control_mode(id: &str) -> &'static str {
    match id {
        "screenSaver" | "frontApp" | "xcodeClean" | "emptyTrash" | "ejectDisk" | "clipboard"
        | "hideWindow" | "displaySleep" | "lockScreen" | "quitApps" => "action",
        "resolution" => "choice",
        _ => "toggle",
    }
}

fn is_direct_system_toggle(id: &str) -> bool {
    matches!(
        id,
        "dnd" | "nightShift" | "trueTone" | "lowPower" | "highPower"
    )
}

fn high_power_supported() -> bool {
    read_process("/usr/bin/pmset", &["-g", "custom"]).is_some_and(|output| {
        output
            .lines()
            .any(|line| line.split_whitespace().next() == Some("highpowermode"))
    })
}

fn parse_percentage(value: Option<&Value>) -> Option<u8> {
    value?.as_str()?.trim_end_matches('%').parse::<u8>().ok()
}

fn normalized_device_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}

fn find_audio_device_battery(
    value: &Value,
    preferred_name: &str,
) -> Option<(String, Option<u8>, Option<u8>, Option<u8>, Option<u8>)> {
    match value {
        Value::Object(object) => {
            let preferred = normalized_device_name(preferred_name);
            for (name, details) in object {
                let normalized = normalized_device_name(name);
                if !preferred.is_empty()
                    && (normalized == preferred
                        || normalized.contains(&preferred)
                        || preferred.contains(&normalized))
                {
                    let details = details.as_object()?;
                    return Some((
                        name.clone(),
                        parse_percentage(details.get("device_batteryLevel")),
                        parse_percentage(details.get("device_batteryLevelLeft")),
                        parse_percentage(details.get("device_batteryLevelRight")),
                        parse_percentage(details.get("device_batteryLevelCase")),
                    ));
                }
            }
            object
                .values()
                .find_map(|child| find_audio_device_battery(child, preferred_name))
        }
        Value::Array(items) => items
            .iter()
            .find_map(|child| find_audio_device_battery(child, preferred_name)),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn take_native_string(pointer: *mut c_char) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    let value = unsafe { CStr::from_ptr(pointer) }
        .to_string_lossy()
        .into_owned();
    unsafe { sb_free_string(pointer) };
    Some(value)
}

#[cfg(target_os = "macos")]
fn native_audio_device_base_snapshot() -> AudioDeviceSnapshot {
    let raw = unsafe { sb_audio_device_snapshot_json() };
    take_native_string(raw)
        .and_then(|json| serde_json::from_str::<AudioDeviceSnapshot>(&json).ok())
        .unwrap_or_else(|| AudioDeviceSnapshot {
            name: "Bluetooth headphones".into(),
            ..AudioDeviceSnapshot::default()
        })
}

#[cfg(target_os = "macos")]
fn native_audio_device_snapshot() -> AudioDeviceSnapshot {
    let mut snapshot = native_audio_device_base_snapshot();

    if !snapshot.connected {
        return snapshot;
    }

    if let Some(output) = read_process_with_timeout(
        "/usr/sbin/system_profiler",
        &["SPBluetoothDataType", "-json", "-detailLevel", "mini"],
        Duration::from_secs(3),
    ) {
        if let Ok(profile) = serde_json::from_str::<Value>(&output) {
            if let Some((name, level, left, right, case)) =
                find_audio_device_battery(&profile, &snapshot.name)
            {
                snapshot.name = name;
                snapshot.battery_level = level;
                snapshot.battery_left = left;
                snapshot.battery_right = right;
                snapshot.battery_case = case;
            }
        }
    }
    snapshot
}

#[cfg(not(target_os = "macos"))]
fn native_audio_device_base_snapshot() -> AudioDeviceSnapshot {
    AudioDeviceSnapshot {
        name: "Bluetooth headphones".into(),
        ..AudioDeviceSnapshot::default()
    }
}

#[cfg(not(target_os = "macos"))]
fn native_audio_device_snapshot() -> AudioDeviceSnapshot {
    native_audio_device_base_snapshot()
}

#[cfg(target_os = "macos")]
fn native_helper_result(operation: impl FnOnce(*mut *mut c_char) -> c_int) -> Result<(), String> {
    let mut error_pointer: *mut c_char = std::ptr::null_mut();
    let status = operation(&mut error_pointer);
    if status == 0 {
        if !error_pointer.is_null() {
            unsafe { sb_free_string(error_pointer) };
        }
        Ok(())
    } else {
        Err(take_native_string(error_pointer)
            .unwrap_or_else(|| format!("macOS returned error {status}")))
    }
}

#[cfg(target_os = "macos")]
fn quit_nonessential_apps() -> Result<usize, String> {
    let mut requested_count = 0;
    native_helper_result(|error| unsafe {
        sb_quit_nonessential_apps(&mut requested_count, error)
    })?;
    Ok(requested_count.max(0) as usize)
}

#[cfg(not(target_os = "macos"))]
fn quit_nonessential_apps() -> Result<usize, String> {
    Err("Quitting other applications is only available on macOS".to_string())
}

#[cfg(target_os = "macos")]
fn native_display_configuration() -> Result<DisplayConfiguration, String> {
    let raw = unsafe { sb_display_configuration_json() };
    let json = take_native_string(raw)
        .ok_or_else(|| "macOS could not read the connected displays".to_string())?;
    let configuration = serde_json::from_str::<DisplayConfiguration>(&json)
        .map_err(|error| format!("macOS returned invalid display information: {error}"))?;
    if configuration.displays.is_empty() {
        return Err("No active displays were found".to_string());
    }
    Ok(configuration)
}

#[cfg(not(target_os = "macos"))]
fn native_display_configuration() -> Result<DisplayConfiguration, String> {
    Err("Display resolution control is only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn set_native_display_mode(display_id: u32, mode_id: i32) -> Result<(), String> {
    native_helper_result(|error| unsafe { sb_display_set_mode(display_id, mode_id, error) })
}

#[cfg(not(target_os = "macos"))]
fn set_native_display_mode(_display_id: u32, _mode_id: i32) -> Result<(), String> {
    Err("Display resolution control is only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn native_feature_result(
    operation: impl FnOnce(*mut NativeFeatureStatus, *mut *mut c_char) -> c_int,
) -> Result<(NativeFeatureStatus, Option<String>), String> {
    let mut feature = NativeFeatureStatus::default();
    let mut error_pointer: *mut c_char = std::ptr::null_mut();
    let status = operation(&mut feature, &mut error_pointer);
    let message = take_native_string(error_pointer);
    if status == 0 {
        Ok((feature, message))
    } else {
        Err(message.unwrap_or_else(|| format!("macOS returned error {status}")))
    }
}

#[cfg(target_os = "macos")]
fn get_direct_system_toggle(id: &str) -> Result<(NativeFeatureStatus, Option<String>), String> {
    match id {
        "dnd" => native_feature_result(|status, error| unsafe { sb_focus_get(status, error) }),
        "nightShift" => {
            native_feature_result(|status, error| unsafe { sb_night_shift_get(status, error) })
        }
        "trueTone" => {
            native_feature_result(|status, error| unsafe { sb_true_tone_get(status, error) })
        }
        "lowPower" => {
            native_feature_result(|status, error| unsafe { sb_low_power_get(status, error) })
        }
        "highPower" if high_power_supported() => {
            native_feature_result(|status, error| unsafe { sb_high_power_get(status, error) })
        }
        "highPower" => Ok((
            NativeFeatureStatus {
                available: 0,
                state_known: 1,
                enabled: 0,
            },
            Some("High Power Mode is unsupported on this Mac".into()),
        )),
        _ => Err(format!("{id} is not a direct system toggle")),
    }
}

#[cfg(not(target_os = "macos"))]
fn get_direct_system_toggle(id: &str) -> Result<(NativeFeatureStatus, Option<String>), String> {
    Err(format!("{id} is only available on macOS"))
}

#[cfg(target_os = "macos")]
fn set_direct_system_toggle(id: &str, enabled: bool) -> Result<NativeFeatureStatus, String> {
    let native_result = match id {
        "dnd" => native_feature_result(|status, error| unsafe {
            sb_focus_set(enabled as c_int, status, error)
        }),
        "nightShift" => native_feature_result(|status, error| unsafe {
            sb_night_shift_set(enabled as c_int, status, error)
        }),
        "trueTone" => native_feature_result(|status, error| unsafe {
            sb_true_tone_set(enabled as c_int, status, error)
        }),
        "lowPower" => native_feature_result(|status, error| unsafe {
            sb_low_power_set(enabled as c_int, status, error)
        }),
        "highPower" if high_power_supported() => native_feature_result(|status, error| unsafe {
            sb_high_power_set(enabled as c_int, status, error)
        }),
        "highPower" => Err("High Power Mode is unsupported on this Mac".into()),
        _ => Err(format!("{id} is not a direct system toggle")),
    };
    match native_result {
        Ok((feature, _)) => Ok(feature),
        Err(error)
            if id == "lowPower"
                || id == "highPower"
                || (id == "dnd" && !error.to_ascii_lowercase().contains("permission")) =>
        {
            run_control_center_toggle(id, enabled)?;
            thread::sleep(Duration::from_millis(250));
            let (feature, _) = get_direct_system_toggle(id)?;
            if feature.state_known != 0 && feature.enabled == enabled as c_int {
                Ok(feature)
            } else {
                Err(format!("{id} did not reach the requested state"))
            }
        }
        Err(error) => Err(error),
    }
}

#[cfg(not(target_os = "macos"))]
fn set_direct_system_toggle(id: &str, _enabled: bool) -> Result<NativeFeatureStatus, String> {
    Err(format!("{id} is only available on macOS"))
}

#[cfg(target_os = "macos")]
fn set_audio_device_connected(enabled: bool) -> Result<(), String> {
    native_helper_result(|error| unsafe { sb_audio_device_set_connected(enabled as c_int, error) })
}

#[cfg(not(target_os = "macos"))]
fn set_audio_device_connected(_enabled: bool) -> Result<(), String> {
    Err("Bluetooth audio control is only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn set_clean_screen(enabled: bool) -> Result<(), String> {
    if enabled {
        native_helper_result(|error| unsafe { sb_clean_screen_start(error) })
    } else {
        unsafe { sb_clean_screen_stop() };
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
fn set_clean_screen(_enabled: bool) -> Result<(), String> {
    Err("Screen cleaning mode is only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn clean_screen_active() -> bool {
    unsafe { sb_clean_screen_active() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn clean_screen_active() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn set_keyboard_locked(enabled: bool) -> Result<(), String> {
    if enabled {
        native_helper_result(|error| unsafe { sb_keyboard_lock_start(error) })
    } else {
        unsafe { sb_keyboard_lock_stop() };
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
fn set_keyboard_locked(_enabled: bool) -> Result<(), String> {
    Err("Keyboard locking is only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn keyboard_lock_active() -> bool {
    unsafe { sb_keyboard_lock_active() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn keyboard_lock_active() -> bool {
    false
}

fn set_awake(enabled: bool, state: &NativeState) -> Result<(), String> {
    let mut caffeinate = state
        .caffeinate
        .lock()
        .map_err(|_| "Unable to access the keep-awake process".to_string())?;

    if enabled {
        if caffeinate.is_none() {
            let child = Command::new("/usr/bin/caffeinate")
                .args(["-dimsu"])
                .spawn()
                .map_err(|error| format!("Unable to start caffeinate: {error}"))?;
            *caffeinate = Some(child);
        }
    } else if let Some(mut child) = caffeinate.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    Ok(())
}

fn set_desktop_hidden(enabled: bool) -> Result<(), String> {
    run_process(
        "/usr/bin/defaults",
        &[
            "write",
            "com.apple.finder",
            "CreateDesktop",
            "-bool",
            if enabled { "false" } else { "true" },
        ],
    )?;
    run_process("/usr/bin/killall", &["Finder"])
}

fn set_dark_mode(enabled: bool) -> Result<(), String> {
    let script = format!(
        "tell application \"System Events\" to tell appearance preferences to set dark mode to {}",
        if enabled { "true" } else { "false" }
    );
    run_osascript(&script)
}

fn set_dock_hidden(enabled: bool) -> Result<(), String> {
    run_process(
        "/usr/bin/defaults",
        &[
            "write",
            "com.apple.dock",
            "autohide",
            "-bool",
            if enabled { "true" } else { "false" },
        ],
    )?;
    run_process("/usr/bin/killall", &["Dock"])
}

fn parse_defaults_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" => Some(true),
        "0" | "false" | "no" => Some(false),
        _ => None,
    }
}

fn read_window_manager_bool(key: &str) -> Option<bool> {
    read_process(
        "/usr/bin/defaults",
        &["read", "com.apple.WindowManager", key],
    )
    .and_then(|value| parse_defaults_bool(&value))
}

fn write_window_manager_bool(key: &str, enabled: bool) -> Result<(), String> {
    run_process(
        "/usr/bin/defaults",
        &[
            "write",
            "com.apple.WindowManager",
            key,
            "-bool",
            if enabled { "true" } else { "false" },
        ],
    )
}

fn refresh_window_manager() -> Result<(), String> {
    run_process("/usr/bin/killall", &["Dock"])
}

fn set_widgets_hidden(enabled: bool) -> Result<(), String> {
    write_window_manager_bool("StandardHideWidgets", enabled)?;
    write_window_manager_bool("StageManagerHideWidgets", enabled)?;
    refresh_window_manager()?;
    let standard = read_window_manager_bool("StandardHideWidgets");
    let staged = read_window_manager_bool("StageManagerHideWidgets");
    if standard == Some(enabled) && staged == Some(enabled) {
        Ok(())
    } else {
        Err("macOS did not keep the requested desktop widget setting".into())
    }
}

fn set_stage_manager(enabled: bool) -> Result<(), String> {
    write_window_manager_bool("GloballyEnabled", enabled)?;
    refresh_window_manager()?;
    if read_window_manager_bool("GloballyEnabled") == Some(enabled) {
        Ok(())
    } else {
        Err("macOS did not keep the requested Stage Manager setting".into())
    }
}

fn input_volume() -> Option<u8> {
    read_process(
        "/usr/bin/osascript",
        &["-e", "input volume of (get volume settings)"],
    )?
    .parse()
    .ok()
}

fn saved_previous_input_volume() -> Option<u8> {
    read_process(
        "/usr/bin/defaults",
        &["read", PREFERENCES_DOMAIN, PREVIOUS_INPUT_VOLUME_KEY],
    )?
    .parse::<u8>()
    .ok()
    .filter(|volume| *volume > 0 && *volume <= 100)
}

fn remember_previous_input_volume(volume: u8) {
    let value = volume.to_string();
    let _ = run_process(
        "/usr/bin/defaults",
        &[
            "write",
            PREFERENCES_DOMAIN,
            PREVIOUS_INPUT_VOLUME_KEY,
            "-int",
            &value,
        ],
    );
}

fn forget_previous_input_volume() {
    let _ = run_process(
        "/usr/bin/defaults",
        &["delete", PREFERENCES_DOMAIN, PREVIOUS_INPUT_VOLUME_KEY],
    );
}

fn set_microphone_muted(enabled: bool, state: &NativeState) -> Result<(), String> {
    let mut previous = state
        .previous_input_volume
        .lock()
        .map_err(|_| "Unable to access the microphone state".to_string())?;

    let target = if enabled {
        if let Some(volume) = input_volume().filter(|volume| *volume > 0) {
            *previous = Some(volume);
            remember_previous_input_volume(volume);
        }
        0
    } else {
        previous
            .as_ref()
            .copied()
            .or_else(saved_previous_input_volume)
            .unwrap_or(50)
    };

    let script = format!("set volume input volume {target}");
    run_osascript(&script)?;
    if !enabled {
        *previous = None;
        forget_previous_input_volume();
    }
    Ok(())
}

fn set_hidden_files_visible(enabled: bool) -> Result<(), String> {
    run_process(
        "/usr/bin/defaults",
        &[
            "write",
            "com.apple.finder",
            "AppleShowAllFiles",
            "-bool",
            if enabled { "true" } else { "false" },
        ],
    )?;
    run_process("/usr/bin/killall", &["Finder"])
}

fn set_music_playing(enabled: bool, state: &NativeState) -> Result<(), String> {
    let script = if enabled {
        "tell application \"Music\" to play"
    } else {
        "tell application \"Music\" to pause"
    };
    run_osascript(script)?;
    let mut music_playing = state
        .music_playing
        .lock()
        .map_err(|_| "Unable to remember the Music playback state".to_string())?;
    *music_playing = Some(enabled);
    Ok(())
}

fn spotify_available() -> bool {
    Path::new("/Applications/Spotify.app").exists()
        || env::var_os("HOME").is_some_and(|home| {
            Path::new(&home)
                .join("Applications")
                .join("Spotify.app")
                .exists()
        })
}

fn set_spotify_playing(enabled: bool, state: &NativeState) -> Result<(), String> {
    if !spotify_available() {
        return Err("Spotify is not installed on this Mac".into());
    }
    let script = if enabled {
        "tell application \"Spotify\" to play"
    } else {
        "tell application \"Spotify\" to pause"
    };
    run_osascript(script)?;
    let mut spotify_playing = state
        .spotify_playing
        .lock()
        .map_err(|_| "Unable to remember the Spotify playback state".to_string())?;
    *spotify_playing = Some(enabled);
    Ok(())
}

fn clean_xcode_derived_data() -> Result<(), String> {
    let home =
        env::var_os("HOME").ok_or_else(|| "The home directory is unavailable".to_string())?;
    let derived_data = Path::new(&home)
        .join("Library")
        .join("Developer")
        .join("Xcode")
        .join("DerivedData");

    if !derived_data.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&derived_data).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let path = entry.path();
        if file_type.is_dir() {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

const EMPTY_TRASH_SCRIPT: &str = r#"
tell application "Finder"
  if (count of items of trash) is 0 then return
  try
    empty trash
  on error errorMessage number errorNumber
    -- Emptying is idempotent. Finder can report an error if another process
    -- emptied the Trash between the preflight check and this command.
    if (count of items of trash) is not 0 then error errorMessage number errorNumber
  end try
end tell
"#;

const EMPTY_TRASH_COUNT_SCRIPT: &str = "tell application \"Finder\" to count items of trash";

fn empty_trash() -> Result<bool, String> {
    let already_empty = read_process_with_timeout(
        "/usr/bin/osascript",
        &["-e", EMPTY_TRASH_COUNT_SCRIPT],
        Duration::from_secs(6),
    )
    .is_some_and(|count| count.trim() == "0");
    if already_empty {
        return Ok(true);
    }
    run_osascript(EMPTY_TRASH_SCRIPT)?;
    Ok(false)
}

fn empty_trash_result_message(already_empty: bool) -> Option<String> {
    already_empty.then(|| "trash-already-empty".to_string())
}

fn normalise_disk_device(identifier: &str) -> String {
    if identifier.starts_with("/dev/") {
        identifier.to_string()
    } else {
        format!("/dev/{identifier}")
    }
}

fn ejectable_disk_candidates_from_infos(
    infos: impl IntoIterator<Item = DiskutilVolumeInfo>,
) -> Vec<EjectableDiskCandidate> {
    let mut grouped = BTreeMap::<String, Vec<String>>::new();

    for info in infos {
        let Some(mount_point) = info.mount_point.filter(|value| !value.is_empty()) else {
            continue;
        };
        if info.internal || !info.ejectable || !Path::new(&mount_point).starts_with("/Volumes") {
            continue;
        }

        let Some(identifier) = info
            .parent_whole_disk
            .or(info.device_identifier)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let name = info
            .volume_name
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                Path::new(&mount_point)
                    .file_name()
                    .map(|value| value.to_string_lossy().into_owned())
            })
            .unwrap_or_else(|| identifier.clone());
        grouped
            .entry(normalise_disk_device(&identifier))
            .or_default()
            .push(name);
    }

    grouped
        .into_iter()
        .map(|(id, mut names)| {
            names.sort();
            names.dedup();
            EjectableDiskCandidate {
                id,
                name: names.join(" · "),
            }
        })
        .collect()
}

fn ejectable_disk_list() -> Result<Vec<EjectableDiskCandidate>, String> {
    let entries = fs::read_dir("/Volumes")
        .map_err(|error| format!("Unable to inspect mounted volumes: {error}"))?;
    let mut infos = Vec::new();

    for entry in entries {
        let path = entry
            .map_err(|error| format!("Unable to inspect a mounted volume: {error}"))?
            .path();
        let output = Command::new("/usr/sbin/diskutil")
            .args(["info", "-plist"])
            .arg(&path)
            .output()
            .map_err(|error| format!("Unable to inspect mounted volume: {error}"))?;
        // Network shares and special mount points may not be managed by
        // diskutil. Ignore only those entries; a malformed plist is a real
        // detection failure and should remain visible to the user.
        if !output.status.success() {
            continue;
        }
        let info = plist::from_bytes::<DiskutilVolumeInfo>(&output.stdout)
            .map_err(|error| format!("Unable to read mounted volume details: {error}"))?;
        infos.push(info);
    }

    Ok(ejectable_disk_candidates_from_infos(infos))
}

fn external_disk_control_status(
    disks: &Result<Vec<EjectableDiskCandidate>, String>,
) -> (bool, Option<String>) {
    match disks {
        Ok(disks) if !disks.is_empty() => (true, None),
        Ok(_) => (false, Some("No ejectable volumes are mounted".to_string())),
        Err(error) => (false, Some(error.clone())),
    }
}

fn saved_eject_exclusions() -> HashSet<String> {
    read_process(
        "/usr/bin/defaults",
        &["read", PREFERENCES_DOMAIN, EJECT_EXCLUSIONS_KEY],
    )
    .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
    .unwrap_or_default()
    .into_iter()
    .collect()
}

fn save_eject_exclusions(exclusions: &[String]) -> Result<(), String> {
    let value = serde_json::to_string(exclusions)
        .map_err(|error| format!("Unable to save disk exclusions: {error}"))?;
    run_process(
        "/usr/bin/defaults",
        &[
            "write",
            PREFERENCES_DOMAIN,
            EJECT_EXCLUSIONS_KEY,
            "-string",
            &value,
        ],
    )
}

fn external_disk_inventory() -> Result<Vec<ExternalDisk>, String> {
    let exclusions = saved_eject_exclusions();
    Ok(ejectable_disk_list()?
        .into_iter()
        .map(|disk| ExternalDisk {
            excluded: exclusions.contains(&disk.name),
            id: disk.id,
            name: disk.name,
        })
        .collect())
}

fn eject_external_disks() -> Result<(), String> {
    let disks = external_disk_inventory()?;
    if disks.is_empty() {
        return Err("No ejectable volumes are mounted".to_string());
    }

    for disk in disks.into_iter().filter(|disk| !disk.excluded) {
        run_process("/usr/sbin/diskutil", &["eject", &disk.id])?;
    }
    Ok(())
}

#[tauri::command]
async fn get_external_disks() -> Result<Vec<ExternalDisk>, String> {
    tauri::async_runtime::spawn_blocking(external_disk_inventory)
        .await
        .map_err(|error| format!("Unable to read external disks: {error}"))?
}

#[tauri::command]
fn set_eject_exclusions(exclusions: Vec<String>) -> Result<(), String> {
    let cleaned = exclusions
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value.len() <= 512)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    save_eject_exclusions(&cleaned)
}

fn set_switch_blocking(
    id: String,
    enabled: bool,
    state: &NativeState,
) -> Result<SwitchResult, String> {
    let mode = control_mode(&id);
    if is_direct_system_toggle(&id) {
        let feature = set_direct_system_toggle(&id, enabled)?;
        return Ok(SwitchResult {
            state: feature.enabled != 0,
            state_known: feature.state_known != 0,
            mode,
            message: None,
        });
    }

    let _airpods_guard =
        if id == "airpods" {
            Some(state.airpods_operation.try_lock().map_err(|_| {
                "A Bluetooth audio device operation is already in progress".to_string()
            })?)
        } else {
            None
        };

    let mut result_message = None;
    let operation = match id.as_str() {
        "awake" => set_awake(enabled, state),
        "desktop" => set_desktop_hidden(enabled),
        "darkMode" => set_dark_mode(enabled),
        "airpods" => set_audio_device_connected(enabled),
        "hideDock" => set_dock_hidden(enabled),
        "hideWidgets" => set_widgets_hidden(enabled),
        "stageManager" => set_stage_manager(enabled),
        "muteMic" => set_microphone_muted(enabled, state),
        "music" => set_music_playing(enabled, state),
        "spotify" => set_spotify_playing(enabled, state),
        "hiddenFiles" => set_hidden_files_visible(enabled),
        "cleanScreen" => set_clean_screen(enabled),
        "lockKeyboard" => set_keyboard_locked(enabled),
        "frontApp" if enabled => run_osascript(
            "tell application \"System Events\" to key code 48 using {command down}",
        ),
        "frontApp" => Ok(()),
        "xcodeClean" if enabled => clean_xcode_derived_data(),
        "xcodeClean" => Ok(()),
        "emptyTrash" if enabled => empty_trash().map(|already_empty| {
            result_message = empty_trash_result_message(already_empty);
        }),
        "emptyTrash" => Ok(()),
        "ejectDisk" if enabled => eject_external_disks(),
        "ejectDisk" => Ok(()),
        "clipboard" if enabled => run_osascript("set the clipboard to \"\""),
        "clipboard" => Ok(()),
        "hideWindow" if enabled => run_osascript(
            "tell application \"System Events\" to keystroke \"h\" using {command down}",
        ),
        "hideWindow" => Ok(()),
        "screenSaver" if enabled => run_process("/usr/bin/open", &["-a", "ScreenSaverEngine"]),
        "screenSaver" => Ok(()),
        "displaySleep" if enabled => run_process("/usr/bin/pmset", &["displaysleepnow"]),
        "displaySleep" => Ok(()),
        "lockScreen" if enabled => run_osascript(
            "tell application \"System Events\" to keystroke \"q\" using {control down, command down}",
        ),
        "lockScreen" => Ok(()),
        "quitApps" if enabled => quit_nonessential_apps().map(|requested_count| {
            result_message = Some(format!("quit-apps-requested:{requested_count}"));
        }),
        "quitApps" => Ok(()),
        _ => Err(format!("{id} is not connected to macOS yet")),
    };

    operation?;
    let result_state = match mode {
        "action" | "settings" => false,
        _ if id == "cleanScreen" => clean_screen_active(),
        _ if id == "lockKeyboard" => keyboard_lock_active(),
        _ if id == "airpods" => native_audio_device_base_snapshot().connected,
        _ => enabled,
    };
    Ok(SwitchResult {
        state: result_state,
        state_known: true,
        mode,
        message: result_message,
    })
}

#[tauri::command]
async fn set_switch(id: String, enabled: bool, app: AppHandle) -> Result<SwitchResult, String> {
    #[cfg(target_os = "macos")]
    require_accessibility_or_show_guide()?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<NativeState>();
        set_switch_blocking(id, enabled, state.inner())
    })
    .await
    .map_err(|error| format!("The system operation stopped unexpectedly: {error}"))?;
    #[cfg(target_os = "macos")]
    if result.is_err() && unsafe { sb_accessibility_is_trusted() } == 0 {
        unsafe {
            sb_native_popover_hide();
            let _ = sb_accessibility_guide_show();
        }
    }
    result
}

fn native_state_values(
    state: &NativeState,
    audio_device: &AudioDeviceSnapshot,
) -> (HashMap<String, bool>, bool, bool) {
    let mut values = HashMap::new();

    let desktop_visible = read_process(
        "/usr/bin/defaults",
        &["read", "com.apple.finder", "CreateDesktop"],
    )
    .is_none_or(|value| value != "0" && !value.eq_ignore_ascii_case("false"));
    values.insert("desktop".into(), !desktop_visible);

    let dark_mode = read_process("/usr/bin/defaults", &["read", "-g", "AppleInterfaceStyle"])
        .is_some_and(|value| value.eq_ignore_ascii_case("dark"));
    values.insert("darkMode".into(), dark_mode);

    let dock_hidden = read_process("/usr/bin/defaults", &["read", "com.apple.dock", "autohide"])
        .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true"));
    values.insert("hideDock".into(), dock_hidden);

    let standard_widgets_hidden = read_window_manager_bool("StandardHideWidgets").unwrap_or(false);
    let staged_widgets_hidden =
        read_window_manager_bool("StageManagerHideWidgets").unwrap_or(false);
    values.insert(
        "hideWidgets".into(),
        standard_widgets_hidden && staged_widgets_hidden,
    );

    let stage_manager = read_window_manager_bool("GloballyEnabled").unwrap_or(false);
    values.insert("stageManager".into(), stage_manager);

    let current_input_volume = input_volume();
    values.insert(
        "muteMic".into(),
        current_input_volume.is_some_and(|volume| volume == 0),
    );
    if let Some(volume) = current_input_volume.filter(|volume| *volume > 0) {
        if let Ok(mut previous) = state.previous_input_volume.lock() {
            if previous.as_ref().copied() != Some(volume) {
                *previous = Some(volume);
                remember_previous_input_volume(volume);
            }
        }
    }

    let hidden_files = read_process(
        "/usr/bin/defaults",
        &["read", "com.apple.finder", "AppleShowAllFiles"],
    )
    .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true"));
    values.insert("hiddenFiles".into(), hidden_files);

    // Querying Music through AppleScript can block app startup while macOS waits
    // for Automation permission. Treat the state as unknown until the user has
    // explicitly operated this switch during the current app session.
    let music_state = state.music_playing.lock().ok().and_then(|playing| *playing);
    values.insert("music".into(), music_state.unwrap_or(false));
    let spotify_state = state
        .spotify_playing
        .lock()
        .ok()
        .and_then(|playing| *playing);
    values.insert("spotify".into(), spotify_state.unwrap_or(false));

    let awake = state
        .caffeinate
        .lock()
        .map(|process| process.is_some())
        .unwrap_or(false);
    values.insert("awake".into(), awake);
    values.insert("airpods".into(), audio_device.connected);
    values.insert("cleanScreen".into(), clean_screen_active());
    values.insert("lockKeyboard".into(), keyboard_lock_active());

    for id in ALL_CONTROL_IDS {
        values.entry(id.into()).or_insert(false);
    }

    (values, music_state.is_some(), spotify_state.is_some())
}

fn build_native_snapshot(state: &NativeState) -> NativeSnapshot {
    let audio_device = native_audio_device_snapshot();
    let external_disks = ejectable_disk_list();
    let (external_disks_available, external_disks_message) =
        external_disk_control_status(&external_disks);
    let (values, music_state_known, spotify_state_known) =
        native_state_values(state, &audio_device);
    let controls = ALL_CONTROL_IDS
        .into_iter()
        .map(|id| {
            let direct = is_direct_system_toggle(id)
                .then(|| get_direct_system_toggle(id))
                .transpose();
            let (available, state_known, state_value, message) = match direct {
                Ok(Some((feature, message))) => (
                    feature.available != 0,
                    feature.state_known != 0,
                    feature.enabled != 0,
                    message,
                ),
                Err(error) => (false, false, false, Some(error)),
                Ok(None) => {
                    let available = match id {
                        "airpods" => audio_device.paired,
                        "ejectDisk" => external_disks_available,
                        "spotify" => spotify_available(),
                        _ => true,
                    };
                    let message = match id {
                        "airpods" if !available => {
                            Some("No paired Bluetooth audio device was found".to_string())
                        }
                        "spotify" if !available => {
                            Some("Spotify is not installed on this Mac".to_string())
                        }
                        "ejectDisk" if !available => external_disks_message.clone(),
                        _ => None,
                    };
                    (
                        available,
                        snapshot_state_known(id, music_state_known, spotify_state_known),
                        values.get(id).copied().unwrap_or(false),
                        message,
                    )
                }
            };
            (
                id.to_string(),
                ControlSnapshot {
                    state: state_value,
                    state_known,
                    available,
                    mode: control_mode(id),
                    message,
                },
            )
        })
        .collect();

    NativeSnapshot {
        controls,
        audio_device,
    }
}

fn snapshot_state_known(id: &str, music_state_known: bool, spotify_state_known: bool) -> bool {
    match id {
        "music" => music_state_known,
        "spotify" => spotify_state_known,
        _ => true,
    }
}

fn system_settings_url(pane: &str) -> Option<&'static str> {
    match pane {
        "accessibility" => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        }
        "automation" => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
        }
        "bluetooth" => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth")
        }
        "focus" => Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Focus"),
        _ => None,
    }
}

#[tauri::command]
fn open_system_settings(pane: String) -> Result<(), String> {
    let url = system_settings_url(&pane)
        .ok_or_else(|| format!("Unknown System Settings destination: {pane}"))?;
    run_process("/usr/bin/open", &[url])
}

#[tauri::command]
async fn get_native_snapshot(app: AppHandle) -> Result<NativeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<NativeState>();
        build_native_snapshot(state.inner())
    })
    .await
    .map_err(|error| format!("Unable to read the system state: {error}"))
}

#[tauri::command]
async fn get_display_configuration() -> Result<DisplayConfiguration, String> {
    tauri::async_runtime::spawn_blocking(native_display_configuration)
        .await
        .map_err(|error| format!("Unable to read display information: {error}"))?
}

#[tauri::command]
async fn set_display_mode(display_id: u32, mode_id: i32) -> Result<DisplayConfiguration, String> {
    tauri::async_runtime::spawn_blocking(move || {
        set_native_display_mode(display_id, mode_id)?;
        native_display_configuration()
    })
    .await
    .map_err(|error| format!("The display operation stopped unexpectedly: {error}"))?
}

#[tauri::command]
fn open_preferences(app: AppHandle, pane: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let pane = match pane.as_deref() {
            None | Some("general") => "general",
            Some("customise") => "customise",
            Some("shortcuts") => "shortcuts",
            Some("about") => "about",
            Some(other) => return Err(format!("Unknown preferences pane: {other}")),
        };
        let pane = CString::new(pane)
            .map_err(|_| "The preferences pane contains an invalid null byte".to_string())?;
        unsafe {
            sb_native_popover_hide_for_app_window();
        }
        if let Some(popover) = app.get_webview_window("popover") {
            let _ = popover.hide();
        }
        let result = unsafe { sb_native_preferences_show(pane.as_ptr()) };
        return if result == 0 {
            Ok(())
        } else {
            Err(format!(
                "macOS could not show the native OneTouch settings window ({result})"
            ))
        };
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(popover) = app.get_webview_window("popover") {
            let _ = popover.hide();
        }
        let preferences = app
            .get_webview_window("preferences")
            .ok_or_else(|| "Preferences window is unavailable".to_string())?;
        preferences
            .set_size(LogicalSize::new(510.0, 540.0))
            .map_err(|error| error.to_string())?;
        preferences.center().map_err(|error| error.to_string())?;
        preferences.show().map_err(|error| error.to_string())?;
        preferences.set_focus().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn hide_current_window(window: WebviewWindow) -> Result<(), String> {
    let restore_previous_application = window.label() == "preferences";
    window.hide().map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    if restore_previous_application {
        unsafe {
            sb_native_restore_previous_application();
        }
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    let _ = set_clean_screen(false);
    let _ = set_keyboard_locked(false);
    app.exit(0);
}

const POPOVER_CHROME_HEIGHT: f64 = 118.0;
const POPOVER_ROW_HEIGHT: f64 = 55.0;
const POPOVER_WIDTH: f64 = 360.0;
const POPOVER_VISIBLE_ROW_CAP: usize = 8;

fn preferred_popover_height(item_count: usize, maximum: f64) -> f64 {
    let visible_rows = item_count.min(POPOVER_VISIBLE_ROW_CAP);
    let content_height = POPOVER_CHROME_HEIGHT + visible_rows as f64 * POPOVER_ROW_HEIGHT;
    content_height.min(maximum.max(POPOVER_CHROME_HEIGHT))
}

#[tauri::command]
fn resize_popover(app: AppHandle, item_count: usize) -> Result<(), String> {
    let window = app
        .get_webview_window("popover")
        .ok_or_else(|| "The popover window is unavailable".to_string())?;
    let maximum = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .map(|monitor| monitor.size().height as f64 / monitor.scale_factor() - 54.0)
        .unwrap_or(820.0);
    let height = preferred_popover_height(item_count, maximum);

    window
        .set_size(LogicalSize::new(POPOVER_WIDTH, height))
        .map_err(|error| error.to_string())?;
    position_popover(&app, &window, None);
    Ok(())
}

#[tauri::command]
fn update_native_popover(model: Value) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let json = serde_json::to_string(&model).map_err(|error| error.to_string())?;
        let json = CString::new(json)
            .map_err(|_| "The native popover model contains an invalid null byte".to_string())?;
        let result = unsafe { sb_native_popover_update_json(json.as_ptr()) };
        if result != 0 {
            return Err(format!(
                "macOS could not update the native OneTouch popover ({result})"
            ));
        }
        let native_model_was_ready = NATIVE_POPOVER_MODEL_READY.swap(true, Ordering::AcqRel);
        if let Some(app) = APP_HANDLE.get() {
            if let Some(window) = app.get_webview_window("popover") {
                if !native_model_was_ready && window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                    let native_result = if env::var_os("ONETOUCH_SHOW_NATIVE_POPOVER").is_some() {
                        unsafe { sb_native_popover_show_persistent() }
                    } else {
                        unsafe { sb_native_popover_show() }
                    };
                    if native_result == 0 {
                        if let Ok(mut active) = app.state::<NativeState>().native_menu_active.lock()
                        {
                            *active = false;
                        }
                    } else {
                        if let Ok(mut active) = app.state::<NativeState>().native_menu_active.lock()
                        {
                            *active = false;
                        }
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = model;
    Ok(())
}

#[tauri::command]
fn update_native_preferences(model: Value) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let json = serde_json::to_string(&model).map_err(|error| error.to_string())?;
        let json = CString::new(json)
            .map_err(|_| "The native settings model contains an invalid null byte".to_string())?;
        let result = unsafe { sb_native_preferences_update_json(json.as_ptr()) };
        if result != 0 {
            return Err(format!(
                "macOS could not update the native OneTouch settings window ({result})"
            ));
        }
    }
    Ok(())
}

#[tauri::command]
fn update_accessibility_guide(model: Value) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let json = serde_json::to_string(&model).map_err(|error| error.to_string())?;
        let json = CString::new(json).map_err(|_| {
            "The accessibility guide model contains an invalid null byte".to_string()
        })?;
        let result = unsafe { sb_accessibility_guide_update_json(json.as_ptr()) };
        if result != 0 {
            return Err(format!(
                "macOS could not update the OneTouch accessibility guide ({result})"
            ));
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = model;
    Ok(())
}

#[tauri::command]
fn show_accessibility_guide() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        if unsafe { sb_accessibility_is_trusted() } != 0 {
            unsafe { sb_accessibility_guide_hide() };
            return Ok(false);
        }
        let result = unsafe { sb_accessibility_guide_show() };
        return if result == 0 {
            Ok(true)
        } else {
            Err(format!(
                "macOS could not show the OneTouch accessibility guide ({result})"
            ))
        };
    }
    #[cfg(not(target_os = "macos"))]
    Ok(false)
}

#[cfg(target_os = "macos")]
fn require_accessibility_or_show_guide() -> Result<(), String> {
    if unsafe { sb_accessibility_is_trusted() } != 0 {
        return Ok(());
    }
    let _ = unsafe { sb_accessibility_guide_show() };
    Err("Accessibility permission is required to use OneTouch".to_string())
}

fn position_popover(app: &AppHandle, window: &WebviewWindow, anchor_rect: Option<tauri::Rect>) {
    let Ok(window_size) = window.outer_size() else {
        return;
    };

    let tray_rect = anchor_rect
        .or_else(|| {
            app.state::<NativeState>()
                .tray_anchor
                .lock()
                .ok()
                .and_then(|anchor| *anchor)
        })
        .or_else(|| {
            app.tray_by_id("switchboard-tray")
                .and_then(|tray| tray.rect().ok().flatten())
        });

    let Some(tray_rect) = tray_rect else {
        // Never invent a top-right anchor: a popover that is not attached to
        // its status item looks like an unrelated floating window.
        return;
    };

    let window_scale = window.scale_factor().unwrap_or(1.0);
    let tray_position = tray_rect.position.to_physical::<f64>(window_scale);
    let tray_size = tray_rect.size.to_physical::<f64>(window_scale);
    let tray_center_x = tray_position.x + tray_size.width / 2.0;
    let tray_center_y = tray_position.y + tray_size.height / 2.0;

    let monitor = app
        .monitor_from_point(tray_center_x, tray_center_y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let scale_factor = monitor.scale_factor();
    let work_area = monitor.work_area();
    let margin = 8.0 * scale_factor;
    let minimum_x = work_area.position.x as f64 + margin;
    let maximum_x = work_area.position.x as f64 + work_area.size.width as f64
        - window_size.width as f64
        - margin;
    let centered_x = tray_center_x - window_size.width as f64 / 2.0;
    let x = centered_x
        .clamp(minimum_x, maximum_x.max(minimum_x))
        .round() as i32;
    let y = (tray_position.y + tray_size.height)
        .max(work_area.position.y as f64)
        .round() as i32;

    let _ = window.set_position(PhysicalPosition::new(x, y));
}

#[cfg(target_os = "macos")]
fn show_popover_with_native_animation(window: &WebviewWindow) -> bool {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::MainThreadMarker;

    if MainThreadMarker::new().is_none() {
        return false;
    }
    let Ok(native_window) = window.ns_window() else {
        return false;
    };

    unsafe {
        let native_window: &NSWindow = &*native_window.cast();
        let final_frame = native_window.frame();
        let mut opening_frame = final_frame;
        opening_frame.origin.y += 5.0;
        native_window.setFrame_display(opening_frame, true);
        native_window.makeKeyAndOrderFront(None);
        native_window.setFrame_display_animate(final_frame, true, true);
    }

    true
}

#[cfg(not(target_os = "macos"))]
fn show_popover_with_native_animation(_window: &WebviewWindow) -> bool {
    false
}

#[tauri::command]
fn show_popover(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        require_accessibility_or_show_guide()?;
        let result = unsafe { sb_native_popover_show() };
        if result == 0 {
            if let Ok(mut active) = app.state::<NativeState>().native_menu_active.lock() {
                *active = false;
            }
            return Ok(());
        }
        return Err("OneTouch menu bar icon does not have a screen anchor".to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let window = app
            .get_webview_window("popover")
            .ok_or_else(|| "The popover window is unavailable".to_string())?;
        position_popover(&app, &window, None);
        if !show_popover_with_native_animation(&window) {
            window.show().map_err(|error| error.to_string())?;
        }
        window.set_focus().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn show_legacy_popover(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    require_accessibility_or_show_guide()?;
    #[cfg(target_os = "macos")]
    unsafe {
        sb_native_popover_hide();
    }
    let window = app
        .get_webview_window("popover")
        .ok_or_else(|| "The popover window is unavailable".to_string())?;
    position_popover(&app, &window, None);
    if !show_popover_with_native_animation(&window) {
        window.show().map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())
}

fn toggle_popover(app: &AppHandle, anchor_rect: tauri::Rect) {
    let Some(window) = app.get_webview_window("popover") else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    position_popover(app, &window, Some(anchor_rect));
    if !show_popover_with_native_animation(&window) {
        let _ = window.show();
    }
    let _ = window.set_focus();
}

#[cfg(target_os = "macos")]
fn native_status_anchor(x: f64, y: f64, width: f64, height: f64) -> Rect {
    // AppKit reports status-item geometry in logical points. Preserve that
    // coordinate space so position_popover can apply the monitor scale once.
    Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(width, height).into(),
    }
}

#[cfg(target_os = "macos")]
extern "C" fn native_status_item_clicked(x: f64, y: f64, width: f64, height: f64) {
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    let anchor_rect = native_status_anchor(x, y, width, height);
    if let Ok(mut stored_anchor) = app.state::<NativeState>().tray_anchor.lock() {
        *stored_anchor = Some(anchor_rect);
    }
    let _ = app.emit_to(
        "popover",
        "native-popover-action",
        NativePopoverAction {
            action: "refresh".to_string(),
            control_id: String::new(),
            value: 0,
        },
    );
    if let Some(window) = app.get_webview_window("popover") {
        let _ = window.hide();
    }
    if unsafe { sb_accessibility_is_trusted() } == 0 {
        unsafe {
            sb_native_popover_hide();
        }
        let _ = unsafe { sb_accessibility_guide_show() };
        return;
    }
    // The Objective-C controller always exists before the status item can be
    // clicked. Show its loading model if React has not supplied live state yet;
    // never fall back to a decorated WebView on macOS.
    let _ = unsafe { sb_native_popover_toggle() };
}

#[cfg(target_os = "macos")]
extern "C" fn native_popover_action(
    action: *const c_char,
    control_id: *const c_char,
    value: c_int,
) {
    if action.is_null() || control_id.is_null() {
        return;
    }
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    let action = unsafe { CStr::from_ptr(action) }
        .to_string_lossy()
        .into_owned();
    let control_id = unsafe { CStr::from_ptr(control_id) }
        .to_string_lossy()
        .into_owned();
    let _ = app.emit_to(
        "popover",
        "native-popover-action",
        NativePopoverAction {
            action,
            control_id,
            value,
        },
    );
}

#[cfg(target_os = "macos")]
extern "C" fn native_preferences_action(
    action: *const c_char,
    control_id: *const c_char,
    payload: *const c_char,
) {
    if action.is_null() || control_id.is_null() || payload.is_null() {
        return;
    }
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    let action = unsafe { CStr::from_ptr(action) }
        .to_string_lossy()
        .into_owned();
    let control_id = unsafe { CStr::from_ptr(control_id) }
        .to_string_lossy()
        .into_owned();
    let payload = unsafe { CStr::from_ptr(payload) }
        .to_string_lossy()
        .into_owned();
    let _ = app.emit_to(
        "popover",
        "native-preferences-action",
        NativePreferencesAction {
            action,
            control_id,
            payload,
        },
    );
}

fn create_windows(app: &tauri::App) -> tauri::Result<()> {
    let popover_model_host = WebviewWindowBuilder::new(
        app,
        "popover",
        WebviewUrl::App("index.html?view=popover".into()),
    )
    .title("OneTouch")
    .inner_size(POPOVER_WIDTH, preferred_popover_height(8, f64::MAX))
    .min_inner_size(POPOVER_WIDTH, POPOVER_CHROME_HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()?;
    #[cfg(not(target_os = "macos"))]
    configure_popover_surface(&popover_model_host)?;
    #[cfg(target_os = "macos")]
    let _ = popover_model_host;

    #[cfg(not(target_os = "macos"))]
    {
        WebviewWindowBuilder::new(
            app,
            "preferences",
            WebviewUrl::App("index.html?view=preferences".into()),
        )
        .title("OneTouch Preferences")
        .inner_size(510.0, 540.0)
        .min_inner_size(500.0, 500.0)
        .resizable(true)
        .decorations(true)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .transparent(true)
        .visible(false)
        .build()?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    if let Err(error) = migrate_legacy_webkit_data() {
        eprintln!("OneTouch could not migrate its previous WebKit settings: {error}");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(NativeState::default())
        .invoke_handler(tauri::generate_handler![
            set_switch,
            get_native_snapshot,
            get_display_configuration,
            set_display_mode,
            get_external_disks,
            set_eject_exclusions,
            open_preferences,
            hide_current_window,
            quit_app,
            resize_popover,
            show_popover,
            show_legacy_popover,
            update_native_popover,
            update_native_preferences,
            update_accessibility_guide,
            show_accessibility_guide,
            show_timer_menu,
            open_system_settings
        ])
        .on_tray_icon_event(|app, event| {
            if let TrayIconEvent::Click {
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(app, rect);
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            {
                let _ = APP_HANDLE.set(app.handle().clone());
                let result = unsafe { sb_status_item_create(Some(native_status_item_clicked)) };
                if result != 0 {
                    return Err(std::io::Error::other(
                        "macOS did not create the OneTouch status item",
                    )
                    .into());
                }
                let accessibility_result = unsafe { sb_accessibility_guide_create() };
                if accessibility_result != 0 {
                    return Err(std::io::Error::other(
                        "macOS did not create the OneTouch accessibility guide",
                    )
                    .into());
                }
                let popover_result =
                    unsafe { sb_native_popover_create(Some(native_popover_action)) };
                if popover_result != 0 {
                    return Err(std::io::Error::other(
                        "macOS did not create the native OneTouch popover",
                    )
                    .into());
                }
                let preferences_result =
                    unsafe { sb_native_preferences_create(Some(native_preferences_action)) };
                if preferences_result != 0 {
                    return Err(std::io::Error::other(
                        "macOS did not create the native OneTouch settings window",
                    )
                    .into());
                }
            }

            create_windows(app)?;

            #[cfg(target_os = "macos")]
            if env::var_os("ONETOUCH_SHOW_NATIVE_POPOVER").is_some() {
                if let Ok(mut active) = app.state::<NativeState>().native_menu_active.lock() {
                    *active = true;
                }
                let app = app.handle().clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(500));
                    if let Some(window) = app.get_webview_window("popover") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }

            #[cfg(not(target_os = "macos"))]
            TrayIconBuilder::with_id("switchboard-tray")
                .icon(TRAY_COMMAND_ICON.clone())
                .icon_as_template(false)
                .show_menu_on_left_click(false)
                .tooltip("OneTouch")
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
                #[cfg(target_os = "macos")]
                if window.label() == "preferences" {
                    unsafe {
                        sb_native_restore_previous_application();
                    }
                }
            }
            WindowEvent::Focused(false) if window.label() == "popover" => {
                let native_menu_active = window
                    .app_handle()
                    .state::<NativeState>()
                    .native_menu_active
                    .lock()
                    .map(|active| *active)
                    .unwrap_or(false);
                if !native_menu_active {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building OneTouch")
        .run(|_app_handle, event| {
            #[cfg(target_os = "macos")]
            if matches!(event, tauri::RunEvent::Reopen { .. }) {
                let result = unsafe { sb_status_item_ensure_available() };
                if result != 0 {
                    eprintln!("OneTouch could not restore its menu bar icon ({result})");
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use super::{
        control_mode, ejectable_disk_candidates_from_infos, external_disk_control_status,
        find_audio_device_battery, parse_defaults_bool, run_process_with_timeout,
        snapshot_state_known, system_settings_url, timer_menu_choice, DiskutilVolumeInfo,
        EjectableDiskCandidate,
    };

    #[cfg(target_os = "macos")]
    use super::migrate_legacy_webkit_data_in;

    #[cfg(target_os = "macos")]
    #[test]
    fn migrates_legacy_webkit_local_storage_before_creating_webviews() {
        let source = include_str!("lib.rs");
        assert!(
            source.find("migrate_legacy_webkit_data()").unwrap()
                < source.find("tauri::Builder::default()").unwrap()
        );

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "onetouch-webkit-migration-{}-{nonce}",
            std::process::id()
        ));
        let legacy_storage = root
            .join("WebKit")
            .join("design.ryan.onetouch")
            .join("WebsiteData")
            .join("Default")
            .join("origin")
            .join("LocalStorage")
            .join("localstorage.sqlite3");
        std::fs::create_dir_all(legacy_storage.parent().unwrap()).unwrap();
        std::fs::write(&legacy_storage, b"existing OneTouch settings").unwrap();

        assert!(migrate_legacy_webkit_data_in(&root).unwrap());
        let migrated_storage = root
            .join("WebKit")
            .join("design.ryan.onetouch.menubar")
            .join("WebsiteData")
            .join("Default")
            .join("origin")
            .join("LocalStorage")
            .join("localstorage.sqlite3");
        assert_eq!(
            std::fs::read(migrated_storage).unwrap(),
            b"existing OneTouch settings"
        );
        assert!(legacy_storage.exists());
        assert!(!migrate_legacy_webkit_data_in(&root).unwrap());
        assert!(root
            .join("Application Support")
            .join("OneTouch")
            .join("Migrations")
            .join("webkit-bundle-identity-v1.complete")
            .exists());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_ejectable_images_and_disks_but_excludes_system_volumes() {
        let infos = vec![
            DiskutilVolumeInfo {
                device_identifier: Some("disk5s1".into()),
                parent_whole_disk: Some("disk5".into()),
                volume_name: Some("AgentIsland 1.6.1".into()),
                mount_point: Some("/Volumes/AgentIsland 1.6.1".into()),
                ejectable: true,
                internal: false,
            },
            DiskutilVolumeInfo {
                device_identifier: Some("disk6s1".into()),
                parent_whole_disk: Some("disk6".into()),
                volume_name: Some("Cindy Installer".into()),
                mount_point: Some("/Volumes/Cindy Installer".into()),
                ejectable: true,
                internal: false,
            },
            DiskutilVolumeInfo {
                device_identifier: Some("disk3s1s1".into()),
                parent_whole_disk: Some("disk3".into()),
                volume_name: Some("Macintosh HD".into()),
                mount_point: Some("/".into()),
                ejectable: false,
                internal: true,
            },
        ];

        assert_eq!(
            ejectable_disk_candidates_from_infos(infos),
            vec![
                EjectableDiskCandidate {
                    id: "/dev/disk5".into(),
                    name: "AgentIsland 1.6.1".into(),
                },
                EjectableDiskCandidate {
                    id: "/dev/disk6".into(),
                    name: "Cindy Installer".into(),
                },
            ]
        );
    }

    #[test]
    fn groups_multiple_volumes_on_the_same_ejectable_device() {
        let infos = ["Work", "Archive"].map(|name| DiskutilVolumeInfo {
            device_identifier: Some(format!("disk7s{name}")),
            parent_whole_disk: Some("disk7".into()),
            volume_name: Some(name.into()),
            mount_point: Some(format!("/Volumes/{name}")),
            ejectable: true,
            internal: false,
        });
        assert_eq!(
            ejectable_disk_candidates_from_infos(infos),
            vec![EjectableDiskCandidate {
                id: "/dev/disk7".into(),
                name: "Archive · Work".into(),
            }]
        );
    }

    #[test]
    fn parses_the_system_ejectable_volume_properties() {
        let plist = br#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>DeviceIdentifier</key><string>disk6s1</string>
<key>ParentWholeDisk</key><string>disk6</string>
<key>VolumeName</key><string>Cindy Installer</string>
<key>MountPoint</key><string>/Volumes/Cindy Installer</string>
<key>Ejectable</key><true/>
<key>Internal</key><false/>
</dict></plist>"#;
        let info = plist::from_bytes::<DiskutilVolumeInfo>(plist).unwrap();
        assert_eq!(info.parent_whole_disk.as_deref(), Some("disk6"));
        assert!(info.ejectable);
        assert!(!info.internal);
    }

    #[test]
    fn disables_eject_when_no_ejectable_volume_is_mounted() {
        assert_eq!(
            external_disk_control_status(&Ok(Vec::new())),
            (false, Some("No ejectable volumes are mounted".to_string()))
        );
        assert_eq!(
            external_disk_control_status(&Ok(vec![EjectableDiskCandidate {
                id: "/dev/disk4".into(),
                name: "External SSD".into(),
            }])),
            (true, None)
        );
    }

    #[test]
    fn empty_trash_action_is_idempotent_and_race_safe() {
        assert!(super::EMPTY_TRASH_COUNT_SCRIPT.contains("count items of trash"));
        assert!(super::EMPTY_TRASH_SCRIPT.contains("if (count of items of trash) is 0 then return"));
        assert!(
            super::EMPTY_TRASH_SCRIPT.contains("if (count of items of trash) is not 0 then error")
        );
        assert_eq!(
            super::empty_trash_result_message(true).as_deref(),
            Some("trash-already-empty")
        );
        assert_eq!(super::empty_trash_result_message(false), None);
    }

    #[test]
    fn keyboard_cleaning_filters_normal_modifier_and_media_keys() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("CGEventMaskBit(kCGEventKeyDown)"));
        assert!(helper.contains("CGEventMaskBit(kCGEventKeyUp)"));
        assert!(helper.contains("CGEventMaskBit(kCGEventFlagsChanged)"));
        assert!(helper.contains("CGEventMaskBit((CGEventType)NX_SYSDEFINED)"));
        assert!(!helper.contains("SBIsEmergencyShortcut"));
    }

    #[test]
    fn native_timer_menu_uses_appkit_and_maps_every_duration() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("NSMenu *menu"));
        assert!(helper.contains("popUpMenuPositioningItem"));
        assert_eq!(timer_menu_choice(0), Some("30m"));
        assert_eq!(timer_menu_choice(4), Some("today"));
        assert_eq!(timer_menu_choice(5), Some("none"));
        assert_eq!(timer_menu_choice(-1), None);
    }

    #[test]
    fn native_status_item_uses_the_migrated_bundle_identity_and_public_appkit_api() {
        let helper = include_str!("macos_helper.m");
        let config = include_str!("../tauri.conf.json");
        assert!(config.contains("\"identifier\": \"design.ryan.onetouch.menubar\""));
        assert!(!helper.contains("NSStatusItem Visible "));
        assert!(!helper.contains("NSStatusItem VisibleCC "));
        assert!(helper.contains("statusItemWithLength:24.0"));
        assert!(!helper.contains("SBStatusItem.length ="));
        assert!(helper.contains("initWithString:@\"P\""));
        assert!(helper.contains("NSForegroundColorAttributeName: NSColor.clearColor"));
        assert!(helper.contains("@interface SBPassthroughImageView"));
        assert!(helper.contains("SBStatusIconView.contentTintColor = nil"));
        assert!(!helper.contains("SBStatusIconView.contentTintColor = NSColor.whiteColor"));
        assert!(
            !helper.contains("_initWithStatusBar:length:priority:systemInsertOrder:activeItem:")
        );
        assert!(!helper.contains("SBPrimaryStatusItemAutosaveName"));
        assert!(!helper.contains("setAutosaveName:"));
        assert!(!helper.contains("_insertStatusItem:"));
        assert!(!helper.contains("_wakeStatusItem"));
        assert!(!helper.contains("SBStatusItemBehaviorNeverClip"));
        assert!(!helper.contains("_setDropPriority:"));
        assert!(!helper.contains("OneTouchStatusDebug"));
        assert!(helper.contains("SBEnsureStatusItemAvailable"));
        assert!(helper.contains("NSContainsRect(screen.frame, frame)"));
        assert!(helper.contains("150.0 * NSEC_PER_MSEC"));
        assert!(helper.contains("500.0 * NSEC_PER_MSEC"));
        assert!(helper.contains("return -2;"));
        assert!(helper.contains("result = SBEnsureStatusItemAvailable();"));
        assert!(!helper.contains("removeStatusItem"));
        assert!(!helper.contains("SBStatusItem.visible = YES"));
        assert!(helper.contains("disableAutomaticTermination"));
        assert!(helper.contains("disableSuddenTermination"));
    }

    #[test]
    fn hidden_status_item_never_opens_an_unanchored_window() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("SBStatusItemHasScreenAnchor"));
        assert!(helper.contains("menuBarFloor"));
        assert!(helper.contains("SBEnsureStatusItemAvailable"));
        assert!(!helper.contains("SBNativePopoverDetached"));
        assert!(!helper.contains("SBShowDetachedNativePopover"));

        let source = include_str!("lib.rs").split("#[cfg(test)]").next().unwrap();
        assert!(!source.contains("sb_status_item_is_visible"));
        assert!(source.contains("tauri::RunEvent::Reopen"));
        assert!(source.contains("sb_status_item_ensure_available"));
        assert!(!source.contains("show_popover(app_handle.clone())"));
        assert!(source.contains("menu bar icon does not have a screen anchor"));
        assert!(source.contains("Never invent a top-right anchor"));
        assert!(source.contains("NATIVE_POPOVER_MODEL_READY.swap(true"));
        assert!(source.contains("if native_result == 0"));
    }

    #[test]
    fn native_arrowless_panel_uses_system_chrome_and_preserves_content_alignment() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("NSView *rootView = self.contentHostView ?: self.view"));
        assert!(helper.contains("rootView.subviews.copy"));
        assert!(!helper.contains("[rootView layoutSubtreeIfNeeded]"));
        assert!(helper.contains(
            "if (!NSEqualSizes(SBNativePopoverPanel.contentView.frame.size, targetSize))"
        ));
        assert!(!helper.contains("rootView.frame ="));
        assert!(!helper.contains("[self loadView]"));
        assert!(helper.contains("SBActivateForNativePopover"));
        assert!(helper.contains("[NSApp activateIgnoringOtherApps:YES]"));
        assert!(helper.contains("static __strong NSPanel *SBNativePopoverPanel"));
        assert!(helper.contains("SBNativePopoverPanelWindow : NSPanel"));
        assert!(helper.contains("NSWindowStyleMaskTitled"));
        assert!(helper.contains("NSWindowStyleMaskFullSizeContentView"));
        assert!(helper.contains("NSWindowStyleMaskNonactivatingPanel"));
        assert!(helper.contains("NSGlassEffectViewStyleRegular"));
        assert!(helper.contains("glass.tintColor = nil"));
        assert!(helper.contains("NSVisualEffectMaterialPopover"));
        assert!(helper.contains("NSVisualEffectBlendingModeBehindWindow"));
        assert!(helper.contains("SBPositionNativePopoverPanel"));
        assert!(helper.contains("NSMidX(anchorFrame)"));
        assert!(helper.contains("CGFloat top = NSMinY(anchorFrame);"));
        assert!(!helper.contains("SBNativePanelGap"));
        assert!(helper.contains("setFrameTopLeftPoint"));
        assert!(helper.contains("SBNativePopoverLocalEventMonitor"));
        assert!(helper.contains("SBNativePopoverGlobalEventMonitor"));
        assert!(helper.contains("event.keyCode == 53"));
        assert!(!helper.contains("showRelativeToRect:"));
        assert!(!helper.contains("NSPopoverBehaviorTransient"));
        assert!(!helper.contains("layer.cornerRadius"));
        assert!(!helper.contains("SBSeparator"));
        assert!(helper.contains("separator.boxType = NSBoxSeparator"));
        assert!(helper.contains("2.0 * SBNativeSeparatorHeight"));
        assert!(helper.contains("visibleRows * SBNativeRowHeight"));
        assert!(helper.contains("NSScrollView *scroll = [NSScrollView new]"));
        assert!(helper.contains("rows.count > SBNativeVisibleRowCapacity"));
        assert!(helper.contains("initWithFrame:NSMakeRect(0.0, 0.0, SBNativePopoverWidth"));
        assert!(!helper.contains("document.autoresizingMask"));
        assert!(helper.contains("NSGlassEffectView *glass"));
        assert!(!helper.contains("NSAppearanceNameDarkAqua"));
        assert!(!helper.contains("[NSColor colorWithWhite:0.02 alpha:0.30]"));
        assert!(!helper.contains("surfaceColor"));
        assert!(helper
            .contains("[kind isEqualToString:@\"toggle\"] || [kind isEqualToString:@\"action\"]"));
        assert!(!helper.contains("if (pending && ![kind isEqualToString:@\"action\"])"));
        assert!(!helper.contains("if (self.momentary &&"));
        assert!(helper
            .contains("toggle.state = active ? NSControlStateValueOn : NSControlStateValueOff"));
        assert!(helper.contains("[(NSSwitch *)toggle.animator setState:desiredState]"));
        assert!(helper.contains("BOOL canUpdateInPlace"));
        assert!(helper.contains("[self updateRow:row"));
        assert!(helper.contains("toggle.enabled = enabled && !busy"));
        assert!(!helper.contains("SBInteractionShieldView"));
        assert!(helper.contains(
            "affordance.trailingAnchor constraintEqualToAnchor:controlColumn.trailingAnchor"
        ));
        assert!(!helper.contains(
            "affordance.centerXAnchor constraintEqualToAnchor:controlColumn.centerXAnchor"
        ));
        assert!(helper.contains("SBEmitNativePopoverAction(@\"state\", @\"cleanScreen\", 0)"));
        assert!(helper.contains("SBHideNativePopover"));
        assert!(helper.contains("SBRestorePreviousApplicationAfterPopover"));
        assert!(helper.contains("rowStack.alignment = NSLayoutAttributeLeading"));
        assert!(helper.contains("view.widthAnchor constraintEqualToAnchor:rowStack.widthAnchor"));
        assert!(!helper.contains("rowStack.alignment = NSLayoutAttributeWidth"));
        assert!(helper.contains("SBNativeControlColumnWidth = 64.0"));
        assert!(helper.contains(
            "copy.trailingAnchor constraintLessThanOrEqualToAnchor:controlColumn.leadingAnchor"
        ));
        assert!(helper.contains(
            "controlColumn.trailingAnchor constraintEqualToAnchor:container.trailingAnchor"
        ));
        assert!(
            helper.contains("settings.leadingAnchor constraintEqualToAnchor:footer.leadingAnchor")
        );
        assert!(helper
            .contains("customise.leadingAnchor constraintEqualToAnchor:settings.trailingAnchor"));
        assert!(
            helper.contains("customise.trailingAnchor constraintEqualToAnchor:quit.leadingAnchor")
        );
        assert!(!helper.contains("customise.centerXAnchor"));
        assert!(!helper.contains("customise.widthAnchor constraintGreaterThanOrEqualToConstant"));
        assert!(
            helper
                .matches("bezelStyle = NSBezelStyleAccessoryBarAction")
                .count()
                >= 3
        );
        assert!(helper.contains("buttonType = NSButtonTypeMomentaryPushIn"));
        assert!(!helper.contains("@interface SBNativeFooterButton : NSButton"));
        assert!(!helper.contains("NSTrackingMouseEnteredAndExited"));
        assert!(!helper.contains("hoverTrackingArea"));
        assert!(!helper.contains("mouseEntered:"));
        assert!(!helper.contains("mouseExited:"));
        assert!(
            helper
                .matches("showsBorderOnlyWhileMouseInside = YES")
                .count()
                >= 3
        );
        assert!(helper.contains("customise.showsBorderOnlyWhileMouseInside = YES"));
        assert!(
            helper.contains("quit.trailingAnchor constraintEqualToAnchor:footer.trailingAnchor")
        );
        assert!(!helper.contains("NSStackViewDistributionEqualCentering"));
        assert!(helper.contains("systemFontOfSize:15.0 weight:NSFontWeightMedium"));
        assert!(helper.contains("systemFontOfSize:NSFont.systemFontSize"));
        assert!(helper.contains("systemFontOfSize:NSFont.smallSystemFontSize"));
        assert!(helper.contains("systemFontOfSize:13.0 weight:NSFontWeightRegular"));
    }

    #[test]
    fn design_contract_uses_appkit_semantic_visual_parameters() {
        let readme = include_str!("../../README.md");
        assert!(readme.contains("必须直接使用 AppKit 的原生组件与语义参数"));
        assert!(readme.contains("不得额外叠加硬编码 RGB、透明度或自定义模糊强度"));
        assert!(readme.contains("功能标题使用 `systemFontSize`"));
        assert!(readme.contains("次级说明使用 `smallSystemFontSize`"));
        assert!(readme.contains("品牌标题最多使用 `Medium`"));

        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("SBNativePopoverPanelWindow alloc"));
        assert!(helper.contains("self.view = content"));
        assert!(helper.contains("@available(macOS 26.0, *)"));
        assert!(helper.contains("NSGlassEffectView *glass"));
        assert!(helper.contains("glass.style = NSGlassEffectViewStyleRegular"));
        assert!(helper.contains("glass.tintColor = nil"));
        assert!(helper.contains("glass.contentView = content"));
        assert!(helper.contains("content.material = NSVisualEffectMaterialPopover"));
        assert!(helper.contains("content.blendingMode = NSVisualEffectBlendingModeBehindWindow"));
        assert!(helper.contains("SBNativePopoverPanel.titlebarAppearsTransparent = YES"));
        assert!(helper.contains("SBNativePopoverPanel.hasShadow = YES"));
        assert!(!helper.contains("layer.cornerRadius"));
        assert!(!helper.contains("glass.cornerRadius"));
        assert!(!helper.contains("NSAppearanceNameDarkAqua"));
        assert!(!helper.contains("[NSColor colorWithWhite:0.02 alpha:0.30]"));
        assert!(!helper.contains("NSTrackingMouseEnteredAndExited"));
        assert!(helper.contains("settings.showsBorderOnlyWhileMouseInside = YES"));
        assert!(helper.contains("customise.showsBorderOnlyWhileMouseInside = YES"));
        assert!(helper.contains("quit.showsBorderOnlyWhileMouseInside = YES"));
    }

    #[test]
    fn preferences_transition_keeps_onetouch_frontmost_until_the_window_closes() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("sb_native_popover_hide_for_app_window"));
        assert!(helper.contains("SBHideNativePopover(NO);"));
        assert!(helper.contains("sb_native_preferences_show"));
        assert!(helper.contains("sb_native_restore_previous_application"));
        assert!(helper.contains("windowWillClose"));
        assert!(helper.contains("SBRestorePreviousApplicationAfterPopover"));

        let source = include_str!("lib.rs");
        assert!(source.contains("sb_native_popover_hide_for_app_window();"));
        assert!(source.contains("sb_native_preferences_show(pane.as_ptr())"));
        assert!(source.contains("sb_native_preferences_create(Some(native_preferences_action))"));
        assert!(source.contains("sb_native_restore_previous_application();"));
    }

    #[test]
    fn macos_bundle_declares_the_real_application_icon() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid Tauri config");
        let icons = config["bundle"]["icon"]
            .as_array()
            .expect("bundle icon list");
        assert!(icons.iter().any(|icon| icon == "icons/icon.icns"));
    }

    #[test]
    fn native_preferences_use_appkit_without_dropping_existing_features() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("@interface SBNativePreferencesController"));
        assert!(helper.contains("NSTabViewControllerTabStyleToolbar"));
        assert!(helper.contains("NSWindowToolbarStylePreference"));
        assert!(helper.contains("window.titleVisibility = NSWindowTitleVisible"));
        assert!(helper.contains("self.view.window.title = label"));
        assert!(!helper.contains("configurePreferencesToolbarButtons"));
        assert!(helper.contains("NSPopUpButton"));
        assert!(helper.contains("NSGridView"));
        assert!(helper.contains("NSSearchField"));
        assert!(helper.contains("NSTableViewStyleInset"));
        assert!(helper.contains("[NSButton checkboxWithTitle:@\"\""));
        assert!(helper.contains("checkbox.controlSize = NSControlSizeSmall"));
        assert!(helper.contains("visibilityChanged:(NSButton *)sender"));
        assert!(!helper.contains("toggle.controlSize = NSControlSizeMini"));
        assert!(helper.contains("NSApplication.sharedApplication.applicationIconImage"));
        assert!(helper.contains("self.loginSwitch = [NSSwitch new]"));
        assert!(helper.contains("self.customTable = [self newPreferencesTable]"));
        assert!(helper.contains("registerForDraggedTypes"));
        assert!(helper.contains("SBEmitNativePreferencesAction(@\"order\""));
        assert!(helper.contains("SBEmitNativePreferencesAction(@\"visibility\""));
        assert!(helper.contains("addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown"));
        assert!(helper.contains("SBEmitNativePreferencesAction(@\"shortcut\""));
        assert!(!helper.contains("clear.hidden = display.length == 0"));
        assert!(helper.contains(
            "record.trailingAnchor constraintEqualToAnchor:cell.trailingAnchor constant:-14.0"
        ));
        assert!(helper.contains("SBNativePreferencesContentWidth = 400.0"));
        assert!(helper.contains("SBNativePreferencesShortcutButtonWidth = 72.0"));
        assert!(helper.contains("self.aboutGitHubButton"));
        assert!(helper.contains("NSWorkspace.sharedWorkspace openURL:url"));

        let source = include_str!("lib.rs");
        assert!(source.contains("update_native_preferences"));
        assert!(source.contains("\"native-preferences-action\""));
        assert!(source.contains("#[cfg(not(target_os = \"macos\"))]"));

        let app = include_str!("../../src/App.jsx");
        assert!(app.contains("listenForNativePreferencesActions"));
        assert!(app.contains("updateNativePreferences(nativePreferencesModel)"));
        assert!(app.contains("toggleVisibleControl(current, controlId)"));
        assert!(app.contains("validateNativeGlobalShortcut(payload)"));
        assert!(app.contains("localStorage.setItem('switchboard-visible'"));
        assert!(app.contains("localStorage.setItem('switchboard-order'"));
        assert!(app.contains("localStorage.setItem('switchboard-shortcuts'"));
    }

    #[test]
    fn accessibility_guide_uses_native_file_drag_and_blocks_untrusted_controls() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("@interface SBAccessibilityGuideController"));
        assert!(helper.contains("@interface SBAccessibilityDragView"));
        assert!(helper.contains("initWithPasteboardWriter:self.appURL"));
        assert!(helper.contains("SBAccessibilityApplicationURL"));
        assert!(helper.contains("CGWindowListCopyWindowInfo"));
        assert!(helper.contains("accessibilityDisplayShouldReduceMotion"));
        assert!(helper.contains("NSGlassEffectViewStyleRegular"));
        assert!(helper.contains("AXIsProcessTrusted()"));
        assert!(helper.contains("AXIsProcessTrustedWithOptions"));
        assert!(helper.contains("kAXTrustedCheckOptionPrompt"));

        let source = include_str!("lib.rs");
        assert!(source.contains("fn require_accessibility_or_show_guide"));
        assert!(source.contains("sb_accessibility_guide_create()"));
        assert!(source.contains("update_accessibility_guide"));
        assert!(source.contains("show_accessibility_guide"));
        assert!(source.contains("if unsafe { sb_accessibility_is_trusted() } == 0"));

        let app = include_str!("../../src/App.jsx");
        assert!(app.contains("ACCESSIBILITY_GUIDE_COPY"));
        assert!(app.contains("updateNativeAccessibilityGuide(accessibilityGuideModel)"));
        assert!(app.contains("showNativeAccessibilityGuide()"));

        let bridge = include_str!("../../src/nativeBridge.js");
        assert!(bridge.contains("invoke('update_accessibility_guide'"));
        assert!(bridge.contains("invoke('show_accessibility_guide'"));
    }

    #[test]
    fn parses_bluetooth_headphone_battery_from_system_profiler() {
        let profile = serde_json::json!({
            "SPBluetoothDataType": [{
                "device_connected": [{
                    "Ryan's AirPods Pro": {
                        "device_batteryLevelLeft": "91%",
                        "device_batteryLevelRight": "87%",
                        "device_batteryLevelCase": "76%"
                    }
                }]
            }]
        });
        let battery = find_audio_device_battery(&profile, "Ryan's AirPods Pro").unwrap();
        assert_eq!(
            battery,
            (
                "Ryan's AirPods Pro".into(),
                None,
                Some(91),
                Some(87),
                Some(76)
            )
        );
    }

    #[test]
    fn parses_generic_bluetooth_headphone_battery() {
        let profile = serde_json::json!({
            "device_connected": [{
                "Sony WH-1000XM6": {
                    "device_minorType": "Headphones",
                    "device_batteryLevel": "82%"
                }
            }]
        });
        let battery = find_audio_device_battery(&profile, "Sony WH-1000XM6").unwrap();
        assert_eq!(
            battery,
            ("Sony WH-1000XM6".into(), Some(82), None, None, None)
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reads_bluetooth_audio_snapshot_without_changing_connection() {
        let snapshot = super::native_audio_device_snapshot();
        assert!(!snapshot.name.trim().is_empty());
        if snapshot.connected {
            assert!(snapshot.paired);
        }
    }

    #[test]
    fn classifies_direct_system_controls_as_toggles() {
        for id in ["dnd", "nightShift", "trueTone", "lowPower", "highPower"] {
            assert_eq!(control_mode(id), "toggle");
            assert!(super::is_direct_system_toggle(id));
        }
        assert_eq!(control_mode("airpods"), "toggle");
        assert_eq!(control_mode("cleanScreen"), "toggle");
    }

    #[test]
    fn parses_window_manager_boolean_preferences() {
        assert_eq!(parse_defaults_bool("1"), Some(true));
        assert_eq!(parse_defaults_bool("true"), Some(true));
        assert_eq!(parse_defaults_bool("0"), Some(false));
        assert_eq!(parse_defaults_bool("FALSE"), Some(false));
        assert_eq!(parse_defaults_bool("unexpected"), None);
    }

    #[test]
    fn distinguishes_actions_from_settings_destinations() {
        assert_eq!(control_mode("screenSaver"), "action");
        assert_eq!(control_mode("emptyTrash"), "action");
        assert_eq!(control_mode("quitApps"), "action");
        assert_eq!(control_mode("resolution"), "choice");
    }

    #[test]
    fn quit_other_apps_uses_a_safe_appkit_termination_policy() {
        let helper = include_str!("macos_helper.m");
        assert!(helper.contains("NSApplicationActivationPolicyRegular"));
        assert!(helper.contains("com.apple.finder"));
        assert!(helper.contains("application.processIdentifier == currentProcessID"));
        assert!(helper.contains("application.processIdentifier == previousFrontmostProcessID"));
        assert!(helper.contains("[application terminate]"));
        assert!(!helper.contains("[application forceTerminate]"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reads_active_display_modes_without_changing_them() {
        let configuration = super::native_display_configuration()
            .expect("active display configuration should be readable");
        assert!(!configuration.displays.is_empty());
        for display in configuration.displays {
            assert!(!display.name.is_empty());
            assert!(!display.modes.is_empty());
            assert!(display.current_width > 0);
            assert!(display.current_height > 0);
            assert!(display.modes.iter().any(|mode| mode.current));
        }
    }

    #[test]
    fn keeps_music_neutral_until_the_session_knows_its_state() {
        assert!(!snapshot_state_known("music", false, false));
        assert!(snapshot_state_known("music", true, false));
        assert!(!snapshot_state_known("spotify", true, false));
        assert!(snapshot_state_known("spotify", false, true));
        assert!(snapshot_state_known("darkMode", false, false));
    }

    #[test]
    fn rejects_unknown_system_settings_destinations() {
        assert!(system_settings_url("accessibility").is_some());
        assert!(system_settings_url("automation").is_some());
        assert!(system_settings_url("unknown").is_none());
    }

    #[test]
    fn sizes_popover_to_visible_control_count() {
        assert_eq!(super::preferred_popover_height(0, 820.0), 118.0);
        assert_eq!(super::preferred_popover_height(8, 820.0), 558.0);
        assert_eq!(super::preferred_popover_height(9, 820.0), 558.0);
        assert_eq!(super::preferred_popover_height(24, 820.0), 558.0);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn scales_native_status_anchor_from_appkit_points_once() {
        let anchor = super::native_status_anchor(868.0, 0.0, 22.0, 24.0);
        let position = anchor.position.to_physical::<f64>(2.0);
        let size = anchor.size.to_physical::<f64>(2.0);

        assert_eq!((position.x, position.y), (1736.0, 0.0));
        assert_eq!((size.width, size.height), (44.0, 48.0));
    }

    #[test]
    fn stops_a_process_after_its_timeout() {
        let started = Instant::now();
        let result =
            run_process_with_timeout("/bin/sh", &["-c", "sleep 1"], Duration::from_millis(50));

        assert!(result.is_err());
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "temporarily changes and then restores real macOS display settings"]
    fn round_trips_private_display_toggles() {
        for id in ["nightShift", "trueTone"] {
            eprintln!("reading {id}");
            let (before, _) = super::get_direct_system_toggle(id)
                .unwrap_or_else(|error| panic!("could not read {id}: {error}"));
            if before.available == 0 {
                continue;
            }

            let requested = before.enabled == 0;
            eprintln!("changing {id} to {requested}");
            let change = super::set_direct_system_toggle(id, requested);
            eprintln!("verifying {id}");
            let observed = super::get_direct_system_toggle(id);
            eprintln!("restoring {id} to {}", before.enabled != 0);
            let restore = super::set_direct_system_toggle(id, before.enabled != 0);

            let changed = change.unwrap_or_else(|error| panic!("could not change {id}: {error}"));
            let (after, _) =
                observed.unwrap_or_else(|error| panic!("could not verify {id}: {error}"));
            restore.unwrap_or_else(|error| panic!("could not restore {id}: {error}"));
            assert_eq!(changed.enabled != 0, requested, "{id} setter result");
            assert_eq!(after.enabled != 0, requested, "{id} read-back result");
        }
    }
}
