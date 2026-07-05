/** Audio-reactive engine. Taps the preview video's audio live (AnalyserNode)
 * and analyzes decoded PCM offline for bakes — BOTH through the same pure DSP
 * (audioDsp.ts): MilkDrop-style per-band auto-gain (no user gain sliders) and
 * spectral-flux onset detection with a musical release envelope. The only user
 * control is one Intensity multiplier. Verified by scripts/test_audio_dsp.ts.
 */
import type { AudioReactiveConfig } from "../types";
import {
  analyzePcm, applyIntensity, AudioAnalyzer, featuresPerVideoFrame,
  ZERO_FEATURES, type AudioFeatures,
} from "./audioDsp";

export type AudioFrame = AudioFeatures;
export const ZERO_AUDIO: AudioFrame = { ...ZERO_FEATURES };

export const DEFAULT_AUDIO_CONFIG: AudioReactiveConfig = {
  enabled: false,
  sensitivity: 1.0, // the single "Intensity" control
  // legacy fields kept for saved-project compatibility; the AGC engine ignores them
  smoothing: 0.65,
  bassGain: 1.0,
  midGain: 1.0,
  trebleGain: 1.0,
  beatAmount: 1.0,
};

const FFT_SIZE = 2048;

/** Live analyser tapped off the preview <video>. One graph per AudioContext;
 * a MediaElementAudioSourceNode can only be created once per element, so we
 * cache nodes keyed by the element. */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private db: Float32Array<ArrayBuffer> | null = null;
  private mags: Float32Array | null = null;
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private current: HTMLMediaElement | null = null;
  private analyzer = new AudioAnalyzer();
  private lastResult: AudioFrame = { ...ZERO_AUDIO };
  private lastSampleTime = 0;

  attach(video: HTMLMediaElement) {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = FFT_SIZE;
        this.analyser.smoothingTimeConstant = 0; // the DSP does its own smoothing
        this.db = new Float32Array(new ArrayBuffer(this.analyser.frequencyBinCount * 4));
        this.mags = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.connect(this.ctx.destination);
      }
      this.current = video;
      let src = this.sources.get(video);
      if (!src) {
        src = this.ctx.createMediaElementSource(video);
        this.sources.set(video, src);
      }
      // routing through the analyser preserves playback audio; video.muted
      // does not affect the tap, so analysis works even when muted.
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
      paused: this.current?.paused ?? null,
      muted: this.current?.muted ?? null,
      lastResult: this.lastResult,
    };
  }

  private reset() {
    this.analyzer = new AudioAnalyzer();
    this.lastResult = { ...ZERO_AUDIO };
  }

  /** Read the analyser into normalized features. Coalesced so multiple callers
   * per animation frame (render loop + meters) don't double-advance state. */
  sample(cfg: AudioReactiveConfig): AudioFrame {
    const a = this.analyser;
    const ctx = this.ctx;
    if (!a || !this.db || !this.mags || !ctx) return { ...ZERO_AUDIO };
    const now = performance.now();
    const dt = Math.min((now - this.lastSampleTime) / 1000, 0.1);
    if (dt < 0.008) return this.lastResult;
    this.lastSampleTime = now;
    a.getFloatFrequencyData(this.db);
    for (let i = 0; i < this.db.length; i++) {
      const d = this.db[i];
      this.mags[i] = d <= -180 || !isFinite(d) ? 0 : Math.pow(10, d / 20);
    }
    const feats = this.analyzer.step(this.mags, ctx.sampleRate, FFT_SIZE, dt || 1 / 60);
    this.lastResult = applyIntensity(feats, cfg.sensitivity);
    return this.lastResult;
  }
}

export const audioEngine = new AudioEngine();

/**
 * Decode the asset's audio and build per-video-frame features so baked exports
 * react identically to live preview. All-zero frames if no decodable audio.
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
    const tmp = new Ctor(1, 1, 44100); // throwaway context just to decode
    const audio = await tmp.decodeAudioData(buf);
    if (audio.length === 0) return zeros();

    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < audio.length; i++) mono[i] += ch[i];
    }
    const inv = 1 / audio.numberOfChannels;
    for (let i = 0; i < mono.length; i++) mono[i] *= inv;

    const hops = analyzePcm(mono, audio.sampleRate);
    const frames = featuresPerVideoFrame(hops, audio.sampleRate, fps, frameCount);
    return frames.map((f) => applyIntensity(f, cfg.sensitivity));
  } catch (e) {
    console.warn("offline audio analysis failed (no audio track?)", e);
    return zeros();
  }
}
