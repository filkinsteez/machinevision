/** The Effects rail: every entry is one model surfaced as a one-click outcome.
 * Clicking an effect auto-runs whatever analysis it needs (passes are cached
 * infrastructure, not a user concept) and adds a styled layer wired to it.
 * Reference aesthetic: real footage + ONE bold, legible machine-perception
 * layer (numbered detection labels, gaze rays, depth maps, pose skeletons…).
 */
import type { PassType, RenderLayer } from "./types";

export interface EffectDef {
  id: string;
  label: string;
  tagline: string;
  group: "see" | "style";
  /** pass types to auto-generate before the layer can render */
  ensure: PassType[];
  /** non-generic pipelines (e.g. "people" = one job producing boxes + poses) */
  special?: "people";
  /** layer blueprints; sourceKey -> pass type resolved after generation */
  layers: Array<{
    type: string;
    name: string;
    sources: Record<string, PassType>;
    params?: RenderLayer["params"];
    blend?: RenderLayer["blend"];
  }>;
  videoOnly?: boolean;
}

export const EFFECTS: EffectDef[] = [
  // ---- SEE: the model's perception, drawn straight onto the footage ----
  {
    id: "track", label: "Track", group: "see",
    tagline: "Lock onto one subject and follow it through the scene",
    ensure: ["mask"],
    layers: [{
      type: "tracker_overlay", name: "Track",
      sources: { mask: "mask" },
      params: { style: "brackets", trail: 36, lineWidth: 1.5, color: "#FF5A00",
                smooth: 2, readout: true },
    }],
  },
  {
    id: "people", label: "People", group: "see", special: "people",
    tagline: "Boxes + skeletons on every person (YOLO11-pose)",
    ensure: [],
    layers: [
      {
        type: "object_labels", name: "People",
        sources: { detection: "detection" },
        params: { boxStyle: "box", labelFormat: "label", showConfidence: true,
                  showTrackId: true, showLabel: true, threshold: 0.35, fontSize: 11,
                  lineWidth: 1.5, color: "#FF5A00", labelColor: "#FF5A00",
                  labelBackground: true },
      },
      {
        type: "landmark_overlay", name: "People Poses",
        sources: { landmarks: "pose_landmarks" },
        params: { style: "skeleton", lineWidth: 1.6, pointSize: 2.5, color: "#00C853",
                  dropout: 0, trail: 0, seed: 42 },
      },
    ],
  },
  {
    id: "objects", label: "Objects", group: "see",
    tagline: "Numbered detection labels on everything found",
    ensure: ["detection"],
    layers: [{
      type: "object_labels", name: "Objects",
      sources: { detection: "detection" },
      params: { boxStyle: "brackets", labelFormat: "numbered", showConfidence: false,
                showTrackId: false, threshold: 0.35, fontSize: 12, lineWidth: 1,
                color: "#FF5A00", labelColor: "#FF5A00", labelBackground: true },
    }],
  },
  {
    id: "gaze", label: "Gaze", group: "see",
    tagline: "Where each face is looking — from iris landmarks",
    ensure: ["face_landmarks"],
    layers: [{
      type: "gaze_overlay", name: "Gaze",
      sources: { landmarks: "face_landmarks" },
      params: { style: "rays", length: 6, lineWidth: 1.2, color: "#00C853",
                smooth: 3, showAngle: true },
    }],
  },
  {
    id: "face_mesh", label: "Face Mesh", group: "see",
    tagline: "Full face topology, 478 tracked points",
    ensure: ["face_landmarks"],
    layers: [{
      type: "landmark_overlay", name: "Face Mesh",
      sources: { landmarks: "face_landmarks" },
      params: { style: "wireframe", lineWidth: 0.6, pointSize: 0, color: "#EAEAEA",
                dropout: 0, trail: 0, seed: 42 },
    }],
  },
  {
    id: "pose", label: "Pose", group: "see",
    tagline: "Body skeletons on every person",
    ensure: ["pose_landmarks"],
    layers: [{
      type: "landmark_overlay", name: "Pose",
      sources: { landmarks: "pose_landmarks" },
      params: { style: "skeleton", lineWidth: 1.4, pointSize: 3, color: "#FF5A00",
                dropout: 0, trail: 0, seed: 42 },
    }],
  },
  {
    id: "hands", label: "Hands", group: "see",
    tagline: "Hand joints and fingers",
    ensure: ["hand_landmarks"],
    layers: [{
      type: "landmark_overlay", name: "Hands",
      sources: { landmarks: "hand_landmarks" },
      params: { style: "skeleton", lineWidth: 1.2, pointSize: 2.5, color: "#2962FF",
                dropout: 0, trail: 0, seed: 42 },
    }],
  },
  {
    id: "depth", label: "Depth", group: "see",
    tagline: "Human depth as a thermal map",
    ensure: ["depth"],
    layers: [{
      type: "sapiens_depth", name: "Depth",
      sources: { field: "depth" },
      params: { mode: "colormap", color: "#2962FF" },
    }],
  },
  {
    id: "body_parts", label: "Body Parts", group: "see",
    tagline: "28-part human parsing as flat color fields",
    ensure: ["body_parts"],
    layers: [{
      type: "body_parts", name: "Body Parts",
      sources: { field: "body_parts" },
      params: { mode: "colorize", partId: "3: Hair", color: "#FF5A00", saturation: 0.7 },
      blend: { mode: "normal", opacity: 0.85 },
    }],
  },
  {
    id: "normals", label: "Surface", group: "see",
    tagline: "Surface angles as an RGB normal map",
    ensure: ["normals"],
    layers: [{
      type: "sapiens_normals", name: "Surface",
      sources: { field: "normals" },
      params: { mode: "rgb" },
    }],
  },

  // ---- STYLE: treatments driven by the analysis ----
  {
    id: "cutout", label: "Cutout", group: "style",
    tagline: "Isolate the subject from everything else",
    ensure: ["mask"],
    layers: [{
      type: "matte_view", name: "Cutout",
      sources: { mask: "mask" },
      params: { mode: "cutout", color: "#FF5A00", amount: 1, invert: false },
    }],
  },
  {
    id: "datamosh", label: "Datamosh", group: "style", videoOnly: true,
    tagline: "The subject melts into accumulated motion",
    ensure: ["mask", "optical_flow"],
    layers: [{
      type: "datamosh_preview", name: "Datamosh",
      sources: { mask: "mask", flow: "optical_flow" },
      params: { mode: "subject", strength: 0.85, decay: 0.96, blockSize: 12,
                edgeLeak: 0.3, seed: 1234 },
    }],
  },
  {
    id: "pixel_sort", label: "Pixel Sort", group: "style",
    tagline: "Sorted pixel streaks inside the subject",
    ensure: ["mask"],
    layers: [{
      type: "pixel_sort", name: "Pixel Sort",
      sources: { mask: "mask" },
      params: { direction: "vertical", thresholdMin: 0.25, thresholdMax: 0.8,
                region: "inside", sortKey: "luma" },
    }],
  },
  {
    id: "ascii", label: "ASCII", group: "style",
    tagline: "Background dissolves into glyphs; subject stays photographic",
    ensure: ["mask"],
    layers: [{
      type: "ascii_shader", name: "ASCII",
      sources: { mask: "mask" },
      params: { region: "outside", cellSize: 10, colorMode: "mono", color: "#9BA0A3",
                contrast: 1.2, flicker: 0.05, seed: 3 },
    }],
  },
  {
    id: "motion_smear", label: "Motion Smear", group: "style", videoOnly: true,
    tagline: "Movement drags trails through the frame",
    ensure: ["optical_flow"],
    layers: [{
      type: "flow_smear", name: "Motion Smear",
      sources: { flow: "optical_flow" },
      params: { strength: 3, decay: 0.94, region: "all" },
    }],
  },
  {
    id: "depth_warp", label: "Depth Warp", group: "style",
    tagline: "Glassy relief carved by the depth field",
    ensure: ["depth"],
    layers: [{
      type: "depth_displace", name: "Depth Warp",
      sources: { field: "depth" },
      params: { mode: "relief", strength: 1.4 },
    }],
  },
  {
    id: "edge_decay", label: "Edge Decay", group: "style",
    tagline: "The subject's outline rots and flickers",
    ensure: ["mask", "edge_matte"],
    layers: [{
      type: "mask_edge_decay", name: "Edge Decay",
      sources: { mask: "edge_matte" },
      params: { edgeWidth: 0.035, jitter: 0.6, mode: "rot", color: "#FF5A00", seed: 7 },
    }],
  },
];
