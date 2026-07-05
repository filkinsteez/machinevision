/** Frame-accurate browser bake: seek each frame, render GL + overlay, upload
 * PNGs to a server frame session, finalize into a video (or single image). */
import { api } from "../api";
import type { Asset, RenderLayer, VisionPass } from "../types";
import type { AudioFrame } from "./audio";
import type { Compositor } from "./compositor";
import { drawOverlays } from "./overlay";

export async function bakeExport(opts: {
  asset: Asset;
  projectId: string;
  video: HTMLVideoElement | null;
  imageBitmap: ImageBitmap | null;
  compositor: Compositor;
  layers: RenderLayer[];
  passes: VisionPass[];
  audioFrames?: AudioFrame[];
  onProgress: (f: number) => void;
}): Promise<string> {
  const { asset, projectId, video, imageBitmap, compositor, layers, passes, audioFrames, onProgress } = opts;
  const w = compositor.width;
  const h = compositor.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = w;
  overlayCanvas.height = h;
  const octx = overlayCanvas.getContext("2d")!;

  const { sessionId } = await api.createFrameSession();
  const fps = asset.fps ?? 30;
  const frameCount = asset.type === "video" ? (asset.frameCount ?? 1) : 1;

  const seekTo = (frame: number) =>
    new Promise<void>((resolve) => {
      if (!video) return resolve();
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = Math.min((frame + 0.5) / fps, video.duration - 0.001);
    });

  compositor.resetFeedback();
  for (let f = 0; f < frameCount; f++) {
    await seekTo(f);
    const source: TexImageSource | null = video ?? imageBitmap;
    if (!source) throw new Error("no frame source");
    // wait for mask/flow textures to be available for this frame (best effort)
    await new Promise((r) => setTimeout(r, f === 0 ? 200 : 0));
    compositor.render(source, layers, f, video ?? undefined, audioFrames?.[f]);
    drawOverlays(octx, layers, passes, f, w, h);
    ctx.drawImage(compositor.canvas, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
    // transient network hiccups over hundreds of uploads shouldn't kill a bake
    let attempt = 0;
    for (;;) {
      try {
        await api.uploadBakeFrame(sessionId, f, blob);
        break;
      } catch (e) {
        if (++attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    onProgress((f + 1) / frameCount);
  }
  const r = await api.finalizeBake(sessionId, projectId, fps, asset.type === "video" ? "video" : "image", asset.id);
  return r.export.id;
}
