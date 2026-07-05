import { useEffect, useRef, useState } from "react";
import { AudioPanel } from "./components/AudioPanel";
import { EffectsPanel } from "./components/EffectsPanel";
import { ExportPanel } from "./components/ExportPanel";
import { JobsBar } from "./components/JobsBar";
import { LayersPanel } from "./components/LayersPanel";
import { MediaPanel } from "./components/MediaPanel";
import { ParamsPanel } from "./components/ParamsPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
import { useStore } from "./store";

type RightTab = "layer" | "audio" | "export";

export default function App() {
  const boot = useStore((s) => s.boot);
  const refresh = useStore((s) => s.refresh);
  const upload = useStore((s) => s.upload);
  const project = useStore((s) => s.project);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const [rightTab, setRightTab] = useState<RightTab>("layer");
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => { boot().catch(console.error); }, [boot]);

  // poll while jobs are active; slow refresh otherwise
  useEffect(() => {
    const t = setInterval(() => {
      const s = useStore.getState();
      const busy = s.jobs.some((j) => j.status === "queued" || j.status === "running");
      const ingesting = s.assets.some((a) => a.status === "ingesting");
      if (busy || ingesting) refresh().catch(() => undefined);
    }, 1500);
    const slow = setInterval(() => refresh().catch(() => undefined), 8000);
    return () => { clearInterval(t); clearInterval(slow); };
  }, [refresh]);

  useEffect(() => { if (selectedLayerId) setRightTab("layer"); }, [selectedLayerId]);

  // drop media anywhere in the window
  useEffect(() => {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDropping(true);
    };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(dragDepth.current - 1, 0);
      if (dragDepth.current === 0) setDropping(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDropping(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) upload(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [upload]);

  return (
    <div className="app">
      {dropping && <div className="drop-overlay">DROP TO UPLOAD</div>}
      <header>
        <span className="logo">MACHINE INDUSTRIES</span>
        <span className="dim">{project?.name ?? "…"}</span>
        <span className="dim right">machine.industries · v0.2</span>
      </header>
      <div className="cols">
        <aside className="left">
          <MediaPanel />
          <EffectsPanel />
        </aside>
        <main>
          <PreviewCanvas />
          <Timeline />
          <JobsBar />
        </main>
        <aside className="right">
          <LayersPanel />
          <div className="tabs">
            <button className={rightTab === "layer" ? "active" : ""} onClick={() => setRightTab("layer")}>CONTROLS</button>
            <button className={rightTab === "audio" ? "active" : ""} onClick={() => setRightTab("audio")}>AUDIO</button>
            <button className={rightTab === "export" ? "active" : ""} onClick={() => setRightTab("export")}>EXPORT</button>
          </div>
          {rightTab === "layer" ? <ParamsPanel /> : rightTab === "audio" ? <AudioPanel /> : <ExportPanel />}
        </aside>
      </div>
    </div>
  );
}
