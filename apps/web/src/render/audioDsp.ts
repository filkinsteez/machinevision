/** Pure audio-analysis DSP shared by the live (AnalyserNode) and offline (PCM)
 * paths, so preview and baked export react identically.
 *
 * Design (from MilkDrop/butterchurn + BTrack/librosa practice):
 *  - Per-band auto-gain: divide instantaneous band energy by a ~4s running
 *    average. 1.0 == "this track's own recent average"; no user gain sliders.
 *  - Beats: half-wave-rectified spectral flux against an adaptive threshold
 *    (mean of the last ~1.2s × 1.5), refractory 180ms, driving an instant-attack
 *    exponential-release envelope (~220ms).
 * No imports, no WebAudio types — runnable in Node for tests.
 */

export interface AudioFeatures {
  bass: number;   // 0..1 shader drive (0 = at/below the track's own average)
  mid: number;
  treble: number;
  level: number;
  beat: number;   // 0..1 onset envelope (instant attack, musical release)
}

export const ZERO_FEATURES: AudioFeatures = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };

// MilkDrop band edges (Hz)
const BANDS: [number, number][] = [[20, 320], [320, 2800], [2800, 11025]];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

/** att (≈1.0 at track average) → 0..1 shader drive. 1.3 ("loud") → ~0.5. */
export function shaperFromAtt(att: number): number {
  return clamp((att - 0.9) / 0.8);
}

class Smoother {
  y = 0;
  step(x: number, dt: number, tauAttack: number, tauRelease: number): number {
    const tau = x > this.y ? tauAttack : tauRelease;
    const a = 1 - Math.exp(-dt / tau);
    this.y += a * (x - this.y);
    return this.y;
  }
}

class BandAgc {
  private avg = new Smoother();
  private long = new Smoother();
  private frames = 0;
  att = 0;
  val = 0;

  step(imm: number, dt: number) {
    this.frames++;
    const a = this.avg.step(imm, dt, 0.02, 0.05);
    // faster warm-up for the first ~1.5s so the start of a clip isn't dead
    const tauLong = this.frames < 45 ? 0.35 : 4.0;
    const lg = this.long.step(imm, dt, tauLong, tauLong);
    if (lg < 1e-7) { this.att = 0; this.val = 0; return; }
    this.att = clamp(a / lg, 0, 4);
    this.val = clamp(imm / lg, 0, 4);
  }
}

class OnsetDetector {
  private prev: Float32Array | null = null;
  private history: number[] = [];
  private runMax = 1e-6;
  private sinceOnset = 1e9;
  private env = 0;

  /** returns the 0..1 beat envelope for this frame */
  step(mags: Float32Array, sampleRate: number, fftSize: number, dt: number): number {
    const binHz = sampleRate / fftSize;
    let flux = 0;
    if (this.prev && this.prev.length === mags.length) {
      for (let k = 1; k < mags.length; k++) {
        const d = mags[k] - this.prev[k];
        if (d > 0) flux += d * (k * binHz < 250 ? 2 : 1); // bass-weighted
      }
    }
    this.prev = this.prev && this.prev.length === mags.length ? this.prev : new Float32Array(mags.length);
    this.prev.set(mags);

    // adaptive threshold over ~1.2s of flux — median, so the onset spikes
    // themselves can't inflate the threshold (the classic mean-threshold bug)
    const win = Math.max(Math.round(1.2 / dt), 8);
    this.history.push(flux);
    if (this.history.length > win) this.history.shift();
    const sorted = [...this.history].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const thr = 1e-6 + 2.2 * median;

    this.runMax = Math.max(this.runMax * Math.exp(-dt / 5.0), flux, 1e-6);
    this.sinceOnset += dt;

    if (flux > thr && this.history.length > 4) {
      const strength = clamp((flux - thr) / (0.5 * this.runMax));
      if (this.sinceOnset > 0.18 && strength > 0.05) {
        this.env = Math.max(this.env, strength); // new onset (leading edge)
        this.sinceOnset = 0;
      } else if (this.sinceOnset < 0.06) {
        // the flux peak lands a hop or two after the leading edge — let the
        // envelope absorb it without counting a second onset
        this.env = Math.max(this.env, strength);
      }
    }
    this.env *= Math.exp(-dt / 0.22); // musical release
    return clamp(this.env);
  }
}

