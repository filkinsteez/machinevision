/** Audio-reactive engine. Taps the preview video's own audio track with an
 * AnalyserNode for live preview, and provides an offline per-frame envelope
 * analysis (decoded PCM -> filtered band envelopes) so baked exports match.
 * Realtime and offline paths share the same normalization (applyGains) so the
 * two look perceptually consistent. */
import type { AudioReactiveConfig } from "../types";

/** Per-frame normalized audio metrics, all in 0..1. */
export interface AudioFrame {
  bass: number;
  mid: number;
  treble: number;
  level: number;
  beat: number;
}

export const ZERO_AUDIO: AudioFrame = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };

export const DEFAULT_AUDIO_CONFIG: AudioReactiveConfig = {
  enabled: false,
  sensitivity: 1.0,
  smoothing: 0.65,
  bassGain: 1.0,
  midGain: 1.0,
  trebleGain: 1.0,
  beatAmount: 1.0,
};

// Band edges in Hz (bass: sub/low, mid: vocal/body, treble: presence/air).
const BASS_HZ: [number, number] = [20, 250];
const MID_HZ: [number, number] = [250, 2000];
const TREBLE_HZ: [number, number] = [2000, 8000];

/** Shared normalization: apply master sensitivity + per-band gains, clamp 0..1. */
export function applyGains(raw: AudioFrame, cfg: AudioReactiveConfig): AudioFrame {
  const s = cfg.sensitivity;
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const shape = (v: number) => Math.pow(clamp(v * 1.8), 0.7);
  return {
    bass: clamp(shape(raw.bass) * cfg.bassGain * s),
    mid: clamp(shape(raw.mid) * cfg.midGain * s),
    treble: clamp(shape(raw.treble) * cfg.trebleGain * s),
    level: clamp(shape(raw.level) * s),
    beat: clamp(shape(raw.beat) * cfg.beatAmount * s),
  };
}

function bandAverage(freq: Uint8Array<ArrayBuffer>, sampleRate: number, fftSize: number, range: [number, number]): number {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(0, Math.floor(range[0] / binHz));
  const hi = Math.min(freq.length - 1, Math.ceil(range[1] / binHz));
  let sum = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) { sum += freq[i]; n++; }
  return n > 0 ? sum / n / 255 : 0;
}

/** Live analyser tapped off the preview <video>. One graph per AudioContext;
 * a MediaElementAudioSourceNode can only be created once per element, so we
 * cache nodes keyed by the element. */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private current: HTMLMediaElement | null = null;
  private smoothed: AudioFrame = { ...ZERO_AUDIO };
  private levelAvg = 0;
  private beatEnv = 0;
  private lastResult: AudioFrame = { ...ZERO_AUDIO };
  private lastSampleTime = 0;

  /** Wire a video element into the analyser graph (idempotent per element). */
  attach(video: HTMLMediaElement) {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
        this.analyser.connect(this.ctx.destination);
      }
      this.current = video;
      let src = this.sources.get(video);
      if (!src) {
        src = this.ctx.createMediaElementSource(video);
        this.sources.set(video, src);
      }
      // analyser.connect(destination) already in place; routing source through
      // the analyser preserves playback audio. UI mute (video.muted) does not
      // affect the analyser tap, so analysis works even when muted.
      src.connect(this.analyser!);
      this.reset();
    } catch (e) {
      console.warn("audio attach failed", e);
    }
  }

  /** AudioContext starts suspended until a user gesture; call on play. */
  resume() {
    this.ctx?.resume().catch(() => undefined);
  }

  debug() {
    return {
      contextState: this.ctx?.state ?? "missing",
      hasAnalyser: Boolean(this.analyser),
      currentSrc: this.current?.currentSrc || this.current?.src || null,
      currentTime: this.current?.currentTime ?? null,
      paused: this.current?.paused ?? null,
      muted: this.current?.muted ?? null,
      lastResult: this.lastResult,
    };
  }

  private reset() {
    this.smoothed = { ...ZERO_AUDIO };
    this.levelAvg = 0;
    this.beatEnv = 0;
  }

  /** Read the current analyser state into a normalized AudioFrame. Coalesced to
   * one real advance per animation frame so multiple callers (render loop +
   * meter UI) don't double-advance the smoothing/beat state. */
  sample(cfg: AudioReactiveConfig): AudioFrame {
    const a = this.analyser;
    const f = this.freq;
    const ctx = this.ctx;
    if (!a || !f || !ctx) return { ...ZERO_AUDIO };
    a.smoothingTimeConstant = Math.min(Math.max(cfg.smoothing, 0), 0.95);
    const now = performance.now();
    if (now - this.lastSampleTime < 8) return this.lastResult;
    this.lastSampleTime = now;
    a.getByteFrequencyData(f);
    const sr = ctx.sampleRate;
    const n = a.fftSize;
    const raw: AudioFrame = {
      bass: bandAverage(f, sr, n, BASS_HZ),
      mid: bandAverage(f, sr, n, MID_HZ),
      treble: bandAverage(f, sr, n, TREBLE_HZ),
      level: 0,
      beat: 0,
    };
    raw.level = (raw.bass + raw.mid + raw.treble) / 3;

    // beat: transient envelope from level vs a slow running average
    this.levelAvg = this.levelAvg * 0.92 + raw.level * 0.08;
    const onset = Math.max(0, raw.level - this.levelAvg * 1.35);
    this.beatEnv = Math.max(this.beatEnv * 0.86, onset * 4);
    raw.beat = Math.min(this.beatEnv, 1);

    // extra one-pole smoothing on top of analyser smoothing
    const k = Math.min(Math.max(cfg.smoothing, 0), 0.98);
    const lerp = (prev: number, next: number) => prev * k + next * (1 - k);
    this.smoothed = {
      bass: lerp(this.smoothed.bass, raw.bass),
      mid: lerp(this.smoothed.mid, raw.mid),
      treble: lerp(this.smoothed.treble, raw.treble),
      level: lerp(this.smoothed.level, raw.level),
      beat: Math.max(lerp(this.smoothed.beat, raw.beat), raw.beat),
    };
    this.lastResult = applyGains(this.smoothed, cfg);
    return this.lastResult;
  }
}

