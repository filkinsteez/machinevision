import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { useStore } from "../store";

const PASS_LABEL: Record<string, string> = {
  mask: "mask", edge_matte: "edge outline", optical_flow: "motion",
  face_landmarks: "face", pose_landmarks: "pose", hand_landmarks: "hands",
  detection: "detections", depth: "depth", normals: "normals", body_parts: "body parts",
};
const friendly = (types: string[]) =>
  [...new Set(types.map((t) => PASS_LABEL[t] ?? t))].join(", ");

export function PresetsPanel() {
  const presets = useStore((s) => s.presets);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const applyPreset = useStore((s) => s.applyPreset);
  const applyPresetAuto = useStore((s) => s.applyPresetAuto);
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);

  const readyTypes = new Set(passes.map((p) => p.type));
  const ready = asset?.status === "ready";

  // ready-to-apply first, then ones that need generation
  const sorted = [...presets].sort((a, b) => {
    const am = a.requiredPassTypes.filter((t) => !readyTypes.has(t)).length;
    const bm = b.requiredPassTypes.filter((t) => !readyTypes.has(t)).length;
    return (am === 0 ? 0 : 1) - (bm === 0 ? 0 : 1);
  });

  return (
    <section className="panel scroll">
      <h3>
        PRESETS ★ <span className="dim" style={{ fontWeight: "normal" }}>one-click looks</span>
        {layers.length > 0 && (
          <button className="add" onClick={() => setSaving(!saving)}>{saving ? "×" : "SAVE"}</button>
        )}
      </h3>
      <div className="dim desc">
        Pick a look — it generates the passes it needs and builds the layers for you.
      </div>
      {saving && (
        <div className="seg-tools">
          <input value={name} placeholder="preset name" onChange={(e) => setName(e.target.value)} />
          <button className="go" disabled={!name.trim()} onClick={async () => {
            const required = [...new Set(layers.flatMap((l) =>
              Object.values(l.sources).filter(Boolean).map((pid) =>
                passes.find((p) => p.id === pid)?.type).filter(Boolean) as string[]))];
            await api.savePreset({
              name: name.trim(), description: "", category: "composite",
              requiredPassTypes: required,
              renderLayers: layers.map(({ id: _id, sources, ...rest }) => ({
                ...rest,
                sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => {
                  const t = passes.find((p) => p.id === v)?.type;
                  return [k, t ? `$${t}` : null];
                })),
              })),
            });
            setSaving(false);
            setName("");
            useStore.setState({ presets: await api.listPresets() });
          }}>SAVE</button>
        </div>
      )}
      <ul className="preset-list">
        {sorted.map((p) => {
          const missing = p.requiredPassTypes.filter((t) => !readyTypes.has(t));
          const isGen = generating === p.id;
          return (
            <li key={p.id}>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="dim">{p.description}</div>
                {missing.length > 0 && (
                  <div className="missing">auto-generates: {friendly(missing)}</div>
                )}
              </div>
              {missing.length === 0 ? (
                <button className="go" disabled={!ready} onClick={() => applyPreset(p)}>APPLY</button>
              ) : (
                <button
                  className="go"
                  disabled={!ready || isGen || generating !== null}
                  title="Generate the needed passes, then build this look"
                  onClick={async () => {
                    setGenerating(p.id);
                    try { await applyPresetAuto(p); } finally { setGenerating(null); }
                  }}
                >{isGen ? "GENERATING…" : "GENERATE + APPLY"}</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