/** Stateful per-track analyzer. Feed linear magnitude spectra frame by frame. */
export class AudioAnalyzer {
  private bands = [new BandAgc(), new BandAgc(), new BandAgc()];
  private total = new BandAgc();
  private onset = new OnsetDetector();

  step(mags: Float32Array, sampleRate: number, fftSize: number, dt: number): AudioFeatures {
    const binHz = sampleRate / fftSize;
    const sums = [0, 0, 0];
    let totalSum = 0;
    for (let k = 1; k < mags.length; k++) {
      const hz = k * binHz;
      const m = mags[k];
      totalSum += m;
      for (let b = 0; b < 3; b++) {
        if (hz >= BANDS[b][0] && hz < BANDS[b][1]) { sums[b] += m; break; }
      }
    }
    this.bands.forEach((agc, i) => agc.step(sums[i], dt));
    this.total.step(totalSum, dt);
    const beat = this.onset.step(mags, sampleRate, fftSize, dt);
    return {
      bass: shaperFromAtt(this.bands[0].att),
      mid: shaperFromAtt(this.bands[1].att),
      treble: shaperFromAtt(this.bands[2].att),
      level: shaperFromAtt(this.total.att),
      beat,
    };
  }
}

/** Master intensity applied uniformly (the panel's single slider). */
export function applyIntensity(f: AudioFeatures, intensity: number): AudioFeatures {
  const s = clamp(intensity, 0, 3);
  return {
    bass: clamp(f.bass * s), mid: clamp(f.mid * s), treble: clamp(f.treble * s),
    level: clamp(f.level * s), beat: clamp(f.beat * s),
  };
}

// ---------------------------------------------------------------- offline STFT

/** In-place iterative radix-2 complex FFT (re/im length n, n = power of 2). */
export function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
}

export const FFT_SIZE = 2048;
export const HOP = 512;

/** Analyze a mono PCM buffer into per-hop features (dt = HOP/sampleRate). */
export function analyzePcm(mono: Float32Array, sampleRate: number): AudioFeatures[] {
  const analyzer = new AudioAnalyzer();
  const dt = HOP / sampleRate;
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))); // Hann
  }
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mags = new Float32Array(FFT_SIZE / 2);
  const out: AudioFeatures[] = [];
  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = mono[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]) / FFT_SIZE;
    out.push(analyzer.step(mags, sampleRate, FFT_SIZE, dt));
  }
  return out;
}

/** Resample per-hop features onto video frames: mean for bands, max for beat. */
export function featuresPerVideoFrame(
  hops: AudioFeatures[], sampleRate: number, fps: number, frameCount: number,
): AudioFeatures[] {
  const hopsPerSec = sampleRate / HOP;
  const frames: AudioFeatures[] = [];
  for (let f = 0; f < frameCount; f++) {
    const h0 = Math.floor((f / fps) * hopsPerSec);
    const h1 = Math.max(Math.floor(((f + 1) / fps) * hopsPerSec), h0 + 1);
    let n = 0;
    const acc = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };
    for (let h = h0; h < h1 && h < hops.length; h++) {
      acc.bass += hops[h].bass; acc.mid += hops[h].mid;
      acc.treble += hops[h].treble; acc.level += hops[h].level;
      acc.beat = Math.max(acc.beat, hops[h].beat);
      n++;
    }
    frames.push(n === 0 ? { ...ZERO_FEATURES } : {
      bass: acc.bass / n, mid: acc.mid / n, treble: acc.treble / n,
      level: acc.level / n, beat: acc.beat,
    });
  }
  return frames;
}
