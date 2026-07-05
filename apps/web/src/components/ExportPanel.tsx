import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { useStore } from "../store";

export function ExportPanel() {
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const project = useStore((s) => s.project);
  const exportsList = useStore((s) => s.exports);
  const refresh = useStore((s) => s.refresh);
  const baking = useStore((s) => s.baking);
  const setError = useStore((s) => s.setError);
  const layers = useStore(useShallow((s) =>
    (s.project?.renderLayers ?? []).filter((l) => !l.assetId || l.assetId === s.selectedAssetId)));
  const [moshParams, setMoshParams] = useState({
    mode: "subject", strength: 0.9, keyframeDistance: 15, dupEvery: 30, dupCount: 2, seed: 1234,
  });
  const [showMosh, setShowMosh] = useState(false);

  const maskPasses = passes.filter((p) => p.type === "mask" || p.type === "edge_matte");
  const [moshMask, setMoshMask] = useState("");
  const moshLayer = layers.find((l) => l.type === "datamosh_preview" && l.enabled);
  const effectiveMask = moshMask || moshLayer?.sources.mask || maskPasses[0]?.id || "";
  const isVideo = asset?.type === "video";
  const moshReady = !!effectiveMask && isVideo;
  const moshReason = !isVideo ? "Video only." : !maskPasses.length ? "Needs a mask pass — make one in Analyze." : "";

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

  const bakeFrames = baking && asset?.frameCount
    ? `frame ${Math.round(baking.progress * asset.frameCount)} / ${asset.frameCount}` : "";

  return (
    <section className="panel grow scroll">
      <h3>EXPORT</h3>

      {/* PRIMARY: export exactly what the preview shows */}
      <div className="param-group">
        <span className="group-label">EXPORT VIDEO</span>
        <button
          className="go wide"
          disabled={!asset || asset.status !== "ready" || !!baking || !layers.length}
          onClick={() => window.dispatchEvent(new Event("mv-bake"))}
          title={!layers.length ? "Add a render layer first" : "Export the composition as shown"}
        >
          {baking ? `BAKING… ${(baking.progress * 100).toFixed(0)}%`
            : `EXPORT ${isVideo ? "VIDEO" : "IMAGE"}`}
        </button>
        {baking && <div className="dim desc">{bakeFrames || "encoding…"}</div>}
        {!layers.length && !baking && <div className="hint dim">add an effect first</div>}
      </div>

      {/* ADVANCED: authentic codec datamosh */}
      <div className="param-group">
        <span className="group-label" title="Real MPEG-4 codec corruption composited through a mask — slower, glitchier, video only">
          TRUE DATAMOSH
          <button className="add" onClick={() => setShowMosh(!showMosh)}>{showMosh ? "×" : "+"}</button>
        </span>
        {showMosh && (
          <>
            <label className="param row">
              <span>mask</span>
              <select value={effectiveMask} onChange={(e) => setMoshMask(e.target.value)}>
                {maskPasses.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {!maskPasses.length && <option value="">— make a mask first —</option>}
              </select>
            </label>
            {!moshLayer && (
              <label className="param row">
                <span>region</span>
                <select value={moshParams.mode}
                        onChange={(e) => setMoshParams({ ...moshParams, mode: e.target.value })}>
                  <option value="subject">subject</option><option value="background">background</option>
                </select>
              </label>
            )}
            <label className="param">
              <span>Mosh length<em>{moshParams.keyframeDistance}</em></span>
              <input type="range" min={2} max={120} value={moshParams.keyframeDistance}
                     title="How long the mosh runs before the picture snaps back. Higher = longer melt."
                     onChange={(e) => setMoshParams({ ...moshParams, keyframeDistance: Number(e.target.value) })} />
            </label>
            <label className="param">
              <span>Motion bloom every<em>{moshParams.dupEvery || "off"}</em></span>
              <input type="range" min={0} max={90} value={moshParams.dupEvery}
                     title="Repeat motion frames to smear the image — the classic datamosh bloom. 0 = off."
                     onChange={(e) => setMoshParams({ ...moshParams, dupEvery: Number(e.target.value) })} />
            </label>
            <button className="go wide" disabled={!moshReady} onClick={runFinal}>
              RENDER DATAMOSH
            </button>
            {!moshReady && <div className="hint dim">{moshReason}</div>}
          </>
        )}
      </div>

      <div className="param-group">
        <span className="group-label">PASSES &amp; DATA</span>
        <div className="seg-tools wrap">
          {maskPasses.map((p) => (
            <button key={p.id} title="Export this mask as a PNG sequence (zip)" onClick={async () => {
              if (!project) return;
              await api.createExport(project.id, "mask_sequence", p.id);
              refresh();
            }}>
              {p.type === "mask" ? "MASKS" : "EDGES"} ZIP
            </button>
          ))}
          <button title="Export all pass data as JSON" onClick={async () => {
            if (!project) return;
            await api.createExport(project.id, "metadata");
            refresh();
          }}>METADATA JSON</button>
          {project && (
            <a className="btn" title="Save the whole project as JSON" href={`/api/projects/${project.id}/export-json`} download={`${project.name}.machineindustries.json`}>
              PROJECT JSON
            </a>
          )}
        </div>
      </div>

      <div className="param-group">
        <span className="group-label">DOWNLOADS</span>
        <ul className="export-list">
          {exportsList.map((e) => (
            <li key={e.id}>
              <span className="tag">{e.type === "baked_video" ? "VID" : e.type === "datamosh_pass" ? "MSH" : e.type === "mask_sequence" ? "ZIP" : e.type === "baked_image" ? "IMG" : "DAT"}</span>
              <span className="grow dim">{e.status === "ready" ? e.type.replace(/_/g, " ") : `${e.type.replace(/_/g, " ")} · ${e.status}`}</span>
              {e.outputUrl && <a className="btn" title="download" href={e.outputUrl} download>↓</a>}
            </li>
          ))}
          {!exportsList.length && <li className="dim empty">nothing exported yet</li>}
        </ul>
      </div>
    </section>
  );
}
