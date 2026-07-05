/** Verification for the audio DSP: run with `node scripts/test_audio_dsp.ts`
 * (Node 24 type stripping). Synthetic signals with known ground truth. */
import {
  analyzePcm, applyIntensity, AudioAnalyzer, featuresPerVideoFrame, fft,
  FFT_SIZE, HOP,
} from "../src/render/audioDsp.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

const SR = 44100;

// ---- 1. FFT: 440 Hz sine peaks in the right bin ----
{
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) re[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
  fft(re, im);
  let peak = 0, peakK = 0;
  for (let k = 1; k < FFT_SIZE / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    if (m > peak) { peak = m; peakK = k; }
  }
  const expected = Math.round((440 * FFT_SIZE) / SR); // ≈ 20
  check("FFT sine peak bin", Math.abs(peakK - expected) <= 1, `bin ${peakK} vs ${expected}`);
}

// ---- 2. AGC: steady noise converges to ~0 drive; a 3x jump spikes it ----
{
  const analyzer = new AudioAnalyzer();
  const dt = HOP / SR;
  const mags = new Float32Array(FFT_SIZE / 2);
  const rnd = (() => { let s = 42; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; })();
  let steady = 0;
  for (let f = 0; f < 600; f++) { // ~7s of steady noise
    for (let k = 0; k < mags.length; k++) mags[k] = 0.02 + 0.002 * rnd();
    steady = analyzer.step(mags, SR, FFT_SIZE, dt).level;
  }
  let spike = 0;
  for (let f = 0; f < 6; f++) { // sudden 3x loudness
    for (let k = 0; k < mags.length; k++) mags[k] = 0.06 + 0.002 * rnd();
    spike = Math.max(spike, analyzer.step(mags, SR, FFT_SIZE, dt).level);
  }
  check("AGC steady-state drive ~0", steady < 0.2, `steady=${steady.toFixed(3)}`);
  check("AGC 3x jump spikes drive", spike > 0.5, `spike=${spike.toFixed(3)}`);
}

// ---- 3. Beats: 120 BPM kicks detected at the right video frames ----
{
  const seconds = 8;
  const mono = new Float32Array(SR * seconds);
  const rnd = (() => { let s = 7; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; })();
  for (let i = 0; i < mono.length; i++) mono[i] = (rnd() - 0.5) * 0.02; // noise floor
  const kickTimes: number[] = [];
  for (let t = 0.5; t < seconds - 0.2; t += 0.5) { // 120 BPM
    kickTimes.push(t);
    const start = Math.round(t * SR);
    for (let i = 0; i < SR * 0.12; i++) {
      const env = Math.exp(-i / (SR * 0.03));
      mono[start + i] += 0.8 * env * Math.sin((2 * Math.PI * 60 * i) / SR);
    }
  }
  const hops = analyzePcm(mono, SR);
  const fps = 30;
  const frames = featuresPerVideoFrame(hops, SR, fps, seconds * fps);

  // find beat-envelope rising edges (attack instants)
  const onsetFrames: number[] = [];
  for (let f = 1; f < frames.length; f++) {
    if (frames[f].beat > 0.3 && frames[f].beat > frames[f - 1].beat + 0.15) onsetFrames.push(f);
  }
  const expectedFrames = kickTimes.map((t) => Math.round(t * fps));
  const matched = expectedFrames.filter((ef) => onsetFrames.some((of) => Math.abs(of - ef) <= 2));
  const spurious = onsetFrames.filter((of) => !expectedFrames.some((ef) => Math.abs(of - ef) <= 2));
  check("beats detected (>=90% of kicks)", matched.length >= Math.ceil(expectedFrames.length * 0.9),
        `${matched.length}/${expectedFrames.length} kicks, onsets at frames [${onsetFrames.join(",")}]`);
  check("no spurious beats", spurious.length <= 1, `spurious=[${spurious.join(",")}]`);

  // envelope decays between beats (musical release, not a held gate)
  const midGap = Math.round((kickTimes[4] + 0.25) * fps);
  check("beat envelope decays between kicks", frames[midGap].beat < 0.4,
        `env at mid-gap=${frames[midGap].beat.toFixed(3)}`);

  // bass drive responds to kicks more than treble does
  const kickFrame = expectedFrames[5];
  check("kick drives bass more than treble", frames[kickFrame].bass > frames[kickFrame].treble,
        `bass=${frames[kickFrame].bass.toFixed(2)} treble=${frames[kickFrame].treble.toFixed(2)}`);
}

// ---- 4. intensity scaling ----
{
  const f = { bass: 0.4, mid: 0.4, treble: 0.4, level: 0.4, beat: 0.4 };
  check("intensity 0 silences", applyIntensity(f, 0).beat === 0);
  check("intensity 2 doubles (clamped)", applyIntensity(f, 2).bass === 0.8);
}

console.log(failures === 0 ? "\nALL AUDIO DSP TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
