// Run against npm run dev. Uses an installed Playwright or the Codex bundled runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));
}
const out = path.resolve('test-results');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS', name); };
const count = async n => { await page.getByText(`${n} 音符 · 480 PPQ`, { exact: true }).waitFor(); };
const canvas = page.getByTestId('chart-canvas');
const point = async (x, y) => { const box = await canvas.boundingBox(); await page.mouse.move(box.x + x, box.y + y); };
const put = async (x, y) => { await point(x, y); await canvas.focus(); await page.keyboard.press('q'); };
const exportChart = async () => {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出 JSON/ }).click();
  const download = await event;
  const text = await fs.readFile(await download.path(), 'utf8');
  return JSON.parse(text);
};
const uploadJSON = async (value, name = 'test.chart.json') => page.getByLabel('导入谱面文件').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
const field = async (label, value) => { const input = page.getByRole('spinbutton', { name: label, exact: true }); await input.fill(String(value)); await input.press('Enter'); };
try {
  await page.goto('http://127.0.0.1:5173');
  await count(0);
  await put(156, 210); await put(256, 280); await put(356, 350); await count(3);
  check('Q places three notes', true);
  const first = await exportChart();
  check('notes save as integer ticks and normalized heights', first.notes.every(n => Number.isInteger(n.tick) && n.height >= 0 && n.height <= 1));
  await point(356, 350); await page.mouse.click((await canvas.boundingBox()).x + 356, (await canvas.boundingBox()).y + 350, { button: 'right' });
  // Snapped height differs from pointer height; delete using exported coordinates.
  if ((await page.getByText('3 音符 · 480 PPQ', { exact: true }).count()) > 0) {
    const b = await canvas.boundingBox(), note = first.notes[2];
    const y = 134 + note.height * (b.height - 134 - 32);
    await point(356, y); await page.mouse.click(b.x + 356, b.y + y, { button: 'right' });
  }
  await count(2); check('hover right-click deletes without selection', true);
  const beforeGrid = await exportChart();
  await page.getByLabel('每拍细分', { exact: true }).fill('4');
  await canvas.focus(); await page.keyboard.press('v'); await page.keyboard.press('t');
  const afterGrid = await exportChart();
  check('grid and V/T toggles do not mutate notes', JSON.stringify(beforeGrid.notes) === JSON.stringify(afterGrid.notes));
  check('V disables guide display and snap together', await page.getByRole('button', { name: /高度辅助线与吸附/ }).getAttribute('aria-pressed') === 'false');
  await field('Offset', 125); await field('BPM', 160);
  const calibrated = await exportChart();
  check('BPM/offset update metadata only', calibrated.meta.bpm === 160 && calibrated.meta.offsetSeconds === 0.125 && JSON.stringify(calibrated.notes) === JSON.stringify(beforeGrid.notes));
  await page.getByRole('spinbutton', { name: 'BPM', exact: true }).fill('199');
  await page.getByRole('spinbutton', { name: 'BPM', exact: true }).press('Escape');
  check('Escape cancels numerical draft', (await exportChart()).meta.bpm === 160);
  const pendingSave = page.waitForEvent('download');
  await page.getByRole('spinbutton', { name: 'BPM', exact: true }).fill('150');
  await page.keyboard.press('Control+s');
  const savedDraft = JSON.parse(await fs.readFile(await (await pendingSave).path(), 'utf8'));
  check('Ctrl+S commits active numeric draft before export', savedDraft.meta.bpm === 150);
  await field('BPM', 160);
  const title = page.getByRole('textbox', { name: '曲名', exact: true });
  await title.fill('输入 q v t 不放音符'); await title.press('q'); await title.press('Tab'); await count(2);
  check('typing does not trigger canvas shortcuts', true);
  const countBeforeInvalid = (await exportChart()).notes.length;
  await uploadJSON({ version: 99 });
  await page.getByRole('status').filter({ hasText: '不支持谱面版本' }).waitFor();
  await count(countBeforeInvalid); check('invalid import preserves current chart', true);
  await put(500, 280); await count(3);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('dialog', { name: '新建谱面' }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click(); await count(3);
  check('unsaved replacement can be cancelled', true);
  const saved = await exportChart();
  await page.getByRole('button', { name: '新建', exact: true }).click(); await count(0);
  await uploadJSON(saved); await count(3);
  assert.deepEqual(await exportChart(), saved);
  check('JSON round-trip is lossless', true);

  // A short known signal for deterministic end/loop tests.
  const rate = 44100, seconds = 6, samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 4000), 44 + i * 2);
  await page.getByLabel('导入音乐文件').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByRole('button', { name: '播放', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('button[aria-label="播放"]').disabled);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(450);
  const during = await page.getByTestId('current-time').textContent();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page.getByTestId('current-time').textContent();
  await page.waitForTimeout(250);
  check('audio clock advances then stays fixed on pause', during !== '00:00.000' && paused === await page.getByTestId('current-time').textContent());
  await field('循环 A', 1); await field('循环 B', 1.3);
  await page.getByRole('button', { name: '↻ 循环', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(950);
  const loopTime = await page.getByTestId('current-time').textContent();
  check('short loop stays inside A/B after multiple wraps', Number(loopTime.slice(3)) >= 1 && Number(loopTime.slice(3)) <= 1.3);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await field('循环 B', 0.5);
  check('invalid loop disables looping', await page.getByRole('button', { name: '↻ 循环', exact: true }).getAttribute('aria-pressed') === 'false');
  const cb = await canvas.boundingBox();
  await page.mouse.click(cb.x + 56 + 5.7 * 100, cb.y + 20);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '播放', exact: true }).waitFor();
  check('natural audio end stops at exact duration', await page.getByTestId('current-time').textContent() === '00:06.000');
  await page.getByRole('button', { name: '回到音乐开头', exact: true }).click();
  await canvas.focus(); await page.keyboard.press('p'); await page.mouse.move((await canvas.boundingBox()).x + 500, (await canvas.boundingBox()).y + 250); await page.mouse.wheel(0, 100);
  check('scroll navigation changes the audio position', await page.getByTestId('current-time').textContent() !== loopTime);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.locator('[aria-label="Offset 滚轮或拖动微调"]').hover(); await page.mouse.wheel(0, -100);
  await page.getByRole('button', { name: '播放', exact: true }).waitFor();
  check('offset wheel pauses playback and changes by 1ms', Number(await page.getByRole('spinbutton', { name: 'Offset', exact: true }).inputValue()) === 126);
  await page.getByLabel('导入音乐文件').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid audio') });
  await page.getByRole('status').filter({ hasText: '音乐加载失败' }).waitFor();
  check('failed audio import preserves loaded music', await page.getByText('test-tone.wav', { exact: true }).count() === 1);

  const realMusic = process.argv[2];
  if (realMusic) {
    await page.getByLabel('导入音乐文件').setInputFiles(realMusic);
    await page.getByRole('dialog', { name: '音乐与谱面记录不一致' }).waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: '关联这份音乐' }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click(); await page.waitForTimeout(600);
    check('actual workspace FLAC decodes and plays', (await page.getByTestId('current-time').textContent()) !== '00:00.000');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
  }
  await field('BPM', 160); await field('Offset', 125);
  await field('循环 A', 0); await field('循环 B', 4);
  await page.getByRole('button', { name: '回到音乐开头', exact: true }).click();
  await title.fill('ゆめ · 旋律草稿'); await title.press('Tab');
  await canvas.focus();
  if (await page.getByRole('button', { name: /时间吸附/ }).getAttribute('aria-pressed') === 'false') await page.keyboard.press('t');
  if (await page.getByRole('button', { name: /高度辅助线与吸附/ }).getAttribute('aria-pressed') === 'false') await page.keyboard.press('v');
  const finalBox = await canvas.boundingBox();
  for (let i = 0; i < 14; i++) await put(160 + i * 64, 145 + (i % 6) / 6 * (finalBox.height - 166));
  await page.mouse.move(20, 20);
  await page.screenshot({ path: path.join(out, 'editor-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.screenshot({ path: path.join(out, 'editor-1100.png'), fullPage: true });
  check('1100px desktop viewport has no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('no browser runtime errors', errors.length === 0);
  await fs.writeFile(path.join(out, 'browser-results.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`Completed ${checks.length} browser checks.`);
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
  console.error('Browser errors:', errors);
  throw error;
} finally { await browser.close(); }
