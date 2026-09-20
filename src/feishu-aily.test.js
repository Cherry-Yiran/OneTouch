import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const native = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const interactions = await readFile(new URL('./controlInteractions.js', import.meta.url), 'utf8');
const timers = await readFile(new URL('./timerModel.js', import.meta.url), 'utf8');

test('the feishu aily daemon is a bilingual toggle with a paper plane icon', () => {
  assert.match(app, /feishuAily: \['Feishu aily', 'Starts the aily background service'\]/);
  assert.match(app, /feishuAily: \['飞书 aily', '启动飞书 aily 后台服务'\]/);
  assert.match(app, /\{ id: 'feishuAily', icon: Send \}/);
  assert.match(app, /^\s+Send,$/m);
  assert.match(app, /feishuAily: 'paperplane\.fill'/);
  assert.match(app, /quitApps: false, feishuAily: false \}/);
  assert.doesNotMatch(interactions, /ACTION_CONTROL_IDS[\s\S]*?'feishuAily'/);
  assert.doesNotMatch(timers, /TIMED_CONTROL_IDS[\s\S]*?'feishuAily'/);
});

test('the row reports the daemon state instead of echoing the click', () => {
  assert.match(native, /"feishuAily",\n\];/);
  assert.match(native, /"feishuAily" => set_feishu_aily\(enabled\)/);
  assert.match(native, /_ if id == "feishuAily" => aily_daemon_running\(\)\.unwrap_or\(enabled\)/);
  assert.match(
    native,
    /values\.insert\("feishuAily"\.into\(\), aily_daemon_running\(\)\.unwrap_or\(false\)\)/,
  );
  assert.match(native, /"feishuAily" => aily_available,/);
  assert.match(
    native,
    /"feishuAily" if !available => Some\(AILY_CLI_NOT_INSTALLED\.to_string\(\)\)/,
  );
});

test('aily-cli is invoked by absolute path with a usable PATH and no inherited agent env', () => {
  assert.match(native, /home\.join\("\.aily-cli"\)\.join\("bin"\)\.join\("aily-cli"\)/);
  assert.match(native, /Command::new\(wrapper\)/);
  assert.doesNotMatch(native, /Command::new\("aily-cli"\)/);
  assert.match(native, /"\/opt\/homebrew\/bin", "\/usr\/local\/bin", "\/usr\/bin", "\/bin"/);
  assert.match(native, /key\.starts_with\("AILY_CLI_"\)/);
  assert.match(native, /command\.env_remove\(key\)/);
  // No TTY is attached, so `daemon stop` refuses to run without --yes.
  assert.match(
    native,
    /\[\s*"daemon",\s*"stop",\s*"--yes",\s*"--timeout",\s*AILY_STOP_GRACE_SECONDS,?\s*\]/,
  );
  assert.match(native, /\.stdin\(Stdio::null\(\)\)/);
  assert.doesNotMatch(native, /tauri_plugin_shell/);
});

test('quitting OneTouch leaves the aily daemon running', () => {
  const production = native.split('#[cfg(test)]')[0];
  const quitPath = production.split('fn stop_transient_features')[1];
  assert.ok(quitPath, 'stop_transient_features is defined in the production source');
  assert.doesNotMatch(quitPath, /set_feishu_aily/);
  assert.doesNotMatch(quitPath, /feishuAily/);
});
