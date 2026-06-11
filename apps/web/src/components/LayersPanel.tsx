import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { LAYER_DEFS, newLayer, uniqueId } from "../layers";
import { useStore } from "../store";

export function LayersPanel() {
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const setLayers = useStore((s) => s.setLayers);
  const updateLayer = useStore((s) => s.updateLayer);
  const selected = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const [adding, setAdding] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const drop = (e: React.DragEvent, target: number) => {
    const id = e.dataTransfer.getData("text/plain");
    const from = layers.findIndex((l) => l.id === id);
    if (from < 0 || from === target) return;
    const next = [...layers];
    const [moved] = next.splice(from, 1);
    next.splice(target > from ? target - 1 : target, 0, moved);
    setLayers(next);
  };

  return (
    <section className="panel grow">
      <h3>
        RENDER LAYERS
        <button className="add" onClick={() => setAdding(!adding)}>{adding ? "×" : "+ ADD"}</button>
      </h3>
      {adding && (
        <ul className="layer-add-list">
          {LAYER_DEFS.map((d) => (
            <li key={d.type} onClick={() => {
              const l = newLayer(d);
              setLayers([...layers, l]);
              selectLayer(l.id);
              setAdding(false);
            }}>
              <span className="name">{d.label}</span>
              <span className="dim">{d.description}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="layer-list">
        {layers.map((l, i) => (
          <li
            key={l.id}
            draggable
            className={[
              l.id === selected ? "sel" : "",
              dragIdx === i ? "dragging" : "",
              overIdx === i && dragIdx !== null && dragIdx !== i ? "drop-target" : "",
            ].join(" ")}
            onClick={() => selectLayer(l.id)}
            onDragStart={(e) => {
              setDragIdx(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", l.id);
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIdx(i); }}
            onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(e, i); setDragIdx(null); setOverIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          >
            <span className="grip" title="drag to reorder">⠿</span>
            <button
              className={`eye ${l.enabled ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { enabled: !l.enabled }); }}
            >{l.enabled ? "◉" : "○"}</button>
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
        {/* drop zone for moving a layer to the end */}
        {dragIdx !== null && (
          <li
            className={`drop-end ${overIdx === layers.length ? "drop-target" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(layers.length); }}
            onDrop={(e) => { e.preventDefault(); drop(e, layers.length); setDragIdx(null); setOverIdx(null); }}
          >⌄ move to end</li>
        )}
        {!layers.length && <li className="dim empty">no layers — add one or apply a preset</li>}
      </ul>
    </section>
  );
}
