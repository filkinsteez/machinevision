/** Dump flux vs threshold around the missed kicks (t=1.9..2.2s). */
import { FFT_SIZE, HOP, fft } from "../src/render/audioDsp.ts";

const SR = 44100;
const seconds = 8;
const mono = new Float32Array(SR * seconds);
const rnd = (() => { let s = 7; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; })();
for (let i = 0; i < mono.length; i++) mono[i] = (rnd() - 0.5) * 0.02;
for (let t = 0.5; t < seconds - 0.2; t += 0.5) {
  const start = Math.round(t * SR);
  for (let i = 0; i < SR * 0.12; i++) {
    const env = Math.exp(-i / (SR * 0.03));
    mono[start + i] += 0.8 * env * Math.sin((2 * Math.PI * 60 * i) / SR);
  }
}

// replicate the flux computation with full visibility
const window = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
let prev: Float32Array | null = null;
const hist: number[] = [];
const dt = HOP / SR;
const win = Math.round(1.2 / dt);
let runMax = 1e-6;
let sinceOnset = 1e9;
let hop = 0;
for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP, hop++) {
  for (let i = 0; i < FFT_SIZE; i++) { re[i] = mono[start + i] * window[i]; im[i] = 0; }
  fft(re, im);
  const mags = new Float32Array(FFT_SIZE / 2);
  for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]) / FFT_SIZE;
  let flux = 0;
  if (prev) for (let k = 1; k < mags.length; k++) {
    const d = mags[k] - prev[k];
    if (d > 0) flux += d * ((k * SR) / FFT_SIZE < 250 ? 2 : 1);
  }
  prev = mags;
  hist.push(flux);
  if (hist.length > win) hist.shift();
  const sorted = [...hist].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const thr = 1e-6 + 2.2 * median;
  runMax = Math.max(runMax * Math.exp(-dt / 5.0), flux, 1e-6);
  sinceOnset += dt;
  const t = start / SR;
  const nearKick = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0].some((k) => Math.abs(t - k) < 0.06);
  if (nearKick) {
    const strength = (flux - thr) / (0.5 * runMax);
    const fire = flux > thr && hist.length > 4 && sinceOnset > 0.18 && strength > 0.05;
    console.log(`t=${t.toFixed(3)} flux=${flux.toExponential(2)} thr=${thr.toExponential(2)} runMax=${runMax.toExponential(2)} strength=${strength.toFixed(3)} fire=${fire}`);
    if (fire) sinceOnset = 0;
  } else if (flux > thr && hist.length > 4 && sinceOnset > 0.18 && (flux - thr) / (0.5 * runMax) > 0.05) {
    sinceOnset = 0;
  }
}