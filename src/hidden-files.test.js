import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const native = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const interactions = await readFile(new URL('./controlInteractions.js', import.meta.url), 'utf8');

test('hidden Finder files are exposed as a persistent bilingual switch', () => {
  assert.match(app, /hiddenFiles: \['Show hidden files', 'Reveal files in Finder'\]/);
  assert.match(app, /hiddenFiles: \['显示隐藏文件', '在 Finder 中显示文件'\]/);
  assert.match(app, /\{ id: 'hiddenFiles', icon: FolderOpen \}/);
  assert.doesNotMatch(interactions, /ACTION_CONTROL_IDS[\s\S]*?'hiddenFiles'/);
});

test('hidden Finder files read and write the same macOS preference', () => {
  assert.match(native, /fn set_hidden_files_visible\(enabled: bool\)/);
  assert.match(native, /"AppleShowAllFiles"/);
  assert.match(native, /"hiddenFiles" => set_hidden_files_visible\(enabled\)/);
  assert.match(native, /values\.insert\("hiddenFiles"\.into\(\), hidden_files\)/);
  assert.match(native, /fn refresh_finder_if_running\(\)/);
  assert.match(native, /let _ = run_process\("\/usr\/bin\/killall", &\["Finder"\]\)/);
  assert.match(native, /set_hidden_files_visible[\s\S]*?refresh_finder_if_running\(\);[\s\S]*?Ok\(\(\)\)/);
});
