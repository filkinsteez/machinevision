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
  // layers are per-clip: show and mutate only the selected asset's stack
  const allLayers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const selectedAssetId = useStore((s) => s.selectedAssetId);
  const layers = allLayers.filter((l) => !l.assetId || l.assetId === selectedAssetId);
  const others = allLayers.filter((l) => l.assetId && l.assetId !== selectedAssetId);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId && p.status === "ready")));
  const setLayers = useStore((s) => s.setLayers);
  const updateLayer = useStore((s) => s.updateLayer);
  const selected = useStore((s) => s.selectedLayerId);
  const selectedIds = useStore(useShallow((s) => s.selectedLayerIds));
  const selectLayer = useStore((s) => s.selectLayer);
  const toggleLayerSelection = useStore((s) => s.toggleLayerSelection);
  const setLayerSelection = useStore((s) => s.setLayerSelection);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ idx: number; below: boolean } | null>(null);

  /** commit a mutation of THIS asset's stack, preserving other clips' layers */
  const commit = (visibleNext: RenderLayer[]) => setLayers([...others, ...visibleNext]);

  // add a layer, auto-routing any required input to the most recent matching pass
  const addLayer = (d: LayerDef) => {
    const l = newLayer(d);
    l.assetId = selectedAssetId;
    for (const src of d.sources) {
      const cands = passes.filter((p: VisionPass) => src.passTypes.includes(p.type));
      if (cands.length) l.sources[src.key] = cands[cands.length - 1].id;
    }
    commit([...layers, l]);
    selectLayer(l.id);
    setAdding(false);
  };

  // click / ctrl+click / shift+click selection
  const rowClick = (e: React.MouseEvent, l: RenderLayer) => {
    if (e.ctrlKey || e.metaKey) { toggleLayerSelection(l.id); return; }
    if (e.shiftKey && selected) {
      const a = layers.findIndex((x) => x.id === selected);
      const b = layers.findIndex((x) => x.id === l.id);
      if (a >= 0 && b >= 0) {
        const ids = layers.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
        setLayerSelection(ids, l.id);
        return;
      }
    }
    selectLayer(l.id);
  };

  const hoverHalf = (e: React.DragEvent): boolean => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2; // true = insert below this row
  };

  // dragging a selected row moves the whole selection as a block
  const drop = (e: React.DragEvent, idx: number, below: boolean) => {
    const id = e.dataTransfer.getData("text/plain");
    const moving = new Set(
      selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]);
    const target = layers[idx];
    if (!target || moving.has(target.id) || !layers.some((l) => moving.has(l.id))) return;
    const rest = layers.filter((l) => !moving.has(l.id));
    const movedBlock = layers.filter((l) => moving.has(l.id));
    const insertAt = rest.findIndex((l) => l.id === target.id) + (below ? 1 : 0);
    commit([...rest.slice(0, insertAt), ...movedBlock, ...rest.slice(insertAt)]);
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
              selectedIds.includes(l.id) ? "sel" : "",
              dragging === l.id ? "dragging" : "",
              over?.idx === i && dragging && dragging !== l.id
                ? (over.below ? "drop-below" : "drop-above") : "",
            ].join(" ")}
            onClick={(e) => rowClick(e, l)}
            onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
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
              commit([...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)]);
            }}>⧉</button>
            <button title="delete" onClick={(e) => {
              e.stopPropagation();
              commit(layers.filter((x) => x.id !== l.id));
              if (selectedIds.includes(l.id)) toggleLayerSelection(l.id);
            }}>✕</button>
          </li>
        ))}
        {!layers.length && <li className="dim empty">pick an effect on the left</li>}
      </ul>
    </section>
  );
}
