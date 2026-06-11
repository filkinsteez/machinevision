/** Canvas2D overlay pass: object labels, landmark meshes, metadata typography.
 * Drawn above the GL composite each frame from normalized pass JSON. */
import type { PassData, RenderLayer, VisionPass } from "../types";
import { frameEntry, getPassJSON } from "./passData";

const MONO = '11px "Consolas", "Cascadia Mono", monospace';

function hashf(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1103515245;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  layers: RenderLayer[],
  passes: VisionPass[],
  frame: number,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  for (const layer of layers) {
    if (!layer.enabled) continue;
    if (layer.type === "object_labels") drawLabels(ctx, layer, frame, w, h);
    else if (layer.type === "landmark_overlay") drawLandmarks(ctx, layer, frame, w, h);
    else if (layer.type === "metadata_typography") drawMetadata(ctx, layer, passes, frame, w, h);
  }
}

function drawLabels(ctx: CanvasRenderingContext2D, layer: RenderLayer,
                    frame: number, w: number, h: number) {
  const passId = layer.sources.detection;
  if (!passId) return;
  const data = getPassJSON(passId);
  if (!data) return;
  const entry = frameEntry(data, frame);
  if (!entry?.detections) return;
  const p = layer.params;
  const color = String(p.color ?? "#FF5A00");
  const fontSize = Number(p.fontSize ?? 10);
  const threshold = Number(p.threshold ?? 0.5);
  const boxStyle = String(p.boxStyle ?? "brackets");
  ctx.globalAlpha = layer.blend.opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.font = `${fontSize}px Consolas, monospace`;
  for (const d of entry.detections) {
    if ((d.confidence ?? 1) < threshold) continue;
    const x = d.bbox[0] * w, y = d.bbox[1] * h;
    const bw = (d.bbox[2] - d.bbox[0]) * w, bh = (d.bbox[3] - d.bbox[1]) * h;
    if (boxStyle === "box") {
      ctx.strokeRect(x, y, bw, bh);
    } else if (boxStyle === "brackets") {
      const s = Math.min(bw, bh) * 0.18;
      ctx.beginPath();
      ctx.moveTo(x, y + s); ctx.lineTo(x, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x + bw - s, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + s);
      ctx.moveTo(x + bw, y + bh - s); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw - s, y + bh);
      ctx.moveTo(x + s, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, y + bh - s);
      ctx.stroke();
    }
    const bits = [d.label];
    if (p.showTrackId && d.trackId) bits.push(d.trackId.replace("track_", "#"));
    if (p.showConfidence && d.confidence != null) bits.push(d.confidence.toFixed(2));
    ctx.fillText(bits.join(" "), x, y - 3);
  }
  ctx.globalAlpha = 1;
}

function drawLandmarks(ctx: CanvasRenderingContext2D, layer: RenderLayer,
                       frame: number, w: number, h: number) {
  const passId = layer.sources.landmarks;
  if (!passId) return;
  const data = getPassJSON(passId);
  if (!data) return;
  const p = layer.params;
  const color = String(p.color ?? "#EAEAEA");
  const style = String(p.style ?? "wireframe");
  const lw = Number(p.lineWidth ?? 0.7);
  const ps = Number(p.pointSize ?? 0);
  const dropout = Number(p.dropout ?? 0);
  const seed = Number(p.seed ?? 42);
  const trail = Number(p.trail ?? 0);

  const drawFrame = (f: number, alpha: number) => {
    const entry = frameEntry(data, f);
    if (!entry?.entities) return;
    ctx.globalAlpha = alpha * layer.blend.opacity;
    for (const ent of entry.entities) {
      const pts = ent.points;
      if ((style === "wireframe" || style === "skeleton") && data.connections) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let ci = 0; ci < data.connections.length; ci++) {
          if (dropout > 0 && hashf(ci, f, seed) < dropout) continue;
          const [a, b] = data.connections[ci];
          if (a >= pts.length || b >= pts.length) continue;
          ctx.moveTo(pts[a][0] * w, pts[a][1] * h);
          ctx.lineTo(pts[b][0] * w, pts[b][1] * h);
        }
        ctx.stroke();
      }
      if (ps > 0 || style === "points") {
        ctx.fillStyle = color;
        const r = Math.max(ps, style === "points" ? 1.5 : ps);
        for (let i = 0; i < pts.length; i++) {
          if (dropout > 0 && hashf(i + 9000, f, seed) < dropout) continue;
          ctx.fillRect(pts[i][0] * w - r / 2, pts[i][1] * h - r / 2, r, r);
        }
      }
    }
  };

  if (trail > 0) {
    for (let t = trail; t > 0; t--) {
      const f = frame - t;
      if (f >= 0) drawFrame(f, 0.5 * (1 - t / (trail + 1)));
    }
  }
  drawFrame(frame, 1);
  ctx.globalAlpha = 1;
}

function drawMetadata(ctx: CanvasRenderingContext2D, layer: RenderLayer,
                      passes: VisionPass[], frame: number, w: number, h: number) {
  const p = layer.params;
  const fields = (Array.isArray(p.fields) ? p.fields : ["frame", "pass"]) as string[];
  const fontSize = Number(p.fontSize ?? 11);
  const color = String(p.color ?? "#EAEAEA");
  const anchor = String(p.anchor ?? "bottom-left");

  const lines: string[] = [];
  const maskPass = layer.sources.mask ? passes.find((x) => x.id === layer.sources.mask) : null;
  const detPass = layer.sources.detection ? passes.find((x) => x.id === layer.sources.detection) : null;
  const flowPass = layer.sources.flow ? passes.find((x) => x.id === layer.sources.flow) : null;

  for (const f of fields) {
    if (f === "frame") lines.push(`FRAME ${String(frame).padStart(6, "0")}`);
    if (f === "pass" && maskPass) lines.push(`PASS ${maskPass.name.toUpperCase()}`);
    if (f === "provider" && maskPass) lines.push(`MODEL ${maskPass.providerVersion || maskPass.provider}`);
    if (f === "confidence" && maskPass) {
      const data = getPassJSON(maskPass.id);
      const e = data ? frameEntry(data as PassData, frame) : null;
      if (e?.confidence != null) lines.push(`CONF ${e.confidence.toFixed(3)}`);
    }
    if (f === "area" && maskPass) {
      const data = getPassJSON(maskPass.id);
      const e = data ? frameEntry(data as PassData, frame) : null;
      if (e?.area != null) lines.push(`AREA ${(e.area * 100).toFixed(1)}%`);
    }
    if (f === "count" && detPass) {
      const data = getPassJSON(detPass.id);
      const e = data ? frameEntry(data as PassData, frame) : null;
      if (e?.detections) lines.push(`DET ${e.detections.length}`);
    }
    if (f === "motion" && flowPass) {
      const data = getPassJSON(flowPass.id);
      const e = data ? frameEntry(data as PassData, frame) : null;
      if (e?.meanMag != null) lines.push(`MOTION ${e.meanMag.toFixed(2)}px`);
    }
  }
  if (!lines.length) return;

  ctx.globalAlpha = layer.blend.opacity;
  ctx.font = `${fontSize}px Consolas, monospace`;
  ctx.fillStyle = color;
  const pad = 10;
  const lineH = fontSize + 4;
  const top = anchor.startsWith("top");
  const left = anchor.endsWith("left");
  ctx.textAlign = left ? "left" : "right";
  const x = left ? pad : w - pad;
  lines.forEach((line, i) => {
    const y = top ? pad + fontSize + i * lineH : h - pad - (lines.length - 1 - i) * lineH;
    ctx.fillText(line, x, y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

export { MONO };
