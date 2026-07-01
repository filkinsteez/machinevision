import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";

const TYPE_TAGS: Record<string, string> = {
  mask: "MSK", detection: "DET", tracking: "TRK", face_landmarks: "FACE",
  pose_landmarks: "POSE", hand_landmarks: "HAND", optical_flow: "FLOW", edge_matte: "EDGE",
  body_parts: "PART", depth: "DPTH", normals: "NRML",
};

// full names for the tag tooltip (the 4-letter tags stay for the instrument look)
const TYPE_NAMES: Record<string, string> = {
  mask: "Mask (cutout of a subject)", detection: "Detections (labeled boxes)",
  tracking: "Object tracking", face_landmarks: "Face mesh", pose_landmarks: "Body pose",
  hand_landmarks: "Hand landmarks", optical_flow: "Motion (optical flow)",
  edge_matte: "Edge outline", body_parts: "Body parts (Sapiens)",
  depth: "Depth (Sapiens)", normals: "Surface normals (Sapiens)",
};

// common Sapiens parts for the quick derive-to-mask picker (id -> label)
const QUICK_PARTS: [number, string][] = [
  [3, "Hair"], [2, "Face/Neck"], [21, "Torso"], [22, "Upper Clothing"],
  [12, "Lower Clothing"], [10, "L Up Arm"], [19, "R Up Arm"], [6, "L Lo Arm"],
  [15, "R Lo Arm"], [5, "L Hand"], [14, "R Hand"], [11, "L Up Leg"], [20, "R Up Leg"],
];

