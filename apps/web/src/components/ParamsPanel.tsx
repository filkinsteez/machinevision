import { useShallow } from "zustand/react/shallow";
import { layerDef, type LayerDef, type ParamSpec } from "../layers";
import { useStore } from "../store";
import type { PassType, RenderLayer } from "../types";

// human-readable names for pass types and layer input slots
const PASS_TYPE_LABEL: Record<string, string> = {
  mask: "mask", edge_matte: "edge outline", optical_flow: "motion",
  face_landmarks: "landmarks", pose_landmarks: "landmarks", hand_landmarks: "landmarks",
  detection: "detections", depth: "depth", normals: "surface normals", body_parts: "body parts",
};

function passTypesLabel(types: PassType[]): string {
  const uniq = [...new Set(types.map((t) => PASS_TYPE_LABEL[t] ?? t))];
  return uniq.join(" / ");
}

function sourceLabel(src: LayerDef["sources"][number]): string {
  return passTypesLabel(src.passTypes);
}

function ParamControl({ name, spec, layer }: { name: string; spec: ParamSpec; layer: RenderLayer }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const value = layer.params[name] ?? spec.default;
  const set = (v: unknown) =>
    updateLayer(layer.id, { params: { ...layer.params, [name]: v as never } });

  if (spec.kind === "slider") {
    return (
      <label className="param">
        <span>{spec.label}<em>{Number(value).toFixed(spec.step >= 1 ? 0 : 2)}</em></span>
        <input type="range" min={spec.min} max={spec.max} step={spec.step}
               value={Number(value)} onChange={(e) => set(Number(e.target.value))} />
      </label>
    );
  }
  if (spec.kind === "seed") {
    return (
      <label className="param row">
        <span>{spec.label}</span>
        <input type="number" className="seed" value={Number(value)}
               onChange={(e) => set(Number(e.target.value))} />
        <button onClick={() => set(Math.floor(Math.random() * 99999))}>↻</button>
      </label>
    );
  }
  if (spec.kind === "select") {
    return (
      <label className="param row">
        <span>{spec.label}</span>
        <select value={String(value)} onChange={(e) => set(e.target.value)}>
          {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (spec.kind === "color") {
    return (
      <label className="param row">
        <span>{spec.label}</span>
        <input type="color" value={String(value)} onChange={(e) => set(e.target.value)} />
      </label>
    );
  }
  if (spec.kind === "toggle") {
    return (
      <label className="param row">
        <span>{spec.label}</span>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
      </label>
    );
  }
  if (spec.kind === "fields") {
    const arr = Array.isArray(value) ? (value as string[]) : spec.default;
    return (
      <div className="param">
        <span>{spec.label}</span>
        <div className="chips">
          {spec.options.map((o) => (
            <button key={o} className={arr.includes(o) ? "active" : ""}
                    onClick={() => set(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}>
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export function ParamsPanel() {
  const layer = useStore((s) => s.project?.renderLayers.find((l) => l.id === s.selectedLayerId) ?? null);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const updateLayer = useStore((s) => s.updateLayer);

  if (!layer) {
    return <section className="panel"><h3>LAYER CONTROLS</h3><div className="dim empty">select a layer</div></section>;
  }
  const def = layerDef(layer.type);
  if (!def) return null;

  // which required inputs aren't wired up yet — the layer draws nothing until they are
  const missing = def.sources.filter((s) => s.required && !layer.sources[s.key]);

  return (
    <section className="panel grow scroll">
      <h3>{def.label.toUpperCase()}</h3>
      <div className="dim desc">{def.description}</div>

      {missing.length > 0 && (
        <div className="warn-banner">
          ⚠ Not rendering yet — connect a {missing.map((m) => sourceLabel(m)).join(" and ")} below.
        </div>
      )}

      <div className="param-group">
        <span className="group-label">INPUT (which pass feeds this layer)</span>
        {def.sources.map((src) => {
          const candidates = passes.filter((p) => src.passTypes.includes(p.type));
          const need = passTypesLabel(src.passTypes);
          const unrouted = src.required && !layer.sources[src.key];
          return (
            <label className={`param row ${unrouted ? "needs" : ""}`} key={src.key}>
              <span>{sourceLabel(src)}{src.required ? " *" : ""}</span>
              {candidates.length === 0 ? (
                <span className="dim need-pass">— make a {need} pass first —</span>
              ) : (
                <select
                  value={layer.sources[src.key] ?? ""}
                  onChange={(e) => updateLayer(layer.id, {
                    sources: { ...layer.sources, [src.key]: e.target.value || null },
                  })}
                >
                  <option value="">— none —</option>
                  {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </label>
          );
        })}
      </div>

      <div className="param-group">
        <span className="group-label">PARAMETERS</span>
        {Object.entries(def.params).map(([name, spec]) => (
          <ParamControl key={name} name={name} spec={spec} layer={layer} />
        ))}
      </div>

      <div className="param-group">
        <span className="group-label">BLEND</span>
        <label className="param row">
          <span>Mode</span>
          <select value={layer.blend.mode}
                  onChange={(e) => updateLayer(layer.id, { blend: { ...layer.blend, mode: e.target.value } })}>
            {["normal", "add", "screen", "multiply"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Opacity<em>{layer.blend.opacity.toFixed(2)}</em></span>
          <input type="range" min={0} max={1} step={0.01} value={layer.blend.opacity}
                 onChange={(e) => updateLayer(layer.id, { blend: { ...layer.blend, opacity: Number(e.target.value) } })} />
        </label>
      </div>
    </section>
  );
}
