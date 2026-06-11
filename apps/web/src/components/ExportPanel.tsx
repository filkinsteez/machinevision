import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { layerDef } from "../layers";
import { useStore } from "../store";

export function ExportPanel() {
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const project = useStore((s) => s.project);
  const exportsList = useStore((s) => s.exports);
  const refresh = useStore((s) => s.refresh);
  const baking = useStore((s) => s.baking);
  const setError = useStore((s) => s.setError);
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const [moshParams, setMoshParams] = useState({
    mode: "subject", strength: 0.9, keyframeDistance: 15, dupEvery: 30, dupCount: 2, seed: 1234,
  });

  const maskPasses = passes.filter((p) => p.type === "mask" || p.type === "edge_matte");
  const [moshMask, setMoshMask] = useState("");
  const moshLayer = layers.find((l) => l.type === "datamosh_preview" && l.enabled);
  const effectiveMask = moshMask || moshLayer?.sources.mask || maskPasses[0]?.id || "";

  const runFinal = async () => {
    if (!project || !asset || !effectiveMask) return;
    try {
      const params = moshLayer
        ? {
            mode: String(moshLayer.params.mode ?? "subject"),
            strength: Number(moshLayer.params.strength ?? 0.9),
            edgeLeak: Number(moshLayer.params.edgeLeak ?? 0.3),
            seed: Number(moshLayer.params.seed ?? 1234),
            keyframeDistance: moshParams.keyframeDistance,
            dupEvery: moshParams.dupEvery,
            dupCount: moshParams.dupCount,
          }
        : moshParams;
      await api.renderDatamosh(project.id, asset.id, effectiveMask, params);
      await refresh();
    } catch (e) { setError(String(e)); }
  };

  return (
    <section className="panel grow scroll">
      <h3>EXPORT</h3>

      <div className="param-group">
        <span className="group-label">FINAL RENDER · CODEC DATAMOSH</span>
        <div className="dim desc">
          Server-side authentic mosh: real MPEG-4 packet surgery composited through the mask.
          {moshLayer ? " Using your Datamosh layer's mode/strength/seed." : ""}
        </div>
        <label className="param row">
          <span>mask</span>
          <select value={effectiveMask} onChange={(e) => setMoshMask(e.target.value)}>
            {maskPasses.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {!maskPasses.length && <option value="">— generate a mask first —</option>}
          </select>
        </label>
        {!moshLayer && (
          <label className="param row">
            <span>mode</span>
            <select value={moshParams.mode}
                    onChange={(e) => setMoshParams({ ...moshParams, mode: e.target.value })}>
              <option>subject</option><option>background</option>
            </select>
          </label>
        )}
        <label className="param">
          <span>GOP / keyframe distance<em>{moshParams.keyframeDistance}</em></span>
          <input type="range" min={2} max={120} value={moshParams.keyframeDistance}
                 onChange={(e) => setMoshParams({ ...moshParams, keyframeDistance: Number(e.target.value) })} />
        </label>
        <label className="param">
          <span>P-frame bloom every<em>{moshParams.dupEvery || "off"}</em></span>
          <input type="range" min={0} max={90} value={moshParams.dupEvery}
                 onChange={(e) => setMoshParams({ ...moshParams, dupEvery: Number(e.target.value) })} />
        </label>
        <button className="go wide" disabled={!effectiveMask || asset?.type !== "video"} onClick={runFinal}>
          RENDER FINAL (CODEC ENGINE)
        </button>
      </div>

      <div className="param-group">
        <span className="group-label">BAKE PREVIEW ENGINE</span>
        <div className="dim desc">Renders every frame through the browser preview stack, encoded server-side. Frame-accurate.</div>
        <button
          className="go wide"
          disabled={!asset || asset.status !== "ready" || !!baking || !layers.length}
          onClick={() => window.dispatchEvent(new Event("mv-bake"))}
        >
          {baking ? `BAKING ${(baking.progress * 100).toFixed(0)}%` : `BAKE ${asset?.type === "video" ? "VIDEO" : "IMAGE"} (PREVIEW ENGINE)`}
        </button>
      </div>

      <div className="param-group">
        <span className="group-label">PASSES & DATA</span>
        <div className="seg-tools wrap">
          {maskPasses.map((p) => (
            <button key={p.id} onClick={async () => {
              if (!project) return;
              await api.createExport(project.id, "mask_sequence", p.id);
              refresh();
            }}>
              {p.type === "mask" ? "MASKS" : "EDGES"} ZIP
            </button>
          ))}
          <button onClick={async () => {
            if (!project) return;
            await api.createExport(project.id, "metadata");
            refresh();
          }}>METADATA JSON</button>
          {project && (
            <a className="btn" href={`/api/projects/${project.id}/export-json`} download={`${project.name}.machinevision.json`}>
              PROJECT JSON
            </a>
          )}
        </div>
      </div>

      <div className="param-group">
        <span className="group-label">OUTPUTS</span>
        <ul className="export-list">
          {exportsList.map((e) => (
            <li key={e.id}>
              <span className="tag">{e.type === "baked_video" ? "VID" : e.type === "datamosh_pass" ? "MSH" : e.type === "mask_sequence" ? "ZIP" : e.type === "baked_image" ? "IMG" : "DAT"}</span>
              <span className="grow dim">{e.status === "ready" ? e.type : `${e.type} · ${e.status}`}</span>
              {e.outputUrl && <a className="btn" href={e.outputUrl} download>↓</a>}
            </li>
          ))}
          {!exportsList.length && <li className="dim empty">nothing exported yet</li>}
        </ul>
      </div>
      <div className="dim desc">
        Layer engines: {layers.map((l) => `${l.name}→${layerDef(l.type)?.engine ?? "?"}`).join("  ") || "—"}
      </div>
    </section>
  );
}
