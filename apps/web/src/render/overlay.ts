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
    else if (layer.type === "gaze_overlay") drawGaze(ctx, layer, frame, w, h);
    else if (layer.type === "metadata_typography") drawMetadata(ctx, layer, passes, frame, w, h);
  }
}

// ---------------------------------------------------------------------- gaze
// Derived live from the face pass's iris landmarks (points 468-477 of the
// 478-point mesh) — real model output, not decoration.
const EYES = [
  { iris: 468, corners: [33, 133], lids: [159, 145] },   // camera-left eye
  { iris: 473, corners: [362, 263], lids: [386, 374] },  // camera-right eye
] as const;

function gazeForEntity(pts: number[][], w: number, h: number, back: number,
                       data: PassData, frame: number, entIdx: number) {
  // average the iris offset over the last `back` frames for stability
  const samples: { ox: number; oy: number; cx: number; cy: number; scale: number }[] = [];
  for (let f = frame; f > frame - 1 - back && f >= 0; f--) {
    const e = frameEntry(data, f);
    const p = e?.entities?.[entIdx]?.points;
    if (!p || p.length < 478) continue;
    for (const eye of EYES) {
      const [a, b] = eye.corners.map((i) => [p[i][0] * w, p[i][1] * h]);
      const [u, d] = eye.lids.map((i) => [p[i][0] * w, p[i][1] * h]);
      const iris = [p[eye.iris][0] * w, p[eye.iris][1] * h];
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const ew = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const eh = Math.max(Math.hypot(d[0] - u[0], d[1] - u[1]), ew * 0.35);
      samples.push({
        ox: (iris[0] - cx) / Math.max(ew, 1e-3),
        oy: (iris[1] - (u[1] + d[1]) / 2) / Math.max(eh, 1e-3),
        cx, cy, scale: ew,
      });
    }
  }
  if (!samples.length) return null;
  const avg = (k: "ox" | "oy" | "cx" | "cy" | "scale") =>
    samples.reduce((s, v) => s + v[k], 0) / samples.length;
  // current-frame eye anchors (not smoothed) so the origin tracks the face
  const cur = frameEntry(data, frame)?.entities?.[entIdx]?.points;
  const anchors = cur && cur.length >= 478
    ? EYES.map((eye) => {
        const [a, b] = eye.corners.map((i) => [cur[i][0] * w, cur[i][1] * h]);
        return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
      })
    : [{ x: avg("cx"), y: avg("cy") }];
  return { ox: avg("ox"), oy: avg("oy"), scale: avg("scale"), anchors };
}

function drawGaze(ctx: CanvasRenderingContext2D, layer: RenderLayer,
                  frame: number, w: number, h: number) {
  const passId = layer.sources.landmarks;
  if (!passId) return;
  const data = getPassJSON(passId);
  if (!data) return;
  const entry = frameEntry(data, frame);
  if (!entry?.entities?.length) return;
  const p = layer.params;
  const color = String(p.color ?? "#00C853");
  const lw = Number(p.lineWidth ?? 1.2);
  const lengthMul = Number(p.length ?? 6);
  const style = String(p.style ?? "rays");
  const smooth = Number(p.smooth ?? 3);
  const showAngle = p.showAngle !== false;

  ctx.globalAlpha = layer.blend.opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.font = MONO;

  entry.entities.forEach((ent, ei) => {
    if (!ent.points || ent.points.length < 478) return;
    const g = gazeForEntity(ent.points, w, h, smooth, data, frame, ei);
    if (!g) return;
    // amplify subtle iris offsets into a readable direction
    const dx = g.ox * 3.2, dy = g.oy * 4.0;
    const len = g.scale * lengthMul;
    const tips: { x: number; y: number }[] = [];
    for (const a of g.anchors) {
      const tx = a.x + dx * len, ty = a.y + dy * len;
      tips.push({ x: tx, y: ty });
      if (style !== "reticle") {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(a.x, a.y, lw * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (style !== "rays" && tips.length) {
      const rx = tips.reduce((s, t) => s + t.x, 0) / tips.length;
      const ry = tips.reduce((s, t) => s + t.y, 0) / tips.length;
      const r = Math.max(g.scale * 0.35, 6);
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - r * 1.5, ry); ctx.lineTo(rx + r * 1.5, ry);
      ctx.moveTo(rx, ry - r * 1.5); ctx.lineTo(rx, ry + r * 1.5);
      ctx.stroke();
    }
    if (showAngle) {
      const yaw = Math.atan2(dx, 1) * (180 / Math.PI);
      const pitch = -Math.atan2(dy, 1) * (180 / Math.PI);
      const a0 = g.anchors[0];
      ctx.fillText(`GAZE ${yaw >= 0 ? "+" : ""}${yaw.toFixed(0)}° ${pitch >= 0 ? "+" : ""}${pitch.toFixed(0)}°`,
                   a0.x + 8, a0.y - g.scale * 0.9);
    }
  });
  ctx.globalAlpha = 1;
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
  const labelColor = String(p.labelColor ?? color);
  const fontSize = Number(p.fontSize ?? 10);
  const lineWidth = Number(p.lineWidth ?? 1);
  const threshold = Number(p.threshold ?? 0.5);
  const boxStyle = String(p.boxStyle ?? "brackets");
  const showLabel = p.showLabel !== false;
  const numbered = String(p.labelFormat ?? "label") === "numbered";
  ctx.globalAlpha = layer.blend.opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.font = `${fontSize}px Consolas, monospace`;
  let visIdx = 0;
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
    const bits: string[] = [];
    if (showLabel) bits.push(numbered ? `${visIdx}. ${d.label.toLowerCase()}` : d.label);
    if (p.showTrackId && d.trackId) bits.push(d.trackId.replace("track_", "#"));
    if (p.showConfidence && d.confidence != null) bits.push(d.confidence.toFixed(2));
    visIdx++;
    if (bits.length) {
      const text = bits.join(" ");
      if (p.labelBackground) {
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(x - 1, y - fontSize - 5, tw + 4, fontSize + 4);
      }
      ctx.fillStyle = labelColor;
      ctx.fillText(text, x + 1, y - 4);
    }
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
