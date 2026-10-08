import { clamp, loopPosition } from './core';

/** The only playback clock. RAF reads it; RAF never advances musical time. */
export class AudioTransport {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private anchorTime = 0;
  private anchorOffset = 0;
  private stoppedAt = 0;
  private generation = 0;
  private loop: { start: number; end: number } | null = null;
  private volume = 0.7;
  private getContext() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }
  async decode(file: File) {
    const bytes = await file.arrayBuffer();
    return this.getContext().decodeAudioData(bytes);
  }
  setBuffer(buffer: AudioBuffer | null) {
    this.pause(); this.buffer = buffer; this.stoppedAt = 0; this.loop = null;
  }
  get duration() { return this.buffer?.duration ?? 0; }
  get playing() { return this.source !== null; }
  get position() {
    if (!this.source || !this.context) return this.stoppedAt;
    const raw = this.anchorOffset + (this.context.currentTime - this.anchorTime);
    return clamp(loopPosition(raw, this.loop), 0, this.duration);
  }
  async play() {
    if (!this.buffer || this.source) return;
    const ctx = this.getContext();
    const token = ++this.generation;
    await ctx.resume();
    if (token !== this.generation || !this.buffer) return;
    if (this.loop && (this.stoppedAt < this.loop.start || this.stoppedAt >= this.loop.end)) this.stoppedAt = this.loop.start;
    if (this.stoppedAt >= this.duration) this.stoppedAt = this.loop?.start ?? 0;
    const src = ctx.createBufferSource(); src.buffer = this.buffer;
    if (this.loop) { src.loop = true; src.loopStart = this.loop.start; src.loopEnd = this.loop.end; }
    src.connect(this.gain!);
    this.anchorOffset = this.stoppedAt; this.anchorTime = ctx.currentTime;
    this.source = src;
    src.onended = () => {
      src.disconnect();
      if (this.source === src) { this.source = null; this.stoppedAt = this.duration; }
    };
    src.start(0, this.stoppedAt);
  }
  pause() {
    ++this.generation;
    this.stoppedAt = this.position;
    const previous = this.source; this.source = null;
    if (previous) { previous.onended = null; previous.stop(); previous.disconnect(); }
  }
  seek(seconds: number) { this.pause(); this.stoppedAt = clamp(seconds, 0, this.duration); }
  setLoop(loop: { start: number; end: number } | null) { this.pause(); this.loop = loop; }
  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.01);
  }
}

export interface Waveform { min: Float32Array; max: Float32Array; duration: number }
export async function extractWaveform(buffer: AudioBuffer): Promise<Waveform> {
  const bins = Math.min(20000, buffer.length);
  const min = new Float32Array(bins), max = new Float32Array(bins);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < bins; i++) {
    const a = Math.floor(i * buffer.length / bins), b = Math.floor((i + 1) * buffer.length / bins);
    let lo = 0, hi = 0;
    for (const channel of channels) for (let j = a; j < b; j++) { lo = Math.min(lo, channel[j]); hi = Math.max(hi, channel[j]); }
    min[i] = lo; max[i] = hi;
    if (i % 2000 === 1999) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return { min, max, duration: buffer.duration };
}
