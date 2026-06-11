/** Manages the pixel-sort worker: throttled per-layer requests against the
 * source frame, results cached as ImageBitmaps for the compositor. */
import type { RenderLayer } from "../types";
import { getMaskBitmap } from "./passData";

const MAX_W = 480;

interface Slot {
  bitmap: ImageBitmap | null;
  frame: number;
  paramsKey: string;
  inFlight: boolean;
  lastRequest: number;
}

export class PixelSortManager {
  private worker: Worker;
  private slots = new Map<string, Slot>();
  private pending = new Map<number, { layerId: string; frame: number; paramsKey: string }>();
  private reqId = 0;
  private scratch = document.createElement("canvas");
  private maskScratch = document.createElement("canvas");

  constructor() {
    this.worker = new Worker(new URL("./pixelsort.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev) => {
      const { id, width, height, pixels } = ev.data as
        { id: number; width: number; height: number; pixels: ArrayBuffer };
      const meta = this.pending.get(id);
      this.pending.delete(id);
      if (!meta) return;
      const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
      createImageBitmap(imageData).then((bmp) => {
        const slot = this.slots.get(meta.layerId);
        if (slot) {
          slot.bitmap?.close();
          slot.bitmap = bmp;
          slot.frame = meta.frame;
          slot.paramsKey = meta.paramsKey;
          slot.inFlight = false;
        }
      });
    };
  }

  result(layer: RenderLayer, _frame: number): ImageBitmap | null {
    return this.slots.get(layer.id)?.bitmap ?? null;
  }

  request(layer: RenderLayer, source: TexImageSource, maskPassId: string | null,
          frame: number, srcW: number, srcH: number) {
    const paramsKey = JSON.stringify(layer.params);
    let slot = this.slots.get(layer.id);
    if (!slot) {
      slot = { bitmap: null, frame: -1, paramsKey: "", inFlight: false, lastRequest: 0 };
      this.slots.set(layer.id, slot);
    }
    const now = performance.now();
    const fresh = slot.frame === frame && slot.paramsKey === paramsKey;
    if (fresh || slot.inFlight || now - slot.lastRequest < 120) return;
    slot.inFlight = true;
    slot.lastRequest = now;

    const scale = Math.min(1, MAX_W / srcW);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    this.scratch.width = w;
    this.scratch.height = h;
    const ctx = this.scratch.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);

    let maskBuf: ArrayBuffer | null = null;
    const region = String(layer.params.region ?? "all");
    if (maskPassId && region !== "all") {
      const bmp = getMaskBitmap(maskPassId, frame);
      if (bmp) {
        this.maskScratch.width = w;
        this.maskScratch.height = h;
        const mctx = this.maskScratch.getContext("2d", { willReadFrequently: true })!;
        mctx.drawImage(bmp, 0, 0, w, h);
        const mdata = mctx.getImageData(0, 0, w, h).data;
        const single = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) single[i] = mdata[i * 4];
        maskBuf = single.buffer;
      }
    }

    const id = ++this.reqId;
    this.pending.set(id, { layerId: layer.id, frame, paramsKey });
    this.worker.postMessage({
      id, width: w, height: h, pixels: img.data.buffer, mask: maskBuf,
      direction: layer.params.direction ?? "vertical",
      thresholdMin: Number(layer.params.thresholdMin ?? 0.25),
      thresholdMax: Number(layer.params.thresholdMax ?? 0.8),
      region, sortKey: layer.params.sortKey ?? "luma",
    }, maskBuf ? [img.data.buffer, maskBuf] : [img.data.buffer]);
  }

  dispose() {
    this.worker.terminate();
    for (const slot of this.slots.values()) slot.bitmap?.close();
  }
}
