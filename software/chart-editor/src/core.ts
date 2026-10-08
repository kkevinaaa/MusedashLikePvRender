export const PPQ = 480;
export const DIVISIONS = [2, 3, 4, 6, 8] as const;
export const SCROLL_STEPS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8];

export interface Note { id: string; tick: number; height: number }
export interface MusicReference { name: string; duration: number; size: number }
export interface Chart {
  version: 1;
  meta: {
    title: string;
    seed?: number;
    bpm: number;
    offsetSeconds: number;
    ppq: 480;
    timeSignature: { numerator: number; denominator: number };
    music: MusicReference | null;
  };
  notes: Note[];
}
export const freshChart = (): Chart => ({
  version: 1,
  meta: { title: '未命名谱面', seed: 1, bpm: 120, offsetSeconds: 0, ppq: PPQ,
    timeSignature: { numerator: 4, denominator: 4 }, music: null },
  notes: [],
});
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const tickToSeconds = (tick: number, meta: Chart['meta']) => meta.offsetSeconds + tick * 60 / (meta.bpm * PPQ);
export const secondsToTick = (seconds: number, meta: Chart['meta']) => (seconds - meta.offsetSeconds) * meta.bpm * PPQ / 60;
// PPQ and BPM always refer to quarter notes; grid "每拍" refers to the denominator beat.
export const ticksPerBeat = (meta: Chart['meta']) => PPQ * 4 / meta.timeSignature.denominator;
export const gridTicks = (meta: Chart['meta'], division: number) => ticksPerBeat(meta) / division;
export function snapTick(seconds: number, meta: Chart['meta'], division: number, enabled: boolean) {
  const tick = secondsToTick(seconds, meta);
  return Math.max(0, Math.round(enabled ? Math.round(tick / gridTicks(meta, division)) * gridTicks(meta, division) : tick));
}
export const snapHeight = (height: number, lines: number, enabled: boolean) =>
  clamp(enabled ? Math.round(height * (lines - 1)) / (lines - 1) : height, 0, 1);
export function beatLabel(tick: number, meta: Chart['meta']) {
  if (tick < 0) return '第一拍之前';
  const beats = tick / ticksPerBeat(meta);
  return `${Math.floor(beats / meta.timeSignature.numerator) + 1}:${Math.floor(beats % meta.timeSignature.numerator) + 1}`;
}
export function formatTime(seconds: number) {
  const abs = Math.abs(seconds);
  return `${seconds < 0 ? '−' : ''}${Math.floor(abs / 60).toString().padStart(2, '0')}:${(abs % 60).toFixed(3).padStart(6, '0')}`;
}
export function normalizeNotes(notes: Note[]) { return [...notes].sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id)); }

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 必须是对象`);
  return value as Record<string, unknown>;
}
function number(value: unknown, name: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${name} 必须是 ${min}～${max} 范围内的${integer ? '整数' : '数值'}`);
  }
  return value;
}
export function parseChart(text: string): Chart {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('JSON 格式错误，当前谱面未改变'); }
  const root = record(value, '谱面');
  if (root.version !== 1) throw new Error(`不支持谱面版本 ${String(root.version)}，需要 version: 1`);
  const m = record(root.meta, 'meta');
  if (m.ppq !== PPQ) throw new Error('初版仅支持 ppq: 480');
  if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 200) throw new Error('曲名不能为空，且不能超过 200 字');
  const signature = record(m.timeSignature ?? { numerator: m.beatsPerBar ?? 4, denominator: 4 }, '拍号');
  const numerator = number(signature.numerator, '拍号分子', 1, 32, true);
  const denominator = number(signature.denominator, '拍号分母', 1, 16, true);
  if (![1, 2, 4, 8, 16].includes(denominator)) throw new Error('拍号分母仅支持 1、2、4、8、16');
  let music: MusicReference | null = null;
  if (m.music != null) {
    const ref = record(m.music, '音乐信息');
    if (typeof ref.name !== 'string' || !ref.name) throw new Error('音乐文件名无效');
    music = { name: ref.name, duration: number(ref.duration, '音乐时长', 0.001, 86400), size: number(ref.size, '音乐文件大小', 0, Number.MAX_SAFE_INTEGER, true) };
  }
  if (!Array.isArray(root.notes) || root.notes.length > 100000) throw new Error('notes 必须是数组，且不超过 100000 个音符');
  const ids = new Set<string>();
  const notes = root.notes.map((value, i) => {
    const n = record(value, `音符 ${i + 1}`);
    if (typeof n.id !== 'string' || !n.id || n.id.length > 200 || ids.has(n.id)) throw new Error(`音符 ${i + 1} 的 ID 无效或重复`);
    ids.add(n.id);
    return { id: n.id, tick: number(n.tick, `音符 ${i + 1} tick`, 0, 1000000000, true), height: number(n.height, `音符 ${i + 1} height`, 0, 1) };
  });
  return { version: 1, meta: { title: m.title, seed: m.seed == null ? 1 : number(m.seed, 'seed', 0, 4294967295, true), bpm: number(m.bpm, 'BPM', 1, 1000), offsetSeconds: number(m.offsetSeconds, 'offset', -86400, 86400),
    timeSignature: { numerator, denominator }, ppq: PPQ, music }, notes: normalizeNotes(notes) };
}
export function serializeChart(chart: Chart) {
  return JSON.stringify({ ...chart, notes: normalizeNotes(chart.notes) }, null, 2) + '\n';
}
export function chartWarnings(chart: Chart, duration?: number) {
  const warnings: string[] = [];
  const seen = new Set<number>(); let collisions = 0; let outside = 0;
  for (const n of chart.notes) {
    if (seen.has(n.tick)) collisions++; seen.add(n.tick);
    const sec = tickToSeconds(n.tick, chart.meta);
    if (sec < 0 || (duration != null && sec > duration)) outside++;
  }
  if (collisions) warnings.push(`${collisions} 个音符与其他音符同刻，已保留，请检查`);
  if (outside) warnings.push(`${outside} 个音符超出音乐时间范围，已保留`);
  return warnings;
}
export function loopPosition(raw: number, loop: { start: number; end: number } | null) {
  if (loop && raw >= loop.end) return loop.start + (raw - loop.start) % (loop.end - loop.start);
  return raw;
}
