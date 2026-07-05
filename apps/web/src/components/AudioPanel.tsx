import { useEffect, useRef, useState } from "react";
import { audioEngine, ZERO_AUDIO, type AudioFrame } from "../render/audio";
import { useStore } from "../store";

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
  const playing = useStore((s) => s.playing);
  const isVideo = asset?.type === "video" && asset.status === "ready";

  const [levels, setLevels] = useState<AudioFrame>(ZERO_AUDIO);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

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

  return (
    <section className="panel grow scroll">
      <h3 title="The track's own audio drives the effects — self-calibrating, no tuning">AUDIO REACTIVE</h3>

      <label className="param row">
        <span>React to audio</span>
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => setAudioReactive({ enabled: e.target.checked })} />
      </label>

      <label className="param">
        <span>Intensity<em>{cfg.sensitivity.toFixed(2)}×</em></span>
        <input type="range" min={0} max={2.5} step={0.05} value={cfg.sensitivity}
               title="How hard the audio drives the visuals. 1× = calibrated default."
               onChange={(e) => setAudioReactive({ sensitivity: Number(e.target.value) })} />
      </label>

      {!isVideo && <div className="dim empty">select a video with sound</div>}
      {isVideo && cfg.enabled && !playing && (
        <div className="hint dim">press PLAY</div>
      )}

      <div className="param-group">
        <span className="group-label">LIVE SIGNAL</span>
        <Meter label="BASS" value={levels.bass} />
        <Meter label="MID" value={levels.mid} />
        <Meter label="TREB" value={levels.treble} />
        <Meter label="LEVEL" value={levels.level} />
        <Meter label="BEAT" value={levels.beat} />
      </div>
    </section>
  );
}
