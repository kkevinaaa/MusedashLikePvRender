import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chart, MusicReference } from './core';
import { beatLabel, chartWarnings, clamp, DIVISIONS, formatTime, freshChart, normalizeNotes, parseChart, SCROLL_STEPS, secondsToTick, serializeChart, tickToSeconds } from './core';
import { AudioTransport, extractWaveform } from './audio';
import type { Waveform } from './audio';
import Editor from './Editor';
import type { Cursor } from './Editor';

function NumberField({ label, value, min, max, step = 1, unit, onCommit }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  const skipBlur = useRef(false);
  useEffect(() => { setDraft(String(Number(value.toFixed(6)))); setInvalid(false); }, [value]);
  const submit = () => {
    const num = Number(draft);
    if (!draft.trim() || !Number.isFinite(num) || num < min || num > max || (step === 1 && !Number.isInteger(num))) {
      setInvalid(true); return;
    }
    setInvalid(false); onCommit(num);
  };
  return <label className={`field number-field ${invalid ? 'invalid' : ''}`}>
    <span>{label}</span><div className="input-unit"><input type="number" aria-label={label} value={draft} min={min} max={max} step={step}
      onChange={e => { setDraft(e.target.value); setInvalid(false); }} onBlur={() => { if (skipBlur.current) skipBlur.current = false; else submit(); }}
      onKeyDown={e => { if (e.key === 'Enter') { skipBlur.current = true; submit(); e.currentTarget.blur(); } if (e.key === 'Escape') { skipBlur.current = true; setDraft(String(value)); setInvalid(false); e.currentTarget.blur(); } }} />{unit && <small>{unit}</small>}</div>
    {invalid && <small className="field-error">请输入 {min}～{max}{step === 1 ? ' 的整数' : ''}</small>}
  </label>;
}

const shortcuts = [
  ['Q', '在鼠标位置放置音符'], ['Delete', '删除框选音符；无选区时删除悬停音符'], ['Ctrl + 拖动', '框选音符'], ['右键 / Esc', '取消框选'], ['Ctrl + 滚轮', '以鼠标位置缩放时间轴'], ['Space', '播放 / 暂停'], ['滚轮', '前后定位编辑时刻'], ['O / P', '减小 / 增大滚轮时间步长'],
  ['V', '联动开关高度辅助线与吸附'], ['T', '开关时间吸附'], ['Ctrl + S', '下载谱面 JSON'], ['Esc', '关闭弹窗 / 退出控件'],
];
interface Dialog { title: string; text: string; confirm: string; action: () => void; offerSave?: boolean }

