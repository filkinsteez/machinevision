import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { EFFECTS } from "../effects";
import { useStore } from "../store";

const TYPE_TAGS: Record<string, string> = {
  mask: "MSK", detection: "DET", tracking: "TRK", face_landmarks: "FACE",
  pose_landmarks: "POSE", hand_landmarks: "HAND", optical_flow: "FLOW", edge_matte: "EDGE",
  body_parts: "PART", depth: "DPTH", normals: "NRML",
};

/** One rail: type/click what to look at, then one click per effect.
 * Analysis runs itself and is cached (● = instant). */
export function EffectsPanel() {
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const effectBusy = useStore((s) => s.effectBusy);
  const runEffect = useStore((s) => s.runEffect);
  const jobs = useStore(useShallow((s) => s.jobs.filter((j) => j.status === "running" || j.status === "queued")));
  const presets = useStore((s) => s.presets);
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId)));
  const applyPreset = useStore((s) => s.applyPreset);
  const applyPresetAuto = useStore((s) => s.applyPresetAuto);
  const layers = useStore(useShallow((s) => s.project?.renderLayers ?? []));
  const subjectPrompt = useStore((s) => s.subjectPrompt);
  const setSubjectPrompt = useStore((s) => s.setSubjectPrompt);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const promptPoints = useStore((s) => s.promptPoints);
  const promptBox = useStore((s) => s.promptBox);
  const clearPrompt = useStore((s) => s.clearPrompt);
  const deletePass = useStore((s) => s.deletePass);
  const visiblePassId = useStore((s) => s.visiblePassId);
  const setVisiblePass = useStore((s) => s.setVisiblePass);
  const [showCombos, setShowCombos] = useState(false);
  const [showPasses, setShowPasses] = useState(false);
  const [saveName, setSaveName] = useState("");

  const ready = asset?.status === "ready";
  const isVideo = asset?.type === "video";
  const readyPasses = passes.filter((p) => p.status === "ready");
  const readyTypes = new Set(readyPasses.map((p) => p.type));
  const stage = jobs[0]?.stage || jobs[0]?.type || "";
  const hasSelection = promptPoints.length > 0 || promptBox != null;

  const saveLook = async () => {
    const required = [...new Set(layers.flatMap((l) =>
      Object.values(l.sources).filter(Boolean).map((pid) =>
        readyPasses.find((p) => p.id === pid)?.type).filter(Boolean) as string[]))];
    await api.savePreset({
      name: saveName.trim(), description: "", category: "composite",
      requiredPassTypes: required,
      renderLayers: layers.map(({ id: _id, sources, ...rest }) => ({
        ...rest,
        sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => {
          const t = readyPasses.find((p) => p.id === v)?.type;
          return [k, t ? `$${t}` : null];
        })),
      })),
    });
    setSaveName("");
    useStore.setState({ presets: await api.listPresets() });
  };

  if (!ready) return <section className="panel grow" />;

  return (
    <section className="panel grow scroll">
      <h3>EFFECTS</h3>

      <div className="subject-row">
        <input
          value={subjectPrompt}
          onChange={(e) => setSubjectPrompt(e.target.value)}
          placeholder={'subject · try "bird"'}
          title="What the machine looks for — used by Objects, Cutout, Datamosh…"
        />
        <button
          className={tool === "click-prompt" ? "active" : ""}
          title="…or click the subject in the preview"
          onClick={() => setTool(tool === "click-prompt" ? "select" : "click-prompt")}
        >⌖</button>
        <button
          className={tool === "box-prompt" ? "active" : ""}
          title="…or drag a box around it"
          onClick={() => setTool(tool === "box-prompt" ? "select" : "box-prompt")}
        >▭</button>
        {hasSelection && <button title="clear selection" onClick={clearPrompt}>×</button>}
      </div>
      {tool !== "select" && (
        <div className="hint dim">
          {tool === "click-prompt" ? "click the subject in the preview" : "drag a box in the preview"}
        </div>
      )}

      {(["see", "style"] as const).map((g) => (
        <div className="fx-group" key={g}>
          <span className="group-label">{g === "see" ? "SEE" : "STYLE"}</span>
          <div className="fx-grid">
            {EFFECTS.filter((e) => e.group === g && (!e.videoOnly || isVideo)).map((e) => {
              const busy = effectBusy === e.id;
              const cached = e.ensure.every((t) => readyTypes.has(t));
              return (
                <button
                  key={e.id}
                  className={`fx-chip ${busy ? "busy" : ""}`}
                  disabled={effectBusy !== null}
                  onClick={() => runEffect(e)}
                  title={e.tagline}
                >
                  {busy ? <span className="fx-stage">{stage || "…"}</span> : e.label}
                  {cached && !busy && <span className="fx-cached">●</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="fx-group">
        <span className="group-label">
          COMBOS
          <button className="add" onClick={() => setShowCombos(!showCombos)}>{showCombos ? "×" : "+"}</button>
        </span>
        {showCombos && (
          <>
            <div className="fx-grid">
              {presets.map((p) => {
                const missing = p.requiredPassTypes.filter((t) => !readyTypes.has(t));
                return (
                  <button key={p.id} className="fx-chip" disabled={effectBusy !== null}
                          title={p.description}
                          onClick={() => (missing.length ? applyPresetAuto(p) : applyPreset(p))}>
                    {p.name}
                  </button>
                );
              })}
            </div>
            {layers.length > 0 && (
              <div className="seg-tools">
                <input value={saveName} placeholder="save stack as…"
                       onChange={(e) => setSaveName(e.target.value)} />
                <button className="go" disabled={!saveName.trim()} onClick={saveLook}>SAVE</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="fx-group">
        <span className="group-label">
          ANALYSIS · {readyPasses.length}
          <button className="add" onClick={() => setShowPasses(!showPasses)}>{showPasses ? "×" : "+"}</button>
        </span>
        {showPasses && (
          <ul className="pass-list">
            {passes.map((p) => (
              <li key={p.id} className={p.status}>
                <div className="pass-row">
                  <span className="tag">{TYPE_TAGS[p.type] ?? p.type.slice(0, 4).toUpperCase()}</span>
                  <span className="grow name">{p.name}</span>
                  {p.status === "ready" && (
                    <button className={visiblePassId === p.id ? "active" : ""} title="peek"
                            onClick={() => setVisiblePass(visiblePassId === p.id ? null : p.id)}>◉</button>
                  )}
                  {p.status !== "ready" && <span className="dim">{p.status}</span>}
                  <button title="delete" onClick={() => deletePass(p.id)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
