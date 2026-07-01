import { useEffect, useState } from "react";
import { AudioPanel } from "./components/AudioPanel";
import { ExportPanel } from "./components/ExportPanel";
import { JobsBar } from "./components/JobsBar";
import { LayersPanel } from "./components/LayersPanel";
import { MediaPanel } from "./components/MediaPanel";
import { ParamsPanel } from "./components/ParamsPanel";
import { PassesPanel } from "./components/PassesPanel";
import { PresetsPanel } from "./components/PresetsPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
import { useStore } from "./store";

type RightTab = "layer" | "audio" | "export";
type LeftTab = "passes" | "presets";

export default function App() {
  const boot = useStore((s) => s.boot);
  const refresh = useStore((s) => s.refresh);
  const project = useStore((s) => s.project);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const [rightTab, setRightTab] = useState<RightTab>("layer");
  const [leftTab, setLeftTab] = useState<LeftTab>("passes");

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

  return (
    <div className="app">
      <header>
        <span className="logo">MACHINE INDUSTRIES</span>
        <span className="dim">{project?.name ?? "…"}</span>
        <span className="dim right">machine.industries · v0.2</span>
      </header>
      <div className="cols">
        <aside className="left">
          <MediaPanel />
          <div className="tabs">
            <button className={leftTab === "passes" ? "active" : ""} onClick={() => setLeftTab("passes")}>PASSES</button>
            <button className={leftTab === "presets" ? "active" : ""} onClick={() => setLeftTab("presets")}>PRESETS</button>
          </div>
          {leftTab === "passes" ? <PassesPanel /> : <PresetsPanel />}
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
