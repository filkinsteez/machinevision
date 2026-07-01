import { useEffect, useRef, useState } from "react";
import { Compositor } from "../render/compositor";
import { drawOverlays } from "../render/overlay";
import { bakeExport } from "../render/bake";
import { analyzeAudioOffline, audioEngine, ZERO_AUDIO, type AudioFrame } from "../render/audio";
import { useStore } from "../store";
import type { RenderLayer, VisionPass } from "../types";

/** Shared handle so Timeline / ExportPanel can drive playback without prop drilling. */
export const previewController: {
  video: HTMLVideoElement | null;
  seek: (frame: number) => void;
  play: () => void;
  pause: () => void;
} = {
  video: null,
  seek(frame) {
    const v = this.video;
    const fps = useStore.getState().assets.find(
      (a) => a.id === useStore.getState().selectedAssetId)?.fps ?? 30;
    if (v) v.currentTime = Math.min((frame + 0.5) / fps, Math.max(v.duration - 0.001, 0));
    useStore.getState().setFrame(frame);
  },
  play() { audioEngine.resume(); this.video?.play(); useStore.getState().setPlaying(true); },
  pause() { this.video?.pause(); useStore.getState().setPlaying(false); },
};

/** Implicit visualization layer when a pass's eye toggle is on. */
function passVizLayer(p: VisionPass): RenderLayer | null {
  const base = { id: `viz_${p.id}`, name: "viz", enabled: true, blend: { mode: "normal", opacity: 1 } };
  if (p.type === "mask" || p.type === "edge_matte") {
    return { ...base, type: "matte_view", sources: { mask: p.id },
             params: { mode: "tint", color: "#00C853", amount: 0.45, invert: false } };
  }
  if (p.type === "detection") {
    return { ...base, type: "object_labels", sources: { detection: p.id },
             params: { boxStyle: "brackets", showConfidence: true, showTrackId: true,
                       threshold: 0.3, fontSize: 10, color: "#00C853" } };
  }
  if (p.type.endsWith("_landmarks")) {
    return { ...base, type: "landmark_overlay", sources: { landmarks: p.id },
             params: { style: "wireframe", lineWidth: 0.6, pointSize: 1, color: "#00C853",
                       dropout: 0, trail: 0, seed: 1 } };
  }
  return null;
}

