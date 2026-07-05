import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { EFFECTS } from "../effects";
import { useStore } from "../store";

/** The Effects rail: outcome-first, one click per model. Analysis (passes) runs
 * automatically and is cached — the user never routes anything by hand. */
export function EffectsPanel() {
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const effectBusy = useStore((s) => s.effectBusy);
  const runEffect = useStore((s) => s.runEffect);
  const jobs = useStore(useShallow((s) => s.jobs.filter((j) => j.status === "running" || j.status === "queued")));
  const presets = useStore((s) => s.presets);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const applyPreset = useStore((s) => s.applyPreset);
  const applyPresetAuto = useStore((s) => s.applyPresetAuto);
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const [showCombos, setShowCombos] = useState(false);
  const [saveName, setSaveName] = useState("");

  const saveLook = async () => {
    const required = [...new Set(layers.flatMap((l) =>
      Object.values(l.sources).filter(Boolean).map((pid) =>
        passes.find((p) => p.id === pid)?.type).filter(Boolean) as string[]))];
    await api.savePreset({
      name: saveName.trim(), description: "", category: "composite",
      requiredPassTypes: required,
      renderLayers: layers.map(({ id: _id, sources, ...rest }) => ({
        ...rest,
        sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => {
          const t = passes.find((p) => p.id === v)?.type;
          return [k, t ? `$${t}` : null];
        })),
      })),
    });
    setSaveName("");
    useStore.setState({ presets: await api.listPresets() });
  };

  const ready = asset?.status === "ready";
  const isVideo = asset?.type === "video";
  const readyTypes = new Set(passes.map((p) => p.type));
  const stage = jobs[0]?.stage || jobs[0]?.type || "";

  const groups: Array<{ id: "see" | "style"; label: string; hint: string }> = [
    { id: "see", label: "SEE", hint: "the model's perception, drawn on the footage" },
    { id: "style", label: "STYLE", hint: "treatments driven by the analysis" },
  ];

  return (
    <section className="panel grow scroll">
      <h3>EFFECTS</h3>
      <div className="dim desc">One click — analysis runs by itself, then the effect lands as a tunable layer.</div>
      {!ready && <div className="dim empty">Upload media to begin.</div>}

      {ready && groups.map((g) => (
        <div className="fx-group" key={g.id}>
          <span className="group-label">{g.label} <span className="dim">· {g.hint}</span></span>
          {EFFECTS.filter((e) => e.group === g.id && (!e.videoOnly || isVideo)).map((e) => {
            const busy = effectBusy === e.id;
            const cached = e.ensure.every((t) => readyTypes.has(t));
            return (
              <button
                key={e.id}
                className={`fx-row ${busy ? "busy" : ""}`}
                disabled={effectBusy !== null}
                onClick={() => runEffect(e)}
                title={cached ? "Analysis cached — applies instantly" : `Runs ${e.ensure.join(" + ")} first`}
              >
                <span className="fx-name">{e.label}{cached && <span className="fx-cached" title="analysis cached">●</span>}</span>
                <span className="fx-tag dim">{busy ? (stage || "analyzing…") : e.tagline}</span>
              </button>
            );
          })}
        </div>
      ))}

      {ready && (
        <div className="fx-group">
          <span className="group-label">
            COMBOS <span className="dim">· multi-effect starting points</span>
            <button className="add" onClick={() => setShowCombos(!showCombos)}>{showCombos ? "×" : "OPEN"}</button>
          </span>
          {showCombos && layers.length > 0 && (
            <div className="seg-tools">
              <input value={saveName} placeholder="save current stack as…"
                     onChange={(e) => setSaveName(e.target.value)} />
              <button className="go" disabled={!saveName.trim()} onClick={saveLook}>SAVE</button>
            </div>
          )}
          {showCombos && presets.map((p) => {
            const missing = p.requiredPassTypes.filter((t) => !readyTypes.has(t));
            return (
              <button
                key={p.id}
                className="fx-row"
                disabled={effectBusy !== null}
                title={p.description}
                onClick={() => (missing.length ? applyPresetAuto(p) : applyPreset(p))}
              >
                <span className="fx-name">{p.name}</span>
                <span className="fx-tag dim">{p.description}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