export function PassesPanel() {
  const passes = useStore(useShallow((s) => s.passes.filter((p) => p.assetId === s.selectedAssetId)));
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const promptPoints = useStore((s) => s.promptPoints);
  const promptBox = useStore((s) => s.promptBox);
  const clearPrompt = useStore((s) => s.clearPrompt);
  const runSegment = useStore((s) => s.runSegment);
  const runSegmentText = useStore((s) => s.runSegmentText);
  const runDetect = useStore((s) => s.runDetect);
  const runLandmarks = useStore((s) => s.runLandmarks);
  const runFlow = useStore((s) => s.runFlow);
  const runEdgeMatte = useStore((s) => s.runEdgeMatte);
  const deletePass = useStore((s) => s.deletePass);
  const visiblePassId = useStore((s) => s.visiblePassId);
  const setVisiblePass = useStore((s) => s.setVisiblePass);
  const addLayerForPass = useStore((s) => s.addLayerForPass);
  const runSapiens = useStore((s) => s.runSapiens);
  const runBodyPartMask = useStore((s) => s.runBodyPartMask);
  const [detectPrompt, setDetectPrompt] = useState("the subject");
  const [partPicker, setPartPicker] = useState<string | null>(null);
  const [pickedParts, setPickedParts] = useState<number[]>([3]);

  const ready = asset?.status === "ready";
  const hasPrompt = promptPoints.length > 0 || promptBox != null;
  const readyPasses = passes.filter((p) => p.status === "ready");

  return (
    <section className="panel grow">
      <h3>1 · ANALYZE</h3>
      <div className="dim desc">Run a model over the media. Results ("passes") feed the effect layers on the right.</div>
      {ready && (
        <div className="pass-generators">
          <div className="gen-group">
            <span className="group-label">SELECT A SUBJECT</span>
            <div className="seg-tools">
              <button
                className={tool === "click-prompt" ? "active" : ""}
                title="Click the subject in the preview to select it"
                onClick={() => setTool(tool === "click-prompt" ? "select" : "click-prompt")}
              >Click</button>
              <button
                className={tool === "box-prompt" ? "active" : ""}
                title="Drag a box around the subject in the preview"
                onClick={() => setTool(tool === "box-prompt" ? "select" : "box-prompt")}
              >Box</button>
              <button disabled={!hasPrompt} onClick={runSegment} className="go"
                      title={hasPrompt ? "Make a mask from your selection" : "Select a subject first"}>Make mask</button>
              {hasPrompt && <button title="clear selection" onClick={clearPrompt}>×</button>}
            </div>
            <div className="hint dim">
              {tool === "click-prompt" ? "Click the subject in the preview · shift-click to exclude"
                : tool === "box-prompt" ? "Drag a box around the subject in the preview"
                : "Pick Click or Box, mark the subject in the preview, then Make mask."}
            </div>
          </div>

          <div className="gen-group">
            <span className="group-label">FIND BY WORDS</span>
            <div className="seg-tools">
              <input
                value={detectPrompt}
                onChange={(e) => setDetectPrompt(e.target.value)}
                placeholder="bird, red jacket, all faces…"
                onKeyDown={(e) => e.key === "Enter" && runDetect(detectPrompt, 0.35)}
              />
            </div>
            <div className="seg-tools">
              <button className="go" title="Detect labeled boxes for what you typed"
                      onClick={() => runDetect(detectPrompt, 0.35)}>Find boxes</button>
              <button className="go" title="Make a mask of what you typed"
                      onClick={() => runSegmentText(detectPrompt)}>Mask it</button>
            </div>
          </div>

          <div className="gen-group">
            <span className="group-label">BODY &amp; MOTION</span>
            <div className="seg-tools wrap">
              <button title="Face mesh landmarks" onClick={() => runLandmarks("face")}>Face</button>
              <button title="Body pose skeleton" onClick={() => runLandmarks("pose")}>Pose</button>
              <button title="Hand landmarks" onClick={() => runLandmarks("hands")}>Hands</button>
              {asset?.type === "video" && <button title="Motion / optical flow (video)" onClick={runFlow}>Motion</button>}
            </div>
          </div>

          <div className="gen-group">
            <span className="group-label">PEOPLE · SAPIENS</span>
            <div className="seg-tools wrap">
              <button title="28-class body-part segmentation" onClick={() => runSapiens("body_parts")}>Body parts</button>
              <button title="Human-centric depth map" onClick={() => runSapiens("depth")}>Depth</button>
              <button title="Surface normals" onClick={() => runSapiens("normals")}>Normals</button>
            </div>
            <div className="hint dim">Needs a person in the frame.</div>
          </div>
        </div>
      )}

      {readyPasses.length > 0 && (
        <div className="pass-legend dim">
          <b>+ LAYER</b> adds a tunable, exportable effect · <b>VIEW</b> is a quick peek
        </div>
      )}

      <ul className="pass-list">
        {passes.map((p) => (
          <li key={p.id} className={p.status}>
            <div className="pass-row">
              <span className="tag" title={TYPE_NAMES[p.type] ?? p.type}>{TYPE_TAGS[p.type] ?? p.type.slice(0, 4).toUpperCase()}</span>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="dim">
                  {p.status === "ready"
                    ? Object.entries(p.summary).map(([k, v]) => `${k} ${v}`).join(" · ")
                    : p.status === "failed" ? (p.error ?? "failed") : p.status}
                </div>
              </div>
              {p.status === "ready" && (
                <>
                  {p.type !== "tracking" && (
                    <button
                      className="go"
                      title="Add a render layer from this pass — style and export it on the right"
                      onClick={() => addLayerForPass(p)}
                    >+ LAYER</button>
                  )}
                  <button
                    title="Quick peek at this pass (not styled, not exported)"
                    className={visiblePassId === p.id ? "active" : ""}
                    onClick={() => setVisiblePass(visiblePassId === p.id ? null : p.id)}
                  >VIEW</button>
                  {p.type === "mask" && (
                    <button title="Derive an edge-outline pass from this mask" onClick={() => runEdgeMatte(p.id)}>→ Edge</button>
                  )}
                  {p.type === "body_parts" && (
                    <button
                      title="Make a mask from selected body parts (feeds datamosh, pixel sort…)"
                      className={partPicker === p.id ? "active" : ""}
                      onClick={() => setPartPicker(partPicker === p.id ? null : p.id)}
                    >→ Mask</button>
                  )}
                </>
              )}
              <button title="delete pass" onClick={() => deletePass(p.id)}>✕</button>
            </div>
            {partPicker === p.id && (
              <div className="part-picker">
                <div className="chips">
                  {QUICK_PARTS.map(([id, label]) => (
                    <button
                      key={id}
                      className={pickedParts.includes(id) ? "active" : ""}
                      onClick={() => setPickedParts((cur) =>
                        cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}
                    >{label}</button>
                  ))}
                </div>
                <button
                  className="go wide"
                  disabled={!pickedParts.length}
                  onClick={() => { runBodyPartMask(p.id, pickedParts); setPartPicker(null); }}
                >MAKE MASK ({pickedParts.length} part{pickedParts.length === 1 ? "" : "s"})</button>
              </div>
            )}
          </li>
        ))}
        {ready && !passes.length && (
          <li className="dim empty">No passes yet. Select a subject and Make mask, type what to Find, or try Pose.</li>
        )}
        {!ready && <li className="dim empty">Upload media to start analyzing.</li>}
      </ul>
    </section>
  );
}
