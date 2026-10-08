import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Chart, Note } from './core';
import { beatLabel, clamp, formatTime, gridTicks, secondsToTick, snapHeight, snapTick, ticksPerBeat, tickToSeconds } from './core';
import type { Waveform } from './audio';

export interface Cursor { time: number; tick: number; height: number; note: Note | null; inNotes: boolean }
interface Props {
  chart: Chart; wave: Waveform | null; position: number; start: number; pixelsPerSecond: number;
  division: number; heightLines: number; heightSnap: boolean; timeSnap: boolean;
  loop: { start: number; end: number } | null;
  onSeek: (seconds: number) => void;
  onWheel: (direction: number) => void;
  onCursor: (cursor: Cursor | null) => void;
  onDelete: (id: string) => void;
  onWidth: (width: number) => void;
}
const LEFT = 56, RIGHT = 22, TOP = 134, BOTTOM = 32;
export default function Editor(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 420 });
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef(props); latest.current = props;
  const { chart, wave, position, start, pixelsPerSecond: scale, division, heightLines, heightSnap, timeSnap, loop } = props;
  const points = useMemo(() => chart.notes.map(note => ({ note, time: tickToSeconds(note.tick, chart.meta) })), [chart]);
  const usableHeight = Math.max(1, size.height - TOP - BOTTOM);
  const pointAt = (x: number, y: number): Cursor => {
    const time = start + (x - LEFT) / scale;
    let note: Note | null = null, distance = 15;
    for (const point of points) {
      const px = LEFT + (point.time - start) * scale;
      if (Math.abs(px - x) > 15) continue;
      const d = Math.hypot(px - x, TOP + point.note.height * usableHeight - y);
      if (d < distance) { note = point.note; distance = d; }
    }
    return { time, tick: snapTick(time, chart.meta, division, timeSnap), height: snapHeight((y - TOP) / usableHeight, heightLines, heightSnap), note,
      inNotes: x >= LEFT && x <= size.width - RIGHT && y >= TOP && y <= size.height - BOTTOM };
  };
  const cursor = mouse ? pointAt(mouse.x, mouse.y) : null;
  useEffect(() => { props.onCursor(cursor); }, [mouse, chart, start, scale, division, heightSnap, timeSnap, heightLines, size]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width), height = Math.floor(entry.contentRect.height);
      setSize({ width, height }); latest.current.onWidth(Math.max(1, width - LEFT - RIGHT));
    });
    observer.observe(wrapper.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current!;
    const wheel = (event: WheelEvent) => {
      // Keep browser pinch / Ctrl-wheel zoom accessible.
      if (event.ctrlKey) return;
      event.preventDefault();
      if (event.deltaY || event.deltaX) latest.current.onWheel(Math.sign(event.deltaY || event.deltaX));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  useEffect(() => {
    const element = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * dpr); element.height = Math.round(size.height * dpr);
    const c = element.getContext('2d')!; c.scale(dpr, dpr);
    const { width: w, height: h } = size;
    const xAt = (seconds: number) => LEFT + (seconds - start) * scale;
    const end = start + (w - LEFT - RIGHT) / scale;
    c.fillStyle = '#141b24'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#101720'; c.fillRect(LEFT, TOP, w - LEFT - RIGHT, usableHeight);
    c.font = '11px "Segoe UI", sans-serif';
    c.fillStyle = '#758596'; c.fillText('小节', 13, 23); c.fillText('波形', 13, 70); c.fillText('时间', 13, 113);
    c.save(); c.beginPath(); c.rect(LEFT, 0, w - LEFT - RIGHT, h); c.clip();
    if (loop) {
      c.fillStyle = '#65dfb30d'; c.fillRect(xAt(loop.start), 0, (loop.end - loop.start) * scale, h - BOTTOM);
      c.fillStyle = '#65dfb32b'; c.fillRect(xAt(loop.start), 0, (loop.end - loop.start) * scale, 31);
    }
    if (wave) {
      c.fillStyle = '#77afa8';
      for (let x = LEFT; x < w - RIGHT; x += 2) {
        const from = Math.floor((start + (x - LEFT) / scale) / wave.duration * wave.min.length);
        const to = Math.ceil((start + (x + 2 - LEFT) / scale) / wave.duration * wave.min.length);
        let lo = 0, hi = 0;
        for (let j = Math.max(0, from); j < Math.min(wave.min.length, to); j++) { lo = Math.min(lo, wave.min[j]); hi = Math.max(hi, wave.max[j]); }
        if (to >= 0 && from < wave.min.length) c.fillRect(x, 66 - hi * 27, 1.25, Math.max(1, (hi - lo) * 27));
      }
    } else {
      c.fillStyle = '#607080'; c.fillText(chart.meta.music ? '请重新关联音乐文件，恢复波形与试听' : '导入本地音乐后显示波形', LEFT + 20, 71);
    }
    const perBeat = ticksPerBeat(chart.meta), perBar = perBeat * chart.meta.timeSignature.numerator;
    const step = gridTicks(chart.meta, division);
    const stepPixels = step * 60 / (chart.meta.bpm * 480) * scale;
    // Keep drawing work bounded at extreme BPM / zoom, without changing snap precision.
    let renderStep = stepPixels >= 7 ? step : perBeat;
    if (renderStep * 60 / (chart.meta.bpm * 480) * scale < 8) renderStep = perBar;
    while (renderStep * 60 / (chart.meta.bpm * 480) * scale < 8) renderStep *= 2;
    const fromTick = Math.max(0, Math.floor(secondsToTick(start, chart.meta) / renderStep) * renderStep);
    const untilTick = secondsToTick(end, chart.meta);
    let lastLabel = -100;
    for (let tick = fromTick; tick <= untilTick; tick += renderStep) {
      const x = xAt(tickToSeconds(tick, chart.meta));
      const bar = Math.abs(tick / perBar - Math.round(tick / perBar)) < 0.00001;
      const beat = Math.abs(tick / perBeat - Math.round(tick / perBeat)) < 0.00001;
      c.strokeStyle = bar ? '#425366' : beat ? '#2b394a' : '#1d2a38';
      c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, TOP); c.lineTo(Math.round(x) + 0.5, h - BOTTOM); c.stroke();
      if (bar && x > lastLabel + 40) { c.fillStyle = '#b4c5d6'; c.fillText(String(Math.round(tick / perBar) + 1).padStart(2, '0'), x + 5, 22); lastLabel = x; }
      else if (beat) { c.fillStyle = '#445469'; c.fillRect(x, 26, 1, 5); }
    }
    const timeStep = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300].find(v => v * scale > 72) ?? 600;
    for (let t = Math.ceil(start / timeStep) * timeStep; t < end; t += timeStep) {
      c.fillStyle = '#667c91'; c.fillText(`${t.toFixed(timeStep < 1 ? 2 : 0)}s`, xAt(t) + 4, 113);
    }
    if (heightSnap) for (let i = 0; i < heightLines; i++) {
      const y = TOP + i / (heightLines - 1) * usableHeight;
      c.strokeStyle = '#344438'; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(LEFT, y); c.lineTo(w - RIGHT, y); c.stroke(); c.setLineDash([]);
    }
    for (const { note, time } of points) {
      const x = xAt(time), y = TOP + note.height * usableHeight;
      if (x < LEFT - 12 || x > w - RIGHT + 12) continue;
      const hover = cursor?.note?.id === note.id && cursor.inNotes;
      c.fillStyle = hover ? '#ffd296' : '#71e5bb';
      c.strokeStyle = hover ? '#ffd29666' : '#71e5bb26'; c.lineWidth = 6;
      c.beginPath(); c.roundRect(x - 7, y - 5, 14, 10, 3); c.stroke(); c.fill();
      if (hover) {
        c.font = '11px "Segoe UI", sans-serif';
        const label = `${beatLabel(note.tick, chart.meta)} · ${note.tick} tick · h ${note.height.toFixed(3)}`;
        const lx = clamp(x + 14, LEFT + 8, w - RIGHT - c.measureText(label).width - 16);
        const ly = y > TOP + 34 ? y - 18 : y + 28;
        c.fillStyle = '#0a1019'; c.fillRect(lx - 5, ly - 14, c.measureText(label).width + 10, 20);
        c.fillStyle = '#ffd296'; c.fillText(label, lx, ly);
      }
    }
    if (cursor?.inNotes && !cursor.note) {
      const x = xAt(tickToSeconds(cursor.tick, chart.meta)), y = TOP + cursor.height * usableHeight;
      c.strokeStyle = '#71e5bb66'; c.lineWidth = 1; c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(x, TOP); c.lineTo(x, h - BOTTOM); c.moveTo(LEFT, y); c.lineTo(w - RIGHT, y); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#71e5bb'; c.strokeRect(x - 6, y - 4, 12, 8);
    }
    if (loop) for (const [label, time] of [['A', loop.start], ['B', loop.end]] as const) {
      const x = xAt(time); c.fillStyle = '#83dfb9'; c.fillRect(x, 0, 1, h - BOTTOM); c.fillText(label, x + 4, 43);
    }
    const playX = xAt(position);
    c.strokeStyle = '#f4c179'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(playX, 0); c.lineTo(playX, h - BOTTOM); c.stroke();
    c.fillStyle = '#f4c179'; c.beginPath(); c.moveTo(playX - 5, 0); c.lineTo(playX + 5, 0); c.lineTo(playX, 7); c.fill();
    c.restore();
    c.strokeStyle = '#283545'; c.lineWidth = 1;
    for (const y of [31, 94, 123, h - BOTTOM]) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); }
    c.fillStyle = '#6c8094'; c.font = '10px "Segoe UI", sans-serif';
    c.fillText('高  0', 12, TOP + 5); c.fillText('0.5', 19, TOP + usableHeight / 2 + 4); c.fillText('低  1', 12, h - BOTTOM);
    c.fillStyle = '#71869a'; c.fillText(cursor?.inNotes ? `${formatTime(tickToSeconds(cursor.tick, chart.meta))}   /   ${cursor.tick} tick   /   高度 ${cursor.height.toFixed(3)}` : 'Q 放置音符    ·    悬停 + 右键 / Delete 删除    ·    点击标尺定位', LEFT, h - 11);
  }, [props, mouse, size, points]);

  return <div className="editor-wrap" ref={wrapper}>
    <canvas ref={canvas} data-testid="chart-canvas" tabIndex={0} aria-label="时间与高度制谱画布，Q 放置，右键删除" style={{ width: size.width, height: size.height }}
      onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top }); }}
      onPointerLeave={() => setMouse(null)}
      onPointerDown={e => {
        e.currentTarget.focus();
        const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top;
        setMouse({ x, y });
        if (e.button === 0 && y < TOP && x >= LEFT && x <= size.width - RIGHT) props.onSeek(start + (x - LEFT) / scale);
      }}
      onContextMenu={e => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect(); const p = pointAt(e.clientX - rect.left, e.clientY - rect.top);
        if (p.inNotes && p.note) props.onDelete(p.note.id);
      }} />
  </div>;
}
