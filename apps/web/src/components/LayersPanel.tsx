import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { LAYER_DEFS, layerDef, newLayer, uniqueId, type LayerDef } from "../layers";
import { useStore } from "../store";
import type { RenderLayer, VisionPass } from "../types";

const PASS_LABEL: Record<string, string> = {
  mask: "mask", edge_matte: "edge outline", optical_flow: "motion",
  face_landmarks: "face", pose_landmarks: "pose", hand_landmarks: "hands",
  detection: "detections", depth: "depth", normals: "normals", body_parts: "body parts",
};
const neededLabel = (d: LayerDef) =>
  [...new Set(d.sources.filter((s) => s.required).flatMap((s) => s.passTypes.map((t) => PASS_LABEL[t] ?? t)))].join(" / ");

const isInert = (l: RenderLayer) =>
  (layerDef(l.type)?.sources ?? []).some((s) => s.required && !l.sources[s.key]);

export function LayersPanel() {
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const setLayers = useStore((s) => s.setLayers);
  const updateLayer = useStore((s) => s.updateLayer);
  const selected = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ idx: number; below: boolean } | null>(null);

  // add a layer, auto-routing any required input to the most recent matching pass
  const addLayer = (d: LayerDef) => {
    const l = newLayer(d);
    for (const src of d.sources) {
      const cands = passes.filter((p: VisionPass) => src.passTypes.includes(p.type));
      if (cands.length) l.sources[src.key] = cands[cands.length - 1].id;
    }
    setLayers([...layers, l]);
    selectLayer(l.id);
    setAdding(false);
  };

  const hoverHalf = (e: React.DragEvent): boolean => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2; // true = insert below this row
  };

  const drop = (e: React.DragEvent, idx: number, below: boolean) => {
    const id = e.dataTransfer.getData("text/plain");
    const from = layers.findIndex((l) => l.id === id);
    let insertAt = idx + (below ? 1 : 0);
    if (from < 0) return;
    if (insertAt > from) insertAt -= 1;
    if (insertAt === from) return;
    const next = [...layers];
    const [moved] = next.splice(from, 1);
    next.splice(insertAt, 0, moved);
    setLayers(next);
  };

  return (
    <section className="panel grow">
      <h3>
        LAYERS
        <button className="add" onClick={() => setAdding(!adding)}>{adding ? "×" : "+ ADD"}</button>
      </h3>
      {adding && (
        <ul className="layer-add-list">
          {LAYER_DEFS.map((d) => {
            const needs = neededLabel(d);
            return (
              <li key={d.type} onClick={() => addLayer(d)}>
                <span className="name">{d.label}</span>
                <span className="dim">{d.description}</span>
                {needs && <span className="needs-tag dim">needs: {needs}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <ul className="layer-list">
        {layers.map((l, i) => (
          <li
            key={l.id}
            draggable
            className={[
              l.id === selected ? "sel" : "",
              dragging === l.id ? "dragging" : "",
              over?.idx === i && dragging && dragging !== l.id
                ? (over.below ? "drop-below" : "drop-above") : "",
            ].join(" ")}
            onClick={() => selectLayer(l.id)}
            onDragStart={(e) => {
              setDragging(l.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", l.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver({ idx: i, below: hoverHalf(e) });
            }}
            onDragLeave={() => setOver((o) => (o?.idx === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(e, i, hoverHalf(e)); setDragging(null); setOver(null); }}
            onDragEnd={() => { setDragging(null); setOver(null); }}
          >
            <span className="grip" title="drag to reorder">⠿</span>
            <button
              className={`eye ${l.enabled ? "on" : ""}`}
              title={l.enabled ? "hide layer" : "show layer"}
              onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { enabled: !l.enabled }); }}
            >{l.enabled ? "◉" : "○"}</button>
            {isInert(l) && <span className="inert" title="Not rendering — connect an input pass in CONTROLS">⚠</span>}
            <span className="grow name">{l.name}</span>
            <button title="duplicate" onClick={(e) => {
              e.stopPropagation();
              const copy = { ...l, id: uniqueId(), name: l.name + " copy" };
              setLayers([...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)]);
            }}>⧉</button>
            <button title="delete" onClick={(e) => {
              e.stopPropagation();
              setLayers(layers.filter((x) => x.id !== l.id));
              if (selected === l.id) selectLayer(null);
            }}>✕</button>
          </li>
        ))}
        {!layers.length && <li className="dim empty">pick an effect on the left</li>}
      </ul>
    </section>
  );
}
