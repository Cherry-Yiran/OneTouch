import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveInitialLanguage } from './localization.js';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const preferences = await readFile(new URL('./Preferences.jsx', import.meta.url), 'utf8');

function copyKeys(source, start, end) {
  const keys = new Set(
    [...source.slice(start, end).matchAll(/(?:^|[,{]\s*)([A-Za-z][A-Za-z0-9]*):/gm)]
      .map((match) => match[1]),
  );
  keys.delete('en');
  keys.delete('zh');
  return keys;
}

function assertCopyParity(source, objectStart, objectEnd) {
  const object = source.slice(source.indexOf(objectStart), source.indexOf(objectEnd));
  const englishStart = object.indexOf('en: {');
  const chineseStart = object.indexOf('zh: {');
  assert.notEqual(englishStart, -1);
  assert.notEqual(chineseStart, -1);
  const english = object.slice(englishStart, chineseStart);
  const chinese = object.slice(chineseStart);
  assert.deepEqual(
    [...copyKeys(english, 0, english.length)].sort(),
    [...copyKeys(chinese, 0, chinese.length)].sort(),
  );
  assert.doesNotMatch(english, /\p{Script=Han}/u);
}

test('chooses a saved language first and otherwise follows the Mac language', () => {
  assert.equal(resolveInitialLanguage('en', ['zh-CN']), 'en');
  assert.equal(resolveInitialLanguage('zh', ['en-US']), 'zh');
  assert.equal(resolveInitialLanguage('', ['zh-Hans-CN', 'en-US']), 'zh');
  assert.equal(resolveInitialLanguage(null, ['en-GB']), 'en');
  assert.equal(resolveInitialLanguage('fr', []), 'en');
});

test('main controls and preferences keep matching English and Chinese keys', () => {
  assertCopyParity(app, 'const COPY = {', 'export const ACCESSIBILITY_GUIDE_COPY');
  assertCopyParity(preferences, 'export const PREFERENCES_COPY = {', 'const TAB_DATA');
});

test('the document language updates with the selected language', () => {
  assert.match(app, /document\.documentElement\.lang = language === 'zh' \? 'zh-CN' : 'en'/);
});
