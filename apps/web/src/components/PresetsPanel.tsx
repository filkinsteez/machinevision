import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { useStore } from "../store";

export function PresetsPanel() {
  const presets = useStore((s) => s.presets);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const applyPreset = useStore((s) => s.applyPreset);
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const readyTypes = new Set(passes.map((p) => p.type));

  return (
    <section className="panel scroll">
      <h3>
        PRESETS
        {layers.length > 0 && (
          <button className="add" onClick={() => setSaving(!saving)}>{saving ? "×" : "SAVE"}</button>
        )}
      </h3>
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
        {presets.map((p) => {
          const missing = p.requiredPassTypes.filter((t) => !readyTypes.has(t));
          return (
            <li key={p.id}>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="dim">{p.description}</div>
                {missing.length > 0 && (
                  <div className="missing">needs: {missing.join(", ")}</div>
                )}
              </div>
              <button className="go" disabled={missing.length > 0} onClick={() => applyPreset(p)}>
                APPLY
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
