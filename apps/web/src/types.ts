export interface Project {
  id: string;
  name: string;
  renderLayers: RenderLayer[];
  timeline: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  type: "image" | "video";
  name: string;
  status: "ingesting" | "ready" | "failed";
  width: number | null;
  height: number | null;
  fps: number | null;
  duration: number | null;
  frameCount: number | null;
  proxyUrl: string | null;
  proxyMime: string | null;
  proxyWidth: number | null;
  proxyHeight: number | null;
  thumbnailUrl: string | null;
  error: string | null;
}

export type PassType =
  | "mask" | "detection" | "tracking" | "face_landmarks" | "pose_landmarks"
  | "hand_landmarks" | "optical_flow" | "edge_matte"
  | "body_parts" | "depth" | "normals";

export interface VisionPass {
  id: string;
  projectId: string;
  assetId: string;
  type: PassType;
  name: string;
  provider: string;
  providerVersion: string;
  status: "pending" | "running" | "ready" | "failed";
  frameStart: number;
  frameEnd: number;
  prompt: Record<string, unknown>;
  summary: Record<string, unknown>;
  dataUrl: string | null;
  error: string | null;
}

export interface RenderLayer {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  sources: Record<string, string | null>;
  params: Record<string, number | string | boolean | string[]>;
  blend: { mode: string; opacity: number };
}

export interface Job {
  id: string;
  type: string;
  status: "queued" | "running" | "postprocessing" | "ready" | "failed" | "cancelled";
  progress: number;
  stage: string;
  error: string | null;
}

export interface ExportRecord {
  id: string;
  type: string;
  format: string;
  status: string;
  outputUrl: string | null;
  manifest: Record<string, unknown>;
  createdAt: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: string;
  requiredPassTypes: PassType[];
  renderLayers: Omit<RenderLayer, "id">[];
  builtin: boolean;
}

// pass data.json payloads
export interface Detection {
  id: string;
  label: string;
  bbox: [number, number, number, number]; // x1,y1,x2,y2 normalized
  confidence: number | null;
  trackId?: string;
}

export interface PassData {
  type: string;
  width: number;
  height: number;
  kind?: string;
  connections?: [number, number][];
  frames: Array<{
    frame: number;
    detections?: Detection[];
    entities?: Array<{ id: string; handedness?: string; points: number[][] }>;
    url?: string | null;
    scale?: number;
    meanMag?: number;
    confidence?: number | null;
    area?: number;
    bbox?: number[] | null;
  }>;
  tracks?: Array<{ id: string; label: string; frames: { frame: number; bbox: number[] }[] }>;
}

export interface PromptPoint {
  x: number;
  y: number;
  positive: boolean;
}
