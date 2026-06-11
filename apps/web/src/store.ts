import { create } from "zustand";
import { uniqueId } from "./layers";
import { api } from "./api";
import type { Asset, ExportRecord, Job, Preset, Project, PromptPoint, RenderLayer, VisionPass } from "./types";

export type Tool = "select" | "click-prompt" | "box-prompt";

interface State {
  project: Project | null;
  assets: Asset[];
  passes: VisionPass[];
  jobs: Job[];
  exports: ExportRecord[];
  presets: Preset[];
  selectedAssetId: string | null;
  selectedLayerId: string | null;
  visiblePassId: string | null;
  tool: Tool;
  promptPoints: PromptPoint[];
  promptBox: [number, number, number, number] | null;
  playing: boolean;
  currentFrame: number;
  baking: { active: boolean; progress: number } | null;
  error: string | null;

  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  selectAsset: (id: string | null) => void;
  upload: (file: File) => Promise<void>;
  setTool: (t: Tool) => void;
  addPromptPoint: (p: PromptPoint) => void;
  clearPrompt: () => void;
  setPromptBox: (b: [number, number, number, number] | null) => void;
  runSegment: () => Promise<void>;
  runDetect: (prompt: string, threshold: number) => Promise<void>;
  runLandmarks: (kind: string) => Promise<void>;
  runFlow: () => Promise<void>;
  runEdgeMatte: (maskPassId: string) => Promise<void>;
  deletePass: (id: string) => Promise<void>;
  setVisiblePass: (id: string | null) => void;

  layers: () => RenderLayer[];
  setLayers: (layers: RenderLayer[]) => void;
  updateLayer: (id: string, patch: Partial<RenderLayer>) => void;
  selectLayer: (id: string | null) => void;
  applyPreset: (preset: Preset) => void;

  setPlaying: (p: boolean) => void;
  setFrame: (f: number) => void;
  setBaking: (b: { active: boolean; progress: number } | null) => void;
  setError: (e: string | null) => void;
}

let saveTimer: number | undefined;
function debouncedSave(project: Project) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    api.patchProject(project.id, { renderLayers: project.renderLayers }).catch(console.error);
  }, 600);
}

export const useStore = create<State>((set, get) => ({
  project: null,
  assets: [],
  passes: [],
  jobs: [],
  exports: [],
  presets: [],
  selectedAssetId: null,
  selectedLayerId: null,
  visiblePassId: null,
  tool: "select",
  promptPoints: [],
  promptBox: null,
  playing: false,
  currentFrame: 0,
  baking: null,
  error: null,

  boot: async () => {
    const projects = await api.listProjects();
    const project = projects[0] ?? (await api.createProject("Untitled Machine Vision Project"));
    set({ project });
    await get().refresh();
    const presets = await api.listPresets();
    set({ presets });
    const { assets } = get();
    if (assets.length && !get().selectedAssetId) {
      set({ selectedAssetId: assets[assets.length - 1].id });
    }
  },

  refresh: async () => {
    const project = get().project;
    if (!project) return;
    const [assets, passes, jobs, exports] = await Promise.all([
      api.listAssets(project.id),
      api.listPasses(project.id),
      api.listJobs(project.id),
      api.listExports(project.id),
    ]);
    set({ assets, passes, jobs, exports });
  },

  selectAsset: (id) => set({ selectedAssetId: id, promptPoints: [], promptBox: null, currentFrame: 0, playing: false }),

  upload: async (file) => {
    const project = get().project;
    if (!project) return;
    try {
      const { asset } = await api.uploadAsset(project.id, file);
      set({ selectedAssetId: asset.id });
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setTool: (tool) => set({ tool }),
  addPromptPoint: (p) => set((s) => ({ promptPoints: [...s.promptPoints, p] })),
  clearPrompt: () => set({ promptPoints: [], promptBox: null }),
  setPromptBox: (promptBox) => set({ promptBox }),

  runSegment: async () => {
    const { project, selectedAssetId, promptPoints, promptBox } = get();
    if (!project || !selectedAssetId) return;
    let prompt: Record<string, unknown>;
    if (promptBox) prompt = { type: "box", box: promptBox };
    else if (promptPoints.length) prompt = { type: "click", points: promptPoints };
    else { set({ error: "Click the subject (or drag a box) first, then Generate Mask." }); return; }
    try {
      await api.segment(project.id, selectedAssetId, prompt);
      set({ promptPoints: [], promptBox: null, tool: "select" });
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  runDetect: async (prompt, threshold) => {
    const { project, selectedAssetId } = get();
    if (!project || !selectedAssetId) return;
    try {
      await api.detect(project.id, selectedAssetId, prompt, threshold);
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  runLandmarks: async (kind) => {
    const { project, selectedAssetId } = get();
    if (!project || !selectedAssetId) return;
    try {
      await api.landmarks(project.id, selectedAssetId, kind);
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  runFlow: async () => {
    const { project, selectedAssetId } = get();
    if (!project || !selectedAssetId) return;
    try {
      await api.opticalFlow(project.id, selectedAssetId);
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  runEdgeMatte: async (maskPassId) => {
    const { project } = get();
    if (!project) return;
    try {
      await api.edgeMatte(project.id, maskPassId);
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  deletePass: async (id) => {
    await api.deletePass(id);
    if (get().visiblePassId === id) set({ visiblePassId: null });
    await get().refresh();
  },

  setVisiblePass: (visiblePassId) => set({ visiblePassId }),

  layers: () => get().project?.renderLayers ?? [],

  setLayers: (layers) => {
    const project = get().project;
    if (!project) return;
    const next = { ...project, renderLayers: layers };
    set({ project: next });
    debouncedSave(next);
  },

  updateLayer: (id, patch) => {
    const layers = get().layers().map((l) => (l.id === id ? { ...l, ...patch } : l));
    get().setLayers(layers);
  },

  selectLayer: (selectedLayerId) => set({ selectedLayerId }),

  applyPreset: (preset) => {
    const { passes, selectedAssetId } = get();
    const ready = passes.filter((p) => p.status === "ready" && p.assetId === selectedAssetId);
    const resolve = (placeholder: string | null): string | null => {
      if (!placeholder || !placeholder.startsWith("$")) return placeholder;
      const wanted = placeholder.slice(1);
      const found = ready.find((p) => p.type === wanted);
      return found ? found.id : null;
    };
    const newLayers: RenderLayer[] = preset.renderLayers.map((l) => ({
      ...l,
      id: uniqueId(),
      enabled: l.enabled ?? true,
      blend: l.blend ?? { mode: "normal", opacity: 1.0 },
      sources: Object.fromEntries(Object.entries(l.sources).map(([k, v]) => [k, resolve(v)])),
    }));
    get().setLayers([...get().layers(), ...newLayers]);
  },

  setPlaying: (playing) => set({ playing }),
  setFrame: (currentFrame) => set({ currentFrame }),
  setBaking: (baking) => set({ baking }),
  setError: (error) => set({ error }),
}));
