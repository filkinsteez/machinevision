import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";

const TYPE_TAGS: Record<string, string> = {
  mask: "MSK", detection: "DET", tracking: "TRK", face_landmarks: "FACE",
  pose_landmarks: "POSE", hand_landmarks: "HAND", optical_flow: "FLOW", edge_matte: "EDGE",
};

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
  const [detectPrompt, setDetectPrompt] = useState("the subject");

  const ready = asset?.status === "ready";
  const hasPrompt = promptPoints.length > 0 || promptBox != null;

  return (
    <section className="panel grow">
      <h3>VISION PASSES</h3>
      {ready && (
        <div className="pass-generators">
          <div className="seg-tools">
            <button
              className={tool === "click-prompt" ? "active" : ""}
              onClick={() => setTool(tool === "click-prompt" ? "select" : "click-prompt")}
            >CLICK</button>
            <button
              className={tool === "box-prompt" ? "active" : ""}
              onClick={() => setTool(tool === "box-prompt" ? "select" : "box-prompt")}
            >BOX</button>
            <button disabled={!hasPrompt} onClick={runSegment} className="go">SEGMENT</button>
            {hasPrompt && <button onClick={clearPrompt}>×</button>}
          </div>
          {tool !== "select" && (
            <div className="hint dim">
              {tool === "click-prompt" ? "click subject in preview · shift-click = negative" : "drag a box in preview"}
            </div>
          )}
          <div className="seg-tools">
            <input
              value={detectPrompt}
              onChange={(e) => setDetectPrompt(e.target.value)}
              placeholder="bird, red jacket, all faces…"
              onKeyDown={(e) => e.key === "Enter" && runDetect(detectPrompt, 0.35)}
            />
            <button className="go" title="open-vocab detection boxes"
                    onClick={() => runDetect(detectPrompt, 0.35)}>DETECT</button>
            <button className="go" title="text-prompted segmentation mask"
                    onClick={() => runSegmentText(detectPrompt)}>MASK</button>
          </div>
          <div className="seg-tools wrap">
            <button onClick={() => runLandmarks("face")}>FACE</button>
            <button onClick={() => runLandmarks("pose")}>POSE</button>
            <button onClick={() => runLandmarks("hands")}>HANDS</button>
            {asset?.type === "video" && <button onClick={runFlow}>FLOW</button>}
          </div>
        </div>
      )}
      <ul className="pass-list">
        {passes.map((p) => (
          <li key={p.id} className={p.status}>
            <span className="tag">{TYPE_TAGS[p.type] ?? p.type.slice(0, 4).toUpperCase()}</span>
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
                <button
                  title="toggle visibility"
                  className={visiblePassId === p.id ? "active" : ""}
                  onClick={() => setVisiblePass(visiblePassId === p.id ? null : p.id)}
                >◉</button>
                {p.type === "mask" && (
                  <button title="derive edge matte" onClick={() => runEdgeMatte(p.id)}>EDG</button>
                )}
              </>
            )}
            <button title="delete" onClick={() => deletePass(p.id)}>✕</button>
          </li>
        ))}
        {!passes.length && <li className="dim empty">no passes yet — prompt the machine above</li>}
      </ul>
    </section>
  );
}
