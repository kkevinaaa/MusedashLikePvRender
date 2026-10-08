import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitsInWindow, beatLabel, chartWarnings, freshChart, gridTicks, loopPosition, parseChart, serializeChart, snapHeight, snapTick, tickToSeconds, secondsToTick } from '../src/core.ts';

test('offset and BPM map time without changing note ticks', () => {
  const chart = freshChart();
  chart.meta.bpm = 160; chart.meta.offsetSeconds = 0.125;
  chart.notes = [{ id: 'a', tick: 1920, height: 0.32 }];
  assert.equal(tickToSeconds(1920, chart.meta), 1.625);
  assert.equal(secondsToTick(1.625, chart.meta), 1920);
  chart.meta.offsetSeconds = -0.25;
  assert.equal(tickToSeconds(chart.notes[0].tick, chart.meta), 1.25);
  assert.equal(chart.notes[0].tick, 1920);
});
test('all subdivisions land on integer ticks for supported signatures', () => {
  for (const denominator of [1, 2, 4, 8, 16]) for (const division of [2, 3, 4, 6, 8]) {
    const chart = freshChart(); chart.meta.timeSignature = { numerator: 6, denominator };
    const step = gridTicks(chart.meta, division);
    assert.ok(Number.isInteger(step));
    const result = snapTick(tickToSeconds(step * 2.2, chart.meta), chart.meta, division, true);
    assert.equal(result, step * 2);
  }
});
test('free height and snap do not mutate stored notes', () => {
  assert.equal(snapHeight(0.51, 7, true), 0.5);
  assert.equal(snapHeight(0.51, 7, false), 0.51);
  assert.equal(snapHeight(-0.1, 7, false), 0);
});
test('JSON round-trip preserves metadata, note identities, and precision', () => {
  const chart = freshChart(); chart.meta.offsetSeconds = -0.234;
  chart.meta.music = { name: '音楽.flac', duration: 92.654, size: 1000 };
  chart.notes = [{ id: 'first', tick: 96, height: 0.123456789 }, { id: 'second', tick: 480, height: 1 }];
  assert.deepEqual(parseChart(serializeChart(chart)), chart);
});
test('reject corrupt schema, duplicate ids, invalid values, versions and PPQ', () => {
  const variants: unknown[] = [
    { ...freshChart(), version: 2 },
    { ...freshChart(), notes: [{ id: 'a', tick: 0, height: 0 }, { id: 'a', tick: 480, height: 1 }] },
    { ...freshChart(), notes: [{ id: 'a', tick: 2.5, height: 0.5 }] },
    { ...freshChart(), notes: [{ id: 'a', tick: 0, height: 1.1 }] },
    { ...freshChart(), meta: { ...freshChart().meta, bpm: 0 } },
    { ...freshChart(), meta: { ...freshChart().meta, offsetSeconds: null } },
    { ...freshChart(), meta: { ...freshChart().meta, ppq: 960 } },
    { ...freshChart(), meta: { ...freshChart().meta, timeSignature: { numerator: 4, denominator: 3 } } },
  ];
  for (const value of variants) assert.throws(() => parseChart(JSON.stringify(value)));
  assert.throws(() => parseChart('not json'));
});
test('same-tick and out-of-range notes warn but survive import', () => {
  const chart = freshChart(); chart.meta.offsetSeconds = -0.1;
  chart.notes = [{ id: 'a', tick: 0, height: 0 }, { id: 'b', tick: 0, height: 1 }, { id: 'c', tick: 960, height: 0.5 }];
  const imported = parseChart(serializeChart(chart));
  assert.equal(imported.notes.length, 3);
  assert.deepEqual(chartWarnings(imported, 0.5), ['1 个音符与其他音符同刻，已保留，请检查', '3 个音符超出音乐时间范围，已保留']);
});
test('loop clock handles many loops and exact boundaries', () => {
  assert.equal(loopPosition(3, { start: 2, end: 4 }), 3);
  assert.equal(loopPosition(4, { start: 2, end: 4 }), 2);
  assert.equal(loopPosition(24.5, { start: 2, end: 4 }), 2.5);
  assert.equal(loopPosition(24.5, null), 24.5);
});

test('beat numbering continues across bars and respects denominator', () => {
  const chart = freshChart();
  assert.equal(beatLabel(1920, chart.meta), '5');
  chart.meta.timeSignature = { numerator: 6, denominator: 8 };
  assert.equal(beatLabel(1440, chart.meta), '7');
});
test('hit scheduling skips past notes, preserves simultaneous hits, and has no boundary duplicates', () => {
  assert.deepEqual(hitsInWindow([0, 0.1, 0.1, 0.2, 1], 0, 0.2, null), [0, 0.1, 0.1]);
  assert.deepEqual(hitsInWindow([0, 0.1, 0.2, 1], 0.2, 0.4, null), [0.2]);
  assert.deepEqual(hitsInWindow([0, 1, 1.5, 2, 3], 1.9, 3.1, { start: 1, end: 2 }), [2, 2.5, 3]);
});
