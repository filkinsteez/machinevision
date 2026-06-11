/** Render layer registry. Every layer type declares its required/optional pass
 * routing and a param schema — the UI and renderer are generated from this,
 * never from provider-specific knowledge (PRD §12.2, §37.2). */
import type { PassType, RenderLayer } from "./types";

export type ParamSpec =
  | { kind: "slider"; min: number; max: number; step: number; default: number; label: string }
  | { kind: "select"; options: string[]; default: string; label: string }
  | { kind: "color"; default: string; label: string }
  | { kind: "toggle"; default: boolean; label: string }
  | { kind: "seed"; default: number; label: string }
  | { kind: "fields"; options: string[]; default: string[]; label: string };

export interface LayerDef {
  type: string;
  label: string;
  engine: "gl" | "overlay" | "cpu";
  description: string;
  sources: { key: string; passTypes: PassType[]; required: boolean }[];
  params: Record<string, ParamSpec>;
}

export const LAYER_DEFS: LayerDef[] = [
  {
    type: "matte_view",
    label: "Segmentation Matte",
    engine: "gl",
    description: "Tint or isolate the segmented region — the debug view as material.",
    sources: [{ key: "mask", passTypes: ["mask", "edge_matte"], required: true }],
    params: {
      mode: { kind: "select", options: ["tint", "matte", "cutout"], default: "tint", label: "Mode" },
      color: { kind: "color", default: "#FF5A00", label: "Tint Color" },
      amount: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.5, label: "Amount" },
      invert: { kind: "toggle", default: false, label: "Invert Region" },
    },
  },
  {
    type: "mask_edge_decay",
    label: "Mask Edge Decay",
    engine: "gl",
    description: "Segmentation boundaries as unstable visual material.",
    sources: [{ key: "mask", passTypes: ["mask", "edge_matte"], required: true }],
    params: {
      edgeWidth: { kind: "slider", min: 0.002, max: 0.08, step: 0.001, default: 0.02, label: "Edge Width" },
      jitter: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.4, label: "Jitter" },
      mode: { kind: "select", options: ["halo", "rot", "holes"], default: "halo", label: "Mode" },
      color: { kind: "color", default: "#FF5A00", label: "Edge Color" },
      seed: { kind: "seed", default: 7, label: "Seed" },
    },
  },
  {
    type: "ascii_shader",
    label: "ASCII Shader",
    engine: "gl",
    description: "Glyph-field rendering of the image or a segmented region.",
    sources: [{ key: "mask", passTypes: ["mask", "edge_matte"], required: false }],
    params: {
      region: { kind: "select", options: ["all", "inside", "outside"], default: "all", label: "Region" },
      cellSize: { kind: "slider", min: 4, max: 32, step: 1, default: 10, label: "Cell Size" },
      colorMode: { kind: "select", options: ["mono", "source"], default: "mono", label: "Color" },
      color: { kind: "color", default: "#9BA0A3", label: "Mono Color" },
      contrast: { kind: "slider", min: 0.5, max: 3, step: 0.05, default: 1.2, label: "Contrast" },
      flicker: { kind: "slider", min: 0, max: 0.5, step: 0.01, default: 0.05, label: "Flicker" },
      seed: { kind: "seed", default: 3, label: "Seed" },
    },
  },
  {
    type: "pixel_sort",
    label: "Pixel Sort",
    engine: "cpu",
    description: "True pixel sorting (CPU worker), optionally confined to a mask.",
    sources: [{ key: "mask", passTypes: ["mask", "edge_matte"], required: false }],
    params: {
      direction: { kind: "select", options: ["horizontal", "vertical"], default: "vertical", label: "Direction" },
      thresholdMin: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.25, label: "Threshold Min" },
      thresholdMax: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.8, label: "Threshold Max" },
      region: { kind: "select", options: ["all", "inside", "outside"], default: "all", label: "Region" },
      sortKey: { kind: "select", options: ["luma", "hue", "red"], default: "luma", label: "Sort Key" },
    },
  },
  {
    type: "flow_smear",
    label: "Flow Smear",
    engine: "gl",
    description: "Optical flow drags and echoes pixels through time.",
    sources: [
      { key: "flow", passTypes: ["optical_flow"], required: true },
      { key: "mask", passTypes: ["mask", "edge_matte"], required: false },
    ],
    params: {
      strength: { kind: "slider", min: 0, max: 12, step: 0.1, default: 3, label: "Flow Strength" },
      decay: { kind: "slider", min: 0.5, max: 0.995, step: 0.005, default: 0.94, label: "Persistence" },
      region: { kind: "select", options: ["all", "inside", "outside"], default: "all", label: "Region" },
    },
  },
  {
    type: "datamosh_preview",
    label: "Datamosh (Preview)",
    engine: "gl",
    description: "Flow-displaced feedback approximation. Final render uses the real codec engine.",
    sources: [
      { key: "mask", passTypes: ["mask", "edge_matte"], required: true },
      { key: "flow", passTypes: ["optical_flow"], required: false },
    ],
    params: {
      mode: { kind: "select", options: ["subject", "background"], default: "subject", label: "Mode" },
      strength: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.85, label: "Strength" },
      decay: { kind: "slider", min: 0.8, max: 0.999, step: 0.001, default: 0.96, label: "Persistence" },
      blockSize: { kind: "slider", min: 2, max: 48, step: 1, default: 12, label: "Block Size" },
      edgeLeak: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.3, label: "Edge Leak" },
      seed: { kind: "seed", default: 1234, label: "Seed" },
    },
  },
  {
    type: "object_labels",
    label: "Object Labels",
    engine: "overlay",
    description: "Detections rendered as restrained machine annotation.",
    sources: [{ key: "detection", passTypes: ["detection"], required: true }],
    params: {
      boxStyle: { kind: "select", options: ["brackets", "box", "none"], default: "brackets", label: "Box Style" },
      showConfidence: { kind: "toggle", default: true, label: "Confidence" },
      showTrackId: { kind: "toggle", default: true, label: "Track ID" },
      threshold: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.5, label: "Min Confidence" },
      fontSize: { kind: "slider", min: 7, max: 18, step: 1, default: 10, label: "Font Size" },
      color: { kind: "color", default: "#FF5A00", label: "Color" },
    },
  },
  {
    type: "landmark_overlay",
    label: "Landmark Overlay",
    engine: "overlay",
    description: "Face mesh / pose skeleton / hand joints from real landmark passes.",
    sources: [{ key: "landmarks", passTypes: ["face_landmarks", "pose_landmarks", "hand_landmarks"], required: true }],
    params: {
      style: { kind: "select", options: ["wireframe", "points", "skeleton"], default: "wireframe", label: "Style" },
      lineWidth: { kind: "slider", min: 0.2, max: 4, step: 0.1, default: 0.7, label: "Line Width" },
      pointSize: { kind: "slider", min: 0, max: 6, step: 0.5, default: 0, label: "Point Size" },
      color: { kind: "color", default: "#EAEAEA", label: "Color" },
      dropout: { kind: "slider", min: 0, max: 0.95, step: 0.01, default: 0, label: "Dropout" },
      trail: { kind: "slider", min: 0, max: 24, step: 1, default: 0, label: "Trail Frames" },
      seed: { kind: "seed", default: 42, label: "Seed" },
    },
  },
  {
    type: "metadata_typography",
    label: "Metadata Typography",
    engine: "overlay",
    description: "Sparse monospace machine metadata.",
    sources: [
      { key: "mask", passTypes: ["mask", "edge_matte"], required: false },
      { key: "detection", passTypes: ["detection"], required: false },
      { key: "flow", passTypes: ["optical_flow"], required: false },
    ],
    params: {
      fields: {
        kind: "fields",
        options: ["frame", "pass", "confidence", "area", "count", "motion", "provider"],
        default: ["frame", "pass", "confidence"],
        label: "Fields",
      },
      anchor: { kind: "select", options: ["bottom-left", "top-left", "top-right", "bottom-right"], default: "bottom-left", label: "Anchor" },
      fontSize: { kind: "slider", min: 8, max: 20, step: 1, default: 11, label: "Font Size" },
      color: { kind: "color", default: "#EAEAEA", label: "Color" },
    },
  },
];

export const layerDef = (type: string) => LAYER_DEFS.find((d) => d.type === type);

export function defaultParams(def: LayerDef): RenderLayer["params"] {
  const out: RenderLayer["params"] = {};
  for (const [k, spec] of Object.entries(def.params)) out[k] = spec.default as never;
  return out;
}

export function uniqueId(): string {
  return `layer_${crypto.randomUUID().slice(0, 13)}`;
}

export function newLayer(def: LayerDef): RenderLayer {
  return {
    id: uniqueId(),
    type: def.type,
    name: def.label,
    enabled: true,
    sources: Object.fromEntries(def.sources.map((s) => [s.key, null])),
    params: defaultParams(def),
    blend: { mode: "normal", opacity: 1.0 },
  };
}