export const audioEngine = new AudioEngine();

// ---- Offline analysis (for bake) ----------------------------------------

/** One-pole low-pass coefficient for a cutoff fc at sample rate sr. */
function onePole(fc: number, sr: number): number {
  return 1 - Math.exp((-2 * Math.PI * fc) / sr);
}

/** Robust peak (~98th percentile) used to normalize an envelope to 0..1. */
function robustPeak(env: Float32Array): number {
  const sorted = Float32Array.from(env).sort();
  const idx = Math.floor(sorted.length * 0.98);
  return Math.max(sorted[Math.min(idx, sorted.length - 1)] ?? 0, 1e-6);
}

/**
 * Decode the asset's audio and build a per-frame AudioFrame envelope so baked
 * exports react identically to live preview. Returns all-zero frames if the
 * asset has no decodable audio track.
 */
export async function analyzeAudioOffline(
  proxyUrl: string,
  fps: number,
  frameCount: number,
  cfg: AudioReactiveConfig,
): Promise<AudioFrame[]> {
  const zeros = () => Array.from({ length: frameCount }, () => ({ ...ZERO_AUDIO }));
  try {
    const buf = await fetch(proxyUrl).then((r) => r.arrayBuffer());
    const Ctor = window.OfflineAudioContext
      ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    // a tiny throwaway context just to decode
    const tmp = new Ctor(1, 1, 44100);
    const audio = await tmp.decodeAudioData(buf);
    const sr = audio.sampleRate;
    const len = audio.length;
    if (len === 0) return zeros();

    // downmix to mono
    const mono = new Float32Array(len);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += ch[i];
    }
    const inv = 1 / audio.numberOfChannels;
    for (let i = 0; i < len; i++) mono[i] *= inv;

    // cascaded one-pole filters split the signal into low/band/high.
    const aLow = onePole(BASS_HZ[1], sr);   // < 250 Hz
    const aMid = onePole(MID_HZ[1], sr);    // < 2000 Hz
    const envBass = new Float32Array(len);
    const envMid = new Float32Array(len);
    const envTreble = new Float32Array(len);
    const envLevel = new Float32Array(len);
    const aEnv = onePole(20, sr); // envelope follower smoothing (~20 Hz)
    let lpLow = 0, lpMid = 0;
    let eB = 0, eM = 0, eT = 0, eL = 0;
    for (let i = 0; i < len; i++) {
      const x = mono[i];
      lpLow += aLow * (x - lpLow);          // low band
      lpMid += aMid * (x - lpMid);          // low+mid band
      const low = lpLow;
      const mid = lpMid - lpLow;            // band-pass 250..2000
      const high = x - lpMid;               // high-pass > 2000
      eB += aEnv * (Math.abs(low) - eB);
      eM += aEnv * (Math.abs(mid) - eM);
      eT += aEnv * (Math.abs(high) - eT);
      eL += aEnv * (Math.abs(x) - eL);
      envBass[i] = eB; envMid[i] = eM; envTreble[i] = eT; envLevel[i] = eL;
    }

    const pB = robustPeak(envBass);
    const pM = robustPeak(envMid);
    const pT = robustPeak(envTreble);
    const pL = robustPeak(envLevel);

    const frames: AudioFrame[] = [];
    let levelAvg = 0;
    let beatEnv = 0;
    const smoothing = Math.min(Math.max(cfg.smoothing, 0), 0.98);
    let prev: AudioFrame = { ...ZERO_AUDIO };
    for (let fr = 0; fr < frameCount; fr++) {
      const start = Math.floor((fr / fps) * sr);
      const end = Math.min(Math.floor(((fr + 1) / fps) * sr), len);
      let sB = 0, sM = 0, sT = 0, sL = 0, cnt = 0;
      for (let i = start; i < end; i++) { sB += envBass[i]; sM += envMid[i]; sT += envTreble[i]; sL += envLevel[i]; cnt++; }
      const d = cnt > 0 ? 1 / cnt : 0;
      const raw: AudioFrame = {
        bass: Math.min((sB * d) / pB, 1),
        mid: Math.min((sM * d) / pM, 1),
        treble: Math.min((sT * d) / pT, 1),
        level: Math.min((sL * d) / pL, 1),
        beat: 0,
      };
      levelAvg = levelAvg * 0.92 + raw.level * 0.08;
      const onset = Math.max(0, raw.level - levelAvg * 1.35);
      beatEnv = Math.max(beatEnv * 0.86, onset * 4);
      raw.beat = Math.min(beatEnv, 1);

      const k = smoothing;
      const lerp = (a: number, b: number) => a * k + b * (1 - k);
      const sm: AudioFrame = {
        bass: lerp(prev.bass, raw.bass),
        mid: lerp(prev.mid, raw.mid),
        treble: lerp(prev.treble, raw.treble),
        level: lerp(prev.level, raw.level),
        beat: Math.max(lerp(prev.beat, raw.beat), raw.beat),
      };
      prev = sm;
      frames.push(applyGains(sm, cfg));
    }
    return frames;
  } catch (e) {
    console.warn("offline audio analysis failed (no audio track?)", e);
    return zeros();
  }
}