export function PreviewCanvas() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const compRef = useRef<Compositor | null>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const boxDrag = useRef<{ x: number; y: number } | null>(null);

  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const tool = useStore((s) => s.tool);
  const [glEpoch, setGlEpoch] = useState(0);
  const assetKey = asset?.status === "ready" ? `${asset.id}` : null;

  // recover from GPU resets: rebuild the whole pipeline on context loss
  useEffect(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    const onLost = (e: Event) => {
      e.preventDefault();
      console.warn("WebGL context lost — rebuilding compositor");
      setTimeout(() => setGlEpoch((n) => n + 1), 500);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [assetKey, glEpoch]);

  // (re)build pipeline when the selected ready asset changes
  useEffect(() => {
    if (!asset || asset.status !== "ready" || !asset.proxyUrl || !glRef.current) return;
    const w = asset.proxyWidth ?? 960;
    const h = asset.proxyHeight ?? 540;
    compRef.current?.dispose();
    compRef.current = new Compositor(glRef.current, w, h);
    if (ovRef.current) { ovRef.current.width = w; ovRef.current.height = h; }
    imageRef.current = null;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    videoRef.current = null;
    previewController.video = null;

    if (asset.type === "video") {
      const v = document.createElement("video");
      v.src = asset.proxyUrl;
      v.muted = useStore.getState().muted;
      v.playsInline = true;
      v.preload = "auto";
      videoRef.current = v;
      previewController.video = v;
      (window as { __mvVideo?: HTMLVideoElement }).__mvVideo = v;
      (window as { __mvAudio?: typeof audioEngine }).__mvAudio = audioEngine;
      audioEngine.attach(v);
      v.addEventListener("ended", () => useStore.getState().setPlaying(false));
    } else {
      fetch(asset.proxyUrl).then((r) => r.blob()).then(createImageBitmap)
        .then((bmp) => { imageRef.current = bmp; });
    }
    useStore.getState().setFrame(0);
    useStore.getState().setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey, glEpoch]);

  // render loop
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = useStore.getState();
      const comp = compRef.current;
      const a = s.assets.find((x) => x.id === s.selectedAssetId);
      if (!comp || !a || a.status !== "ready") return;
      if (document.hidden || comp.gl.isContextLost()) return;
      const v = videoRef.current;
      const source: TexImageSource | null =
        a.type === "video" ? (v && v.readyState >= 2 ? v : null) : imageRef.current;
      if (!source) return;
      const fps = a.fps ?? 30;
      const frame = a.type === "video" && v
        ? Math.min(Math.floor(v.currentTime * fps), (a.frameCount ?? 1) - 1)
        : 0;
      if (frame !== s.currentFrame && s.playing) s.setFrame(frame);
      const layers = [...(s.project?.renderLayers ?? [])];
      const viz = s.visiblePassId
        ? passVizLayer(s.passes.find((p) => p.id === s.visiblePassId) as VisionPass)
        : null;
      if (viz) layers.push(viz);
      const audioCfg = s.audioConfig();
      const audio: AudioFrame =
        audioCfg.enabled && a.type === "video" ? audioEngine.sample(audioCfg) : ZERO_AUDIO;
      try {
        comp.render(source, layers, frame, v ?? undefined, audio);
      } catch (e) { console.error(e); }
      const octx = ovRef.current?.getContext("2d");
      if (octx && ovRef.current) {
        drawOverlays(octx, layers, s.passes, frame, ovRef.current.width, ovRef.current.height);
        drawPromptMarkers(octx, ovRef.current.width, ovRef.current.height);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // bake trigger
  useEffect(() => {
    const onBake = async () => {
      const s = useStore.getState();
      const a = s.assets.find((x) => x.id === s.selectedAssetId);
      if (!a || !compRef.current || !s.project) return;
      previewController.pause();
      s.setBaking({ active: true, progress: 0 });
      try {
        const audioCfg = s.audioConfig();
        let audioFrames: AudioFrame[] | undefined;
        if (audioCfg.enabled && a.type === "video" && a.proxyUrl) {
          const fps = a.fps ?? 30;
          const frameCount = a.frameCount ?? 1;
          audioFrames = await analyzeAudioOffline(a.proxyUrl, fps, frameCount, audioCfg);
        }
        await bakeExport({
          asset: a, projectId: s.project.id, video: videoRef.current,
          imageBitmap: imageRef.current, compositor: compRef.current,
          layers: s.project.renderLayers, passes: s.passes, audioFrames,
          onProgress: (f) => useStore.getState().setBaking({ active: true, progress: f }),
        });
        await s.refresh();
      } catch (e) {
        s.setError(String(e));
      } finally {
        useStore.getState().setBaking(null);
      }
    };
    window.addEventListener("mv-bake", onBake);
    return () => window.removeEventListener("mv-bake", onBake);
  }, []);

  function drawPromptMarkers(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const s = useStore.getState();
    for (const p of s.promptPoints) {
      ctx.strokeStyle = p.positive ? "#FF5A00" : "#D32F2F";
      ctx.lineWidth = 1.5;
      const x = p.x * w, y = p.y * h;
      ctx.beginPath();
      ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
      ctx.stroke();
      ctx.strokeRect(x - 4, y - 4, 8, 8);
    }
    if (s.promptBox) {
      const [bx, by, bw, bh] = s.promptBox;
      ctx.strokeStyle = "#FF5A00";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(bx * w, by * h, bw * w, bh * h);
      ctx.setLineDash([]);
    }
  }

  function normPos(e: React.PointerEvent): { x: number; y: number } {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const s = useStore.getState();
    if (s.tool === "click-prompt") {
      const { x, y } = normPos(e);
      s.addPromptPoint({ x, y, positive: !e.shiftKey });
    } else if (s.tool === "box-prompt") {
      boxDrag.current = normPos(e);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (boxDrag.current && useStore.getState().tool === "box-prompt") {
      const { x, y } = normPos(e);
      const sx = Math.min(boxDrag.current.x, x), sy = Math.min(boxDrag.current.y, y);
      useStore.getState().setPromptBox([sx, sy, Math.abs(x - boxDrag.current.x), Math.abs(y - boxDrag.current.y)]);
    }
  };
  const onPointerUp = () => { boxDrag.current = null; };

  if (!asset) {
    return (
      <div className="preview-empty">
        <div className="onboard-title">MACHINE INDUSTRIES</div>
        <div className="onboard-sub">Render what the machine sees.</div>
        <ol className="onboard-steps">
          <li><b>1 · Upload</b> an image or video (drop it in the Media panel, left)</li>
          <li><b>2 · Analyze</b> — run a pass: mask, pose, depth, motion…</li>
          <li><b>3 · Add a layer</b> that reads the pass, tune it, and export</li>
        </ol>
        <div className="onboard-tip dim">New here? Open <b>PRESETS ★</b> — one click generates everything and builds the look.</div>
      </div>
    );
  }
  if (asset.status === "ingesting") {
    return <div className="preview-empty">PROCESSING UPLOAD…<span className="dim">{asset.name} · analyzing metadata &amp; building preview</span></div>;
  }
  if (asset.status === "failed") {
    return <div className="preview-empty err">INGEST FAILED<span className="dim">{asset.error}</span></div>;
  }

  return (
    <div className="preview-stage" data-tool={tool}>
      <div className="preview-frame">
        <canvas ref={glRef} className="gl-canvas" />
        <canvas
          ref={ovRef}
          className="overlay-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  );
}