export default function App() {
  const [chart, setChart] = useState<Chart>(freshChart);
  const [saved, setSaved] = useState(() => serializeChart(freshChart()));
  const serialized = useMemo(() => serializeChart(chart), [chart]);
  const dirty = serialized !== saved;
  const [audio] = useState(() => new AudioTransport());
  const [wave, setWave] = useState<Waveform | null>(null);
  const [loadedMusic, setLoadedMusic] = useState<MusicReference | null>(null);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [start, setStart] = useState(0);
  const [scale, setScale] = useState(100);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionReset, setSelectionReset] = useState(0);
  const clearSelection = () => { setSelected(new Set()); setSelectionReset(v => v + 1); };
  const [visibleWidth, setVisibleWidth] = useState(900);
  const [divisionIndex, setDivisionIndex] = useState(2);
  const [heightLines, setHeightLines] = useState(7);
  const [heightSnap, setHeightSnap] = useState(true);
  const [timeSnap, setTimeSnap] = useState(true);
  const [scrollStepIndex, setScrollStepIndex] = useState(4);
  const [follow, setFollow] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const [hitEnabled, setHitEnabled] = useState(true);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(4);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [notice, setNotice] = useState({ type: 'info', text: '先导入音乐，或打开已有谱面。所有文件在本机处理。' });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [help, setHelp] = useState(false);
  const cursor = useRef<Cursor | null>(null);
  const audioInput = useRef<HTMLInputElement>(null), chartInput = useRef<HTMLInputElement>(null);
  const offsetDrag = useRef<{ x: number; initial: number } | null>(null);
  const offsetControl = useRef<HTMLButtonElement>(null);
  const loadingToken = useRef(0);
  const serializedRef = useRef(serialized); serializedRef.current = serialized;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;

  const division = DIVISIONS[divisionIndex];
  const minStart = Math.min(0, chart.meta.offsetSeconds);
  const lastNoteTime = chart.notes.length ? tickToSeconds(chart.notes[chart.notes.length - 1].tick, chart.meta) : 0;
  const timelineEnd = Math.max(30, loadedMusic?.duration ?? chart.meta.music?.duration ?? 0, lastNoteTime + 4, chart.meta.offsetSeconds + 8);
  const viewDuration = visibleWidth / scale;
  const maxStart = Math.max(minStart, timelineEnd - viewDuration);
  const loopValid = !!loadedMusic && loopEnd > loopStart && loopStart >= 0 && loopEnd <= loadedMusic.duration;
  const warnings = useMemo(() => chartWarnings(chart, loadedMusic?.duration ?? chart.meta.music?.duration), [chart, loadedMusic]);

  const tell = (text: string, type = 'info') => setNotice({ text, type });
  const pause = () => { audio.pause(); if (audio.duration) setPosition(audio.position); setPlaying(false); };
  const updateMeta = (patch: Partial<Chart['meta']>) => { pause(); setChart(old => ({ ...old, meta: { ...old.meta, ...patch } })); };
  const changeOffset = (milliseconds: number) => updateMeta({ offsetSeconds: clamp(milliseconds, -86400000, 86400000) / 1000 });
  const navigate = (seconds: number) => {
    pause();
    const time = clamp(seconds, 0, loadedMusic?.duration ?? timelineEnd);
    if (loadedMusic) audio.seek(time);
    setPosition(time);
    if (time < start || time > start + viewDuration * 0.92) setStart(clamp(time - viewDuration * 0.2, minStart, maxStart));
  };
  const zoomWheel = (direction: number, x: number) => {
    const next = clamp(Math.round(scale * (direction < 0 ? 1.2 : 1 / 1.2) / 5) * 5, 20, 400);
    const anchor = start + x / scale;
    setStart(clamp(anchor - x / next, minStart, Math.max(minStart, timelineEnd - visibleWidth / next)));
    setScale(next);
  };
  const scroll = (direction: number) => navigate(position + direction * SCROLL_STEPS[scrollStepIndex] * 60 / chart.meta.bpm);
  const togglePlayback = async () => {
    if (busy) return;
    if (!loadedMusic) { tell('请先关联本地音乐，才能试听。', 'warning'); return; }
    if (audio.playing) { pause(); return; }
    clearSelection();
    audio.setHitTimes(chart.notes.map(n => tickToSeconds(n.tick, chart.meta)));
    try { await audio.play(); setPlaying(audio.playing); } catch (error) { tell(`无法播放音乐：${error instanceof Error ? error.message : String(error)}`, 'error'); }
  };
  const download = () => {
    if (document.querySelector('.field.invalid')) { tell('请先修正标红的数值，再导出谱面。', 'warning'); return false; }
    const blob = new Blob([serializedRef.current], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${chart.meta.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'chart'}.chart.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    setSaved(serializedRef.current); tell('谱面 JSON 已发起下载，请保留下载文件；音乐需要单独保存。', 'success');
    return true;
  };
  const resetTransport = () => {
    clearSelection();
    audio.setBuffer(null); setLoadedMusic(null); setWave(null); setPosition(0); setPlaying(false);
    setLoopEnabled(false); setLoopStart(0); setLoopEnd(4); setStart(0);
  };
  const guardReplacement = (title: string, action: () => void) => {
    if (!dirtyRef.current) { action(); return; }
    pause(); setDialog({ title, text: '当前谱面有尚未导出的修改。继续会丢弃这些修改，音乐原文件不会改变。', confirm: '放弃修改并继续', action, offerSave: true });
  };
  const newProject = () => guardReplacement('新建谱面', () => {
    ++loadingToken.current; resetTransport(); const next = freshChart(); setChart(next); setSaved(serializeChart(next)); tell('新谱面已建立。请导入音乐。');
  });
  const importChart = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('谱面文件超过 20MB，未导入');
      const next = parseChart(await file.text());
      guardReplacement('打开另一份谱面', () => {
        ++loadingToken.current;
        const reuse = loadedMusic && next.meta.music && loadedMusic.name === next.meta.music.name && Math.abs(loadedMusic.duration - next.meta.music.duration) < 0.05 && loadedMusic.size === next.meta.music.size;
        if (!reuse) resetTransport(); else { audio.seek(0); audio.setLoop(null); setPosition(0); setPlaying(false); setLoopEnabled(false); setLoopStart(0); setLoopEnd(Math.min(4, loadedMusic.duration)); }
        clearSelection();
        setStart(Math.min(0, next.meta.offsetSeconds)); setChart(next); setSaved(serializeChart(next));
        tell(reuse ? '谱面已载入，继续使用当前音乐。' : '谱面已载入。请关联音乐文件以恢复波形与试听。', 'success');
      });
    } catch (error) { tell(`${error instanceof Error ? error.message : String(error)}。当前谱面未改变。`, 'error'); }
  };
  const importAudio = async (file: File) => {
    const token = ++loadingToken.current;
    pause(); setBusy(true); tell('正在解码音乐并生成波形…');
    try {
      if (!file.size) throw new Error('音乐文件为空');
      if (file.size > 512 * 1024 * 1024) throw new Error('初版音乐文件大小上限为 512MB');
      const buffer = await audio.decode(file);
      const waveform = await extractWaveform(buffer);
      if (token !== loadingToken.current) return;
      const ref: MusicReference = { name: file.name, duration: buffer.duration, size: file.size };
      const apply = () => {
        audio.setBuffer(buffer); setWave(waveform); setLoadedMusic(ref); setPosition(0); setPlaying(false); setStart(Math.min(0, chart.meta.offsetSeconds));
        setLoopEnabled(false); setLoopStart(0); setLoopEnd(Math.min(4, buffer.duration));
        setChart(old => ({ ...old, meta: { ...old.meta, music: ref, title: old.meta.title === '未命名谱面' ? file.name.replace(/\.[^.]+$/, '').slice(0, 200) : old.meta.title } }));
        tell(`音乐已关联 · ${formatTime(buffer.duration)} · ${buffer.sampleRate} Hz`, 'success');
      };
      const expected = chart.meta.music;
      const reasons: string[] = [];
      if (expected && expected.name !== ref.name) reasons.push(`文件名不同（期望：${expected.name}）`);
      if (expected && Math.abs(expected.duration - ref.duration) > 0.05) reasons.push(`时长不同（期望 ${formatTime(expected.duration)}，实际 ${formatTime(ref.duration)}）`);
      if (expected && expected.size !== ref.size) reasons.push('文件大小不同');
      if (reasons.length) setDialog({ title: '音乐与谱面记录不一致', text: reasons.join('；') + '。仍要关联此音乐吗？音符不会改变。', confirm: '关联这份音乐', action: apply });
      else apply();
    } catch (error) {
      if (token === loadingToken.current) tell(`音乐加载失败：${error instanceof Error ? error.message : String(error)}。原音乐与谱面已保留。可尝试 WAV、MP3 或 FLAC。`, 'error');
    } finally { if (token === loadingToken.current) setBusy(false); }
  };

  const removeNote = (id: string) => {
    if (playing || busy) { tell('请先暂停，再删除音符。', 'warning'); return; }
    setChart(old => ({ ...old, notes: old.notes.filter(n => n.id !== id) }));
  };
  const placeNote = () => {
    if (!cursor.current?.inNotes) return;
    if (playing || busy) { tell('请先暂停，再放置音符。', 'warning'); return; }
    const { tick, height } = cursor.current;
    if (chart.notes.some(n => n.tick === tick && Math.abs(n.height - height) < 0.00001)) { tell('这个位置已有音符。', 'warning'); return; }
    setChart(old => ({ ...old, notes: normalizeNotes([...old.notes, { id: crypto.randomUUID(), tick, height }]) }));
  };
  const setLoop = (enabled: boolean, a = loopStart, b = loopEnd) => {
    pause(); setLoopStart(a); setLoopEnd(b);
    const valid = !!loadedMusic && a >= 0 && b <= loadedMusic.duration && b > a;
    if (enabled && !valid) { tell('循环范围必须满足 0 ≤ A < B ≤ 音乐时长。', 'warning'); setLoopEnabled(false); audio.setLoop(null); return; }
    setLoopEnabled(enabled); audio.setLoop(enabled ? { start: a, end: b } : null);
  };

  useEffect(() => {
    let frame = 0, last = 0;
    const tick = (now: number) => {
      if (now - last > 30) {
        if (audio.playing) setPosition(audio.position);
        setPlaying(audio.playing);
        if (!audio.playing && audio.duration && audio.position === audio.duration) setPosition(audio.duration);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); audio.pause(); };
  }, [audio]);
  useEffect(() => {
    if (playing && follow && (position < start || position > start + viewDuration * 0.82)) setStart(clamp(position - viewDuration * 0.2, minStart, maxStart));
  }, [position, playing, follow, viewDuration, minStart, maxStart, start]);
  useEffect(() => { setStart(old => clamp(old, minStart, maxStart)); }, [minStart, maxStart]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  useEffect(() => {
    if (!help && !dialog) return;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.modal button:not(:disabled)'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [help, dialog]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target as HTMLElement;
      const editing = !!target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') { clearSelection(); setHelp(false); setDialog(null); target.blur(); return; }
      if (dialog || help) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!busy && !event.repeat) {
          // Commit any active draft before serializing the latest React state.
          if (editing) target.blur();
          requestAnimationFrame(() => download());
        }
        return;
      }
      if (editing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === ' ' && !target.closest('button')) { event.preventDefault(); void togglePlayback(); }
      if (busy) return;
      if (key === 'q') { event.preventDefault(); placeNote(); }
      if (key === 'delete') {
        if (selected.size) {
          event.preventDefault();
          if (!playing) { setChart(old => ({ ...old, notes: old.notes.filter(n => !selected.has(n.id)) })); clearSelection(); }
        } else if (cursor.current?.inNotes && cursor.current.note) { event.preventDefault(); removeNote(cursor.current.note.id); }
      }
      if (key === 'v') setHeightSnap(v => !v);
      if (key === 't') setTimeSnap(v => !v);
      if (key === 'o') setScrollStepIndex(v => Math.max(0, v - 1));
      if (key === 'p') setScrollStepIndex(v => Math.min(SCROLL_STEPS.length - 1, v + 1));
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    const button = offsetControl.current!;
    const wheel = (event: WheelEvent) => {
      if (busy || event.ctrlKey) return;
      event.preventDefault();
      changeOffset(chart.meta.offsetSeconds * 1000 - Math.sign(event.deltaY) * (event.shiftKey ? 10 : 1));
    };
    button.addEventListener('wheel', wheel, { passive: false });
    return () => button.removeEventListener('wheel', wheel);
  }, [chart.meta.offsetSeconds, busy]);

  return <main>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">∿</span><div><strong>CONTOUR</strong></div><span className="version">0.1</span></div>
      <div className="project-actions"><span className={`save-status ${dirty ? 'dirty' : ''}`} data-testid="save-status">{dirty ? '● 有未导出修改' : '○ 无未导出修改'}</span>
        <button onClick={newProject} disabled={busy}>新建</button><button onClick={() => chartInput.current?.click()} disabled={busy}>打开谱面</button><button className="primary" onClick={download} disabled={busy}>导出 JSON <kbd>Ctrl S</kbd></button>
        <button className="help-button" onClick={() => setHelp(true)} title="快捷键与使用说明" aria-label="快捷键与使用说明">?</button>
      </div>
    </header>

    <input ref={audioInput} type="file" accept="audio/*,.flac,.wav,.mp3,.ogg,.m4a" hidden aria-label="导入音乐文件" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importAudio(file); }} />
    <input ref={chartInput} type="file" accept=".json,application/json" hidden aria-label="导入谱面文件" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importChart(file); }} />

    <section className="project-panel" aria-label="项目设置">
      <div className="music-block"><button className={`music-button ${loadedMusic ? 'loaded' : ''}`} onClick={() => audioInput.current?.click()} disabled={busy}><span>{busy ? '◌' : loadedMusic ? '♫' : '+'}</span></button>
        <div><span className="eyebrow">LOCAL AUDIO</span><strong title={loadedMusic?.name ?? chart.meta.music?.name}>{busy ? '解码与分析波形中…' : loadedMusic?.name ?? chart.meta.music?.name ?? '导入本地音乐'}</strong>
          <button className="text-button" onClick={() => audioInput.current?.click()} disabled={busy}>{loadedMusic ? `${formatTime(loadedMusic.duration)} · 更换音乐` : chart.meta.music ? '待关联 · 点击选择音乐' : '选择 FLAC / WAV / MP3…'}</button></div>
      </div>
      <label className="field title-field"><span>曲名</span><input aria-label="曲名" disabled={busy} value={chart.meta.title} maxLength={200} onChange={e => updateMeta({ title: e.target.value })} onBlur={() => { if (!chart.meta.title.trim()) updateMeta({ title: '未命名谱面' }); }} /></label>
      <fieldset disabled={busy} className="timing-fields">
        <NumberField label="BPM" value={chart.meta.bpm} min={1} max={1000} step={0.01} onCommit={bpm => updateMeta({ bpm })} />
        <div className="signature"><NumberField label="拍号" value={chart.meta.timeSignature.numerator} min={1} max={32} onCommit={numerator => updateMeta({ timeSignature: { ...chart.meta.timeSignature, numerator } })} />
          <span>/</span><label className="field"><span>分母</span><select aria-label="拍号分母" value={chart.meta.timeSignature.denominator} onChange={e => updateMeta({ timeSignature: { ...chart.meta.timeSignature, denominator: Number(e.target.value) } })}>{[1, 2, 4, 8, 16].map(v => <option key={v}>{v}</option>)}</select></label></div>
        <NumberField label="Offset" value={chart.meta.offsetSeconds * 1000} min={-86400000} max={86400000} step={0.1} unit="ms" onCommit={changeOffset} />
        <button ref={offsetControl} className="offset-drag" title="左右拖动或滚轮调整，1px / 1格 = 1ms，Shift = 10ms；调整时暂停播放" aria-label="Offset 滚轮或拖动微调"
          onPointerDown={e => { pause(); offsetDrag.current = { x: e.clientX, initial: chart.meta.offsetSeconds * 1000 }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (offsetDrag.current) changeOffset(offsetDrag.current.initial + Math.round(e.clientX - offsetDrag.current.x) * (e.shiftKey ? 10 : 1)); }}
          onPointerUp={() => { offsetDrag.current = null; }} onPointerCancel={() => { offsetDrag.current = null; }} onLostPointerCapture={() => { offsetDrag.current = null; }}>↔<small>微调</small></button>
      </fieldset>
    </section>

    <div className="workspace-heading"><div><span className="section-number">01</span><strong>谱面编辑</strong><span className="muted">{chart.notes.length} 音符 · 480 PPQ</span><span className="muted" data-testid="selection-count">{selected.size ? `已选 ${selected.size} 个 · Delete 删除 · Esc / 右键取消` : ''}</span></div><div className="heading-controls"><label className="check"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />跟随播放头</label><span className="muted">BPM 按四分音符计</span></div></div>
    <section className="editor-panel" aria-label="制谱区域">
      <Editor selected={selected} onSelect={setSelected} selectionReset={selectionReset} editable={!playing && !busy} onZoom={zoomWheel} chart={chart} wave={wave} position={position} start={start} pixelsPerSecond={scale} division={division} heightLines={heightLines} heightSnap={heightSnap} timeSnap={timeSnap}
        loop={loopEnabled && loopValid ? { start: loopStart, end: loopEnd } : null} onSeek={navigate} onWheel={scroll} onCursor={c => { cursor.current = c; }} onDelete={removeNote} onWidth={setVisibleWidth} />
      <div className="scrollbar-row"><span>{formatTime(start)}</span><input type="range" aria-label="时间视图滚动" min={minStart} max={maxStart} step={0.001} value={start} onChange={e => setStart(Number(e.target.value))} /><span>{formatTime(start + viewDuration)}</span></div>
      <div className="editor-tools">
        <label className="range-control"><span>每拍细分 <b>{division}</b> 等分</span><input type="range" aria-label="每拍细分" min="0" max="4" step="1" value={divisionIndex} onChange={e => setDivisionIndex(Number(e.target.value))} /><div className="range-labels">{DIVISIONS.map(v => <span key={v} className={division === v ? 'active' : ''}>{v}</span>)}</div></label>
        <button className={`toggle ${timeSnap ? 'enabled' : ''}`} aria-pressed={timeSnap} onClick={() => setTimeSnap(v => !v)}>时间吸附 <kbd>T</kbd><span>{timeSnap ? '开' : '关'}</span></button>
        <button className={`toggle ${heightSnap ? 'enabled' : ''}`} aria-pressed={heightSnap} onClick={() => setHeightSnap(v => !v)}>高度辅助线与吸附 <kbd>V</kbd><span>{heightSnap ? '开' : '关'}</span></button>
        <label className="inline-control">辅助线<select aria-label="高度辅助线数量" value={heightLines} onChange={e => setHeightLines(Number(e.target.value))}>{[2, 3, 4, 5, 6, 7, 8, 9, 12, 16].map(v => <option key={v} value={v}>{v} 条</option>)}</select></label>
        <label className="range-control zoom"><span>时间缩放 <b>{scale}</b> px/s</span><input type="range" aria-label="时间缩放" min="20" max="400" step="5" value={scale} onChange={e => {
          const next = Number(e.target.value); const anchor = position >= start && position <= start + viewDuration ? position : start + viewDuration / 2;
          setStart(clamp(anchor - (anchor - start) * scale / next, minStart, Math.max(minStart, timelineEnd - visibleWidth / next))); setScale(next);
        }} /></label>
      </div>
    </section>

    <section className="transport" aria-label="试听控制">
      <div className="play-controls"><button title="回到音乐开头" aria-label="回到音乐开头" onClick={() => navigate(0)}>↤</button><button className="play-button" onClick={() => void togglePlayback()} disabled={!loadedMusic || busy} aria-label={playing ? '暂停' : '播放'}>{playing ? 'Ⅱ' : '▶'}</button><div className="time-display"><strong data-testid="current-time">{formatTime(position)}</strong><span>拍号 {beatLabel(secondsToTick(position, chart.meta), chart.meta)} <kbd>Space</kbd></span></div></div>
      <div className="loop-controls"><button className={`toggle ${loopEnabled ? 'enabled' : ''}`} aria-pressed={loopEnabled} onClick={() => setLoop(!loopEnabled)} disabled={!loadedMusic}>↻ 循环</button>
        <NumberField label="循环 A" value={loopStart} min={0} max={loadedMusic?.duration ?? timelineEnd} step={0.001} unit="s" onCommit={a => setLoop(loopEnabled, a, loopEnd)} />
        <button className="loop-set" title="用当前位置设置 A" aria-label="用当前位置设置循环 A" onClick={() => setLoop(loopEnabled, Number(position.toFixed(3)), loopEnd)}>设 A</button>
        <NumberField label="循环 B" value={loopEnd} min={0} max={loadedMusic?.duration ?? timelineEnd} step={0.001} unit="s" onCommit={b => setLoop(loopEnabled, loopStart, b)} />
        <button className="loop-set" title="用当前位置设置 B" aria-label="用当前位置设置循环 B" onClick={() => setLoop(loopEnabled, loopStart, Number(position.toFixed(3)))}>设 B</button></div>
      <button className={`toggle ${hitEnabled ? 'enabled' : ''}`} aria-pressed={hitEnabled} onClick={() => { const enabled = !hitEnabled; setHitEnabled(enabled); audio.setHitEnabled(enabled); }}>音符音效 {hitEnabled ? '开' : '关'}</button>
      <label className="volume">音乐<input aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); audio.setVolume(v); }} /></label>
    </section>
    <footer><div className={`notice ${notice.type}`} role="status">{notice.text}</div><span>滚轮步长 {SCROLL_STEPS[scrollStepIndex]} 四分音符 <kbd>O</kbd><kbd>P</kbd></span></footer>
    {warnings.length > 0 && <div className="warnings" role="status">{warnings.map(w => <span key={w}>△ {w}</span>)}</div>}

    {(help || dialog) && <div className="modal-backdrop" onClick={() => { setHelp(false); setDialog(null); }}><section className="modal" role="dialog" aria-modal="true" aria-label={dialog?.title ?? '快捷键与使用说明'} onClick={e => e.stopPropagation()}>
      <button className="modal-close" aria-label="关闭弹窗" onClick={() => { setHelp(false); setDialog(null); }}>×</button>
      {dialog ? <><span className="eyebrow">PROJECT</span><h2>{dialog.title}</h2><p>{dialog.text}</p><div className="modal-actions"><button autoFocus onClick={() => setDialog(null)}>取消</button>{dialog.offerSave && <button onClick={() => { if (download()) { dialog.action(); setDialog(null); } }}>导出后继续</button>}<button className="primary" onClick={() => { dialog.action(); setDialog(null); }}>{dialog.confirm}</button></div></>
        : <><span className="eyebrow">QUICK REFERENCE</span><h2>先听，再放下一个音符。</h2><p>导入音乐 → 设置 BPM 与 offset → 鼠标移到画布按 Q → 试听 → 导出 JSON。</p><div className="shortcut-list">{shortcuts.map(([key, value]) => <div key={key}><kbd>{key}</kbd><span>{value}</span></div>)}</div><p className="help-note">输入框内不触发字母快捷键。修改位置请删除后重新放置。每拍细分按拍号分母划分，BPM 始终以四分音符计。正 offset 表示第一拍晚于音乐开头。标尺逐拍编号，音符音效用于核对命中时间。</p><p className="help-note">JSON 只保存谱面与音乐参考信息，不包含音乐。网页没有自动保存，关闭前请导出；导出发起后请确认下载文件已保留。</p><button className="primary" autoFocus onClick={() => setHelp(false)}>开始制谱</button></>}
    </section></div>}
  </main>;
}
