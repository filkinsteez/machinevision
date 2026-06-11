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

  const move = (i: number, dir: number) => {
    const next = [...layers];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
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
          <li key={l.id} className={l.id === selected ? "sel" : ""} onClick={() => selectLayer(l.id)}>
            <button
              className={`eye ${l.enabled ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { enabled: !l.enabled }); }}
            >{l.enabled ? "◉" : "○"}</button>
            <span className="grow name">{l.name}</span>
            <button onClick={(e) => { e.stopPropagation(); move(i, -1); }}>↑</button>
            <button onClick={(e) => { e.stopPropagation(); move(i, 1); }}>↓</button>
            <button onClick={(e) => {
              e.stopPropagation();
              const copy = { ...l, id: uniqueId(), name: l.name + " copy" };
              setLayers([...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)]);
            }}>⧉</button>
            <button onClick={(e) => {
              e.stopPropagation();
              setLayers(layers.filter((x) => x.id !== l.id));
              if (selected === l.id) selectLayer(null);
            }}>✕</button>
          </li>
        ))}
        {!layers.length && <li className="dim empty">no layers — add one or apply a preset</li>}
      </ul>
    </section>
  );
}
