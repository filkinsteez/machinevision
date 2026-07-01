import { useEffect, useRef, useState } from "react";
import { audioEngine, ZERO_AUDIO, type AudioFrame } from "../render/audio";
import { useStore } from "../store";
import type { AudioReactiveConfig } from "../types";

function Slider({
  label, value, min, max, step, fixed, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; fixed: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="param">
      <span>{label}<em>{value.toFixed(fixed)}</em></span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${Math.round(Math.min(value, 1) * 100)}%` }} />
      </div>
    </div>
  );
}

export function AudioPanel() {
  const cfg = useStore((s) => s.audioConfig());
  const setAudioReactive = useStore((s) => s.setAudioReactive);
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const isVideo = asset?.type === "video" && asset.status === "ready";

  const [levels, setLevels] = useState<AudioFrame>(ZERO_AUDIO);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // own rAF for live meters; reads the (coalesced) engine sample
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = cfgRef.current;
      setLevels(c.enabled ? audioEngine.sample(c) : ZERO_AUDIO);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const set = (patch: Partial<AudioReactiveConfig>) => setAudioReactive(patch);

  return (
    <section className="panel grow scroll">
      <h3>AUDIO REACTIVE</h3>
      <div className="dim desc">
        Drives effects from the selected video's audio. Bass shakes edges, energy
        boosts flow and ASCII, beats kick the datamosh.
      </div>

      <label className="param row">
        <span>Enabled</span>
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      </label>

      {!isVideo && <div className="dim empty">select a video asset to react to audio</div>}

      <div className="param-group">
        <span className="group-label">LIVE LEVELS</span>
        <Meter label="BASS" value={levels.bass} />
        <Meter label="MID" value={levels.mid} />
        <Meter label="TREB" value={levels.treble} />
        <Meter label="LVL" value={levels.level} />
        <Meter label="BEAT" value={levels.beat} />
      </div>

      <div className="param-group">
        <span className="group-label">RESPONSE</span>
        <Slider label="Sensitivity" value={cfg.sensitivity} min={0} max={3} step={0.05} fixed={2}
                onChange={(v) => set({ sensitivity: v })} />
        <Slider label="Smoothing" value={cfg.smoothing} min={0} max={0.98} step={0.01} fixed={2}
                onChange={(v) => set({ smoothing: v })} />
        <Slider label="Beat Amount" value={cfg.beatAmount} min={0} max={3} step={0.05} fixed={2}
                onChange={(v) => set({ beatAmount: v })} />
      </div>

      <div className="param-group">
        <span className="group-label">BAND GAINS</span>
        <Slider label="Bass" value={cfg.bassGain} min={0} max={3} step={0.05} fixed={2}
                onChange={(v) => set({ bassGain: v })} />
        <Slider label="Mid" value={cfg.midGain} min={0} max={3} step={0.05} fixed={2}
                onChange={(v) => set({ midGain: v })} />
        <Slider label="Treble" value={cfg.trebleGain} min={0} max={3} step={0.05} fixed={2}
                onChange={(v) => set({ trebleGain: v })} />
      </div>
    </section>
  );
}
