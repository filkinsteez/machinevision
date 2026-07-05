/** Render layer registry. Every layer type declares its required/optional pass
 * routing and a param schema — the UI and renderer are generated from this,
 * never from provider-specific knowledge (PRD §12.2, §37.2). */
import type { PassType, RenderLayer } from "./types";

/** Goliath 28-class body-part labels (Sapiens segmentation), "id: Name" form. */
export const GOLIATH_PART_OPTIONS = [
  "0: Background", "1: Apparel", "2: Face/Neck", "3: Hair", "4: Left Foot",
  "5: Left Hand", "6: Left Lower Arm", "7: Left Lower Leg", "8: Left Shoe",
  "9: Left Sock", "10: Left Upper Arm", "11: Left Upper Leg", "12: Lower Clothing",
  "13: Right Foot", "14: Right Hand", "15: Right Lower Arm", "16: Right Lower Leg",
  "17: Right Shoe", "18: Right Sock", "19: Right Upper Arm", "20: Right Upper Leg",
  "21: Torso", "22: Upper Clothing", "23: Lower Lip", "24: Upper Lip",
  "25: Lower Teeth", "26: Upper Teeth", "27: Tongue",
];

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
    type: "body_parts",
    label: "Body Parts (Sapiens)",
    engine: "gl",
    description: "Colorize or isolate Sapiens human-parsing parts (hair, face, torso…).",
    sources: [{ key: "field", passTypes: ["body_parts"], required: true }],
    params: {
      mode: { kind: "select", options: ["colorize", "isolate"], default: "colorize", label: "Mode" },
      partId: { kind: "select", options: GOLIATH_PART_OPTIONS, default: "3: Hair", label: "Isolate Part" },
      color: { kind: "color", default: "#FF5A00", label: "Isolate Color" },
      saturation: { kind: "slider", min: 0.2, max: 1, step: 0.05, default: 0.6, label: "Saturation" },
    },
  },
  {
    type: "sapiens_depth",
    label: "Depth (Sapiens)",
    engine: "gl",
    description: "Human-centric depth as colormap, tint, or fog.",
    sources: [{ key: "field", passTypes: ["depth"], required: true }],
    params: {
      mode: { kind: "select", options: ["colormap", "tint", "fog"], default: "colormap", label: "Mode" },
      color: { kind: "color", default: "#2962FF", label: "Tint Color" },
    },
  },
  {
    type: "sapiens_normals",
    label: "Surface Normals (Sapiens)",
    engine: "gl",
    description: "Surface normals as an RGB map or relief lighting.",
    sources: [{ key: "field", passTypes: ["normals"], required: true }],
    params: {
      mode: { kind: "select", options: ["rgb", "relief"], default: "rgb", label: "Mode" },
    },
  },
  {
    type: "depth_displace",
    label: "Depth Displace (Sapiens)",
    engine: "gl",
    description: "Warp the image by the depth field — glassy relief or parallax. Reacts to audio.",
    sources: [{ key: "field", passTypes: ["depth"], required: true }],
    params: {
      mode: { kind: "select", options: ["relief", "parallax"], default: "relief", label: "Mode" },
      strength: { kind: "slider", min: 0, max: 4, step: 0.05, default: 1, label: "Strength" },
    },
  },
  {
    type: "ghost_blend",
    label: "Blend-Through",
    engine: "gl",
    description: "Another clip's actual pixels blended through this one — the cross-clip ghost.",
    sources: [{ key: "mask", passTypes: ["mask", "edge_matte"], required: false }],
    params: {
      mode: { kind: "select", options: ["screen", "difference", "subject", "luma-key"], default: "screen", label: "Blend" },
      amount: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.65, label: "Amount" },
      key: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.35, label: "Luma Key" },
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
      edgeLeak: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.3, label: "Edge Bleed" },
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
      labelFormat: { kind: "select", options: ["label", "numbered"], default: "label", label: "Label Format" },
      lineWidth: { kind: "slider", min: 0.5, max: 6, step: 0.5, default: 1, label: "Stroke Width" },
      color: { kind: "color", default: "#FF5A00", label: "Box Color" },
      showLabel: { kind: "toggle", default: true, label: "Class Label" },
      showConfidence: { kind: "toggle", default: true, label: "Confidence" },
      showTrackId: { kind: "toggle", default: true, label: "Track ID" },
      labelColor: { kind: "color", default: "#FF5A00", label: "Label Color" },
      fontSize: { kind: "slider", min: 7, max: 22, step: 1, default: 10, label: "Font Size" },
      labelBackground: { kind: "toggle", default: false, label: "Label Backing" },
      threshold: { kind: "slider", min: 0, max: 1, step: 0.01, default: 0.5, label: "Min Confidence" },
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
    type: "tracker_overlay",
    label: "Tracker",
    engine: "overlay",
    description: "One locked marker following the tracked subject — box, trail, coordinates.",
    sources: [{ key: "mask", passTypes: ["mask"], required: true }],
    params: {
      style: { kind: "select", options: ["brackets", "crosshair", "box"], default: "brackets", label: "Marker" },
      trail: { kind: "slider", min: 0, max: 120, step: 2, default: 36, label: "Trail (frames)" },
      lineWidth: { kind: "slider", min: 0.5, max: 5, step: 0.25, default: 1.5, label: "Line Width" },
      color: { kind: "color", default: "#FF5A00", label: "Color" },
      smooth: { kind: "slider", min: 0, max: 8, step: 1, default: 2, label: "Smoothing" },
      readout: { kind: "toggle", default: true, label: "ID + Coords" },
    },
  },
  {
    type: "gaze_overlay",
    label: "Gaze",
    engine: "overlay",
    description: "Where each face is looking — derived from the iris landmarks in a face pass.",
    sources: [{ key: "landmarks", passTypes: ["face_landmarks"], required: true }],
    params: {
      style: { kind: "select", options: ["rays", "reticle", "both"], default: "rays", label: "Style" },
      length: { kind: "slider", min: 1, max: 20, step: 0.5, default: 6, label: "Ray Length" },
      lineWidth: { kind: "slider", min: 0.4, max: 4, step: 0.1, default: 1.2, label: "Line Width" },
      color: { kind: "color", default: "#00C853", label: "Color" },
      smooth: { kind: "slider", min: 0, max: 12, step: 1, default: 3, label: "Smoothing (frames)" },
      showAngle: { kind: "toggle", default: true, label: "Angle Readout" },
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
