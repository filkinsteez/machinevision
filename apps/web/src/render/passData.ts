/** Vision pass data access: JSON payloads fetched once, per-frame mask/flow PNGs
 * fetched on demand with an LRU cache and small prefetch window. */
import type { PassData } from "../types";

const jsonCache = new Map<string, PassData | Promise<PassData>>();
const bitmapCaches = new Map<string, Map<number, ImageBitmap | "loading" | "failed">>();
const LRU_LIMIT = 48;

export function getPassJSON(passId: string): PassData | null {
  const hit = jsonCache.get(passId);
  if (hit && !(hit instanceof Promise)) return hit;
  if (!hit) {
    const p = fetch(`/storage/vision-passes/${passId}/data.json`)
      .then((r) => r.json())
      .then((data: PassData) => {
        jsonCache.set(passId, data);
        return data;
      });
    jsonCache.set(passId, p);
  }
  return null;
}

function cacheFor(key: string) {
  let c = bitmapCaches.get(key);
  if (!c) {
    c = new Map();
    bitmapCaches.set(key, c);
  }
  return c;
}

function fetchBitmap(cache: Map<number, ImageBitmap | "loading" | "failed">,
                     url: string, frame: number) {
  cache.set(frame, "loading");
  fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
    .then((b) => createImageBitmap(b))
    .then((bmp) => {
      cache.set(frame, bmp);
      if (cache.size > LRU_LIMIT) {
        for (const [k, v] of cache) {
          if (cache.size <= LRU_LIMIT) break;
          if (k !== frame && v !== "loading") {
            if (v instanceof ImageBitmap) v.close();
            cache.delete(k);
          }
        }
      }
    })
    // mark failed instead of deleting — deleting would refetch every frame (404 storm)
    .catch(() => cache.set(frame, "failed"));
}

/** Returns the bitmap for `frame` if loaded; otherwise kicks off a fetch and
 * returns the nearest earlier loaded frame (masks change slowly). */
export function getMaskBitmap(passId: string, frame: number, prefetch = 4): ImageBitmap | null {
  const cache = cacheFor(`mask:${passId}`);
  for (let f = frame; f < frame + prefetch; f++) {
    if (!cache.has(f)) {
      fetchBitmap(cache, `/storage/vision-passes/${passId}/masks/${String(f).padStart(6, "0")}.png`, f);
    }
  }
  const exact = cache.get(frame);
  if (exact instanceof ImageBitmap) return exact;
  for (let back = 1; back <= 12; back++) {
    const v = cache.get(frame - back);
    if (v instanceof ImageBitmap) return v;
  }
  for (const v of cache.values()) if (v instanceof ImageBitmap) return v;
  return null;
}

export function getFlowFrame(passId: string, frame: number, prefetch = 4):
  { bitmap: ImageBitmap; scale: number } | null {
  const data = getPassJSON(passId);
  if (!data) return null;
  const cache = cacheFor(`flow:${passId}`);
  const byFrame = new Map(data.frames.map((f) => [f.frame, f]));
  for (let f = Math.max(frame, 1); f < frame + prefetch; f++) {
    const meta = byFrame.get(f);
    if (meta?.url && !cache.has(f)) fetchBitmap(cache, meta.url, f);
  }
  for (let f = frame; f >= Math.max(1, frame - 12); f--) {
    const v = cache.get(f);
    const meta = byFrame.get(f);
    if (v instanceof ImageBitmap && meta) return { bitmap: v, scale: meta.scale ?? 0 };
  }
  return null;
}

/** Per-frame entry lookup for JSON passes (detections, landmarks). */
export function frameEntry(data: PassData, frame: number) {
  if (frame < data.frames.length && data.frames[frame]?.frame === frame) return data.frames[frame];
  return data.frames.find((f) => f.frame === frame) ?? null;
}
