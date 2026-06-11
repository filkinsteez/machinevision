/** True pixel sorting on the CPU. Spans of pixels whose sort key falls inside
 * the threshold window (and inside/outside the mask region) are sorted. */

interface SortRequest {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;       // RGBA
  mask: ArrayBuffer | null;  // single channel, same dims
  direction: "horizontal" | "vertical";
  thresholdMin: number;
  thresholdMax: number;
  region: "all" | "inside" | "outside";
  sortKey: "luma" | "hue" | "red";
}

function keyOf(r: number, g: number, b: number, mode: string): number {
  if (mode === "red") return r / 255;
  if (mode === "hue") {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === mn) return 0;
    let h = 0;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    return ((h * 60 + 360) % 360) / 360;
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

self.onmessage = (ev: MessageEvent<SortRequest>) => {
  const { id, width, height, direction, thresholdMin, thresholdMax, region, sortKey } = ev.data;
  const px = new Uint8ClampedArray(ev.data.pixels);
  const mask = ev.data.mask ? new Uint8Array(ev.data.mask) : null;

  const lineCount = direction === "vertical" ? width : height;
  const lineLen = direction === "vertical" ? height : width;
  const idx = direction === "vertical"
    ? (line: number, i: number) => (i * width + line) * 4
    : (line: number, i: number) => (line * width + i) * 4;
  const midx = direction === "vertical"
    ? (line: number, i: number) => i * width + line
    : (line: number, i: number) => line * width + i;

  const span: { o: number; k: number }[] = [];
  const flush = () => {
    if (span.length > 2) {
      const offsets = span.map((s) => s.o);
      span.sort((a, b) => a.k - b.k);
      const tmp = new Uint8ClampedArray(span.length * 4);
      span.forEach((s, j) => tmp.set(px.subarray(s.o, s.o + 4), j * 4));
      offsets.forEach((o, j) => px.set(tmp.subarray(j * 4, j * 4 + 4), o));
    }
    span.length = 0;
  };

  for (let line = 0; line < lineCount; line++) {
    for (let i = 0; i < lineLen; i++) {
      const o = idx(line, i);
      const k = keyOf(px[o], px[o + 1], px[o + 2], sortKey);
      let inRegion = true;
      if (mask && region !== "all") {
        const m = mask[midx(line, i)] > 127;
        inRegion = region === "inside" ? m : !m;
      }
      if (inRegion && k >= thresholdMin && k <= thresholdMax) span.push({ o, k });
      else flush();
    }
    flush();
  }

  (self as unknown as Worker).postMessage({ id, width, height, pixels: px.buffer }, [px.buffer]);
};
