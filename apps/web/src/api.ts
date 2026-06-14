import type { Asset, ExportRecord, Job, Preset, Project, VisionPass } from "./types";

async function http<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${url}: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

export const api = {
  listProjects: () => http<Project[]>("GET", "/api/projects"),
  createProject: (name: string) => http<Project>("POST", "/api/projects", { name }),
  patchProject: (id: string, patch: Partial<Pick<Project, "name" | "renderLayers" | "timeline" | "settings">>) =>
    http<Project>("PATCH", `/api/projects/${id}`, patch),

  uploadAsset: async (projectId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    return res.json() as Promise<{ asset: Asset; job: Job }>;
  },
  listAssets: (projectId: string) => http<Asset[]>("GET", `/api/projects/${projectId}/assets`),
  deleteAsset: (id: string) => http("DELETE", `/api/assets/${id}`),

  segment: (projectId: string, assetId: string, prompt: Record<string, unknown>) =>
    http<{ pass: VisionPass; cached: boolean; job: Job | null }>("POST", "/api/vision/segment", { projectId, assetId, prompt }),
  detect: (projectId: string, assetId: string, prompt: string, threshold: number) =>
    http<{ pass: VisionPass; trackPassId: string | null; cached: boolean; job: Job | null }>(
      "POST", "/api/vision/detect", { projectId, assetId, prompt, threshold }),
  landmarks: (projectId: string, assetId: string, kind: string) =>
    http<{ pass: VisionPass; cached: boolean; job: Job | null }>("POST", "/api/vision/landmarks", { projectId, assetId, kind }),
  opticalFlow: (projectId: string, assetId: string) =>
    http<{ pass: VisionPass; cached: boolean; job: Job | null }>("POST", "/api/vision/optical-flow", { projectId, assetId }),
  edgeMatte: (projectId: string, maskPassId: string) =>
    http<{ pass: VisionPass; cached: boolean; job: Job | null }>("POST", "/api/vision/edge-matte", { projectId, maskPassId }),
  sapiens: (projectId: string, assetId: string, task: "body_parts" | "depth" | "normals") =>
    http<{ pass: VisionPass; cached: boolean; job: Job | null }>("POST", "/api/vision/sapiens", { projectId, assetId, task }),
  bodyPartMask: (projectId: string, bodyPartsPassId: string, partIds: number[]) =>
    http<{ pass: VisionPass; cached: boolean; job: Job | null }>("POST", "/api/vision/body-part-mask", { projectId, bodyPartsPassId, partIds }),
  listPasses: (projectId: string) => http<VisionPass[]>("GET", `/api/projects/${projectId}/vision-passes`),
  deletePass: (id: string) => http("DELETE", `/api/vision/passes/${id}`),

  renderDatamosh: (projectId: string, assetId: string, maskPassId: string, params: Record<string, unknown>) =>
    http<{ export: ExportRecord; job: Job }>("POST", "/api/render/datamosh", { projectId, assetId, maskPassId, params }),

  createExport: (projectId: string, type: string, passId?: string) =>
    http<{ export: ExportRecord; job: Job }>("POST", "/api/exports", { projectId, type, passId }),
  listExports: (projectId: string) => http<ExportRecord[]>("GET", `/api/projects/${projectId}/exports`),

  createFrameSession: () => http<{ sessionId: string }>("POST", "/api/exports/frame-session"),
  uploadBakeFrame: async (sessionId: string, n: number, blob: Blob) => {
    const res = await fetch(`/api/exports/frame-session/${sessionId}/frames/${n}`, { method: "PUT", body: blob });
    if (!res.ok) throw new Error(`frame upload failed: ${res.status}`);
  },
  finalizeBake: (sessionId: string, projectId: string, fps: number, kind: "video" | "image", assetId?: string) =>
    http<{ export: ExportRecord; job: Job }>("POST", `/api/exports/frame-session/${sessionId}/finalize`,
      { projectId, fps, kind, assetId }),

  listJobs: (projectId: string) => http<Job[]>("GET", `/api/projects/${projectId}/jobs`),
  cancelJob: (id: string) => http("POST", `/api/jobs/${id}/cancel`),

  listPresets: () => http<Preset[]>("GET", "/api/presets"),
  savePreset: (p: { name: string; description: string; category: string; requiredPassTypes: string[]; renderLayers: unknown[] }) =>
    http<Preset>("POST", "/api/presets", p),
};
