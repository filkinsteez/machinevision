import { create } from "zustand";
import { defaultParams, layerDef, newLayer, uniqueId } from "./layers";
import { api } from "./api";
import { DEFAULT_AUDIO_CONFIG } from "./render/audio";
import type { EffectDef } from "./effects";
import type { AudioReactiveConfig, Asset, ExportRecord, Job, PassType, Preset, Project, PromptPoint, RenderLayer, VisionPass } from "./types";

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
  muted: boolean;
  baking: { active: boolean; progress: number } | null;
  error: string | null;
  effectBusy: string | null;
  subjectPrompt: string;
  setSubjectPrompt: (p: string) => void;

  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  selectAsset: (id: string | null) => void;
  upload: (file: File) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  pruneLayerSources: () => void;
  setTool: (t: Tool) => void;
  addPromptPoint: (p: PromptPoint) => void;
  clearPrompt: () => void;
  setPromptBox: (b: [number, number, number, number] | null) => void;
  runSegment: () => Promise<void>;
  runSegmentText: (prompt: string) => Promise<void>;
  runDetect: (prompt: string, threshold: number) => Promise<void>;
  runLandmarks: (kind: string) => Promise<void>;
  runFlow: () => Promise<void>;
  runEdgeMatte: (maskPassId: string) => Promise<void>;
  runSapiens: (task: "body_parts" | "depth" | "normals") => Promise<void>;
  runBodyPartMask: (bodyPartsPassId: string, partIds: number[]) => Promise<void>;
  deletePass: (id: string) => Promise<void>;
  setVisiblePass: (id: string | null) => void;
  addLayerForPass: (pass: VisionPass) => void;

  layers: () => RenderLayer[];
  setLayers: (layers: RenderLayer[]) => void;
  updateLayer: (id: string, patch: Partial<RenderLayer>) => void;
  selectLayer: (id: string | null) => void;
  applyPreset: (preset: Preset) => void;
  applyPresetAuto: (preset: Preset) => Promise<void>;
  ensurePassTypes: (types: PassType[]) => Promise<boolean>;
  runEffect: (eff: EffectDef) => Promise<void>;

  audioConfig: () => AudioReactiveConfig;
  setAudioReactive: (patch: Partial<AudioReactiveConfig>) => void;

  setPlaying: (p: boolean) => void;
  setFrame: (f: number) => void;
  setMuted: (m: boolean) => void;
  setBaking: (b: { active: boolean; progress: number } | null) => void;
  setError: (e: string | null) => void;
}

let saveTimer: number | undefined;
function debouncedSave(project: Project) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    api.patchProject(project.id, {
      renderLayers: project.renderLayers,
      settings: project.settings,
    }).catch(console.error);
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
  muted: false,
  baking: null,
  effectBusy: null,
  subjectPrompt: "",
  setSubjectPrompt: (subjectPrompt) => set({ subjectPrompt }),
  error: null,

  boot: async () => {
    const projects = await api.listProjects();
    const project = projects[0] ?? (await api.createProject("Untitled Machine Industries Project"));
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

  deleteAsset: async (id) => {
    try {
      await api.deleteAsset(id);
      if (get().selectedAssetId === id) {
        set({ selectedAssetId: null, visiblePassId: null, playing: false, currentFrame: 0 });
      }
      await get().refresh();
      const remaining = get().assets;
      if (!get().selectedAssetId && remaining.length) {
        set({ selectedAssetId: remaining[remaining.length - 1].id });
      }
      get().pruneLayerSources();
    } catch (e) { set({ error: String(e) }); }
  },

  pruneLayerSources: () => {
    const valid = new Set(get().passes.map((p) => p.id));
    const layers = get().layers();
    let changed = false;
    const next = layers.map((l) => {
      const entries = Object.entries(l.sources);
      if (!entries.some(([, v]) => v && !valid.has(v))) return l;
      changed = true;
      return {
        ...l,
        sources: Object.fromEntries(entries.map(([k, v]) => [k, v && valid.has(v) ? v : null])),
      };
    });
    if (changed) get().setLayers(next);
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

  runSegmentText: async (prompt) => {
    const { project, selectedAssetId } = get();
    if (!project || !selectedAssetId || !prompt.trim()) return;
    try {
      await api.segment(project.id, selectedAssetId, { type: "text", text: prompt.trim() });
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

  runSapiens: async (task) => {
    const { project, selectedAssetId } = get();
    if (!project || !selectedAssetId) return;
    try {
      await api.sapiens(project.id, selectedAssetId, task);
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  runBodyPartMask: async (bodyPartsPassId, partIds) => {
    const { project } = get();
    if (!project || !partIds.length) return;
    try {
      await api.bodyPartMask(project.id, bodyPartsPassId, partIds);
      await get().refresh();
    } catch (e) { set({ error: String(e) }); }
  },

  deletePass: async (id) => {
    await api.deletePass(id);
    if (get().visiblePassId === id) set({ visiblePassId: null });
    await get().refresh();
    get().pruneLayerSources();
  },

  setVisiblePass: (visiblePassId) => set({ visiblePassId }),

  // one-click: pass -> styled render layer with routing prefilled, controls open
  addLayerForPass: (pass) => {
    const typeFor: Record<string, string> = {
      detection: "object_labels",
      mask: "matte_view",
      edge_matte: "mask_edge_decay",
      optical_flow: "flow_smear",
      face_landmarks: "landmark_overlay",
      pose_landmarks: "landmark_overlay",
      hand_landmarks: "landmark_overlay",
      body_parts: "body_parts",
      depth: "sapiens_depth",
      normals: "sapiens_normals",
    };
    const def = layerDef(typeFor[pass.type] ?? "");
    if (!def) return;
    const layer = newLayer(def);
    layer.name = `${def.label}: ${pass.name}`;
    for (const src of def.sources) {
      if (src.passTypes.includes(pass.type)) layer.sources[src.key] = pass.id;
    }
    get().setLayers([...get().layers(), layer]);
    set({ selectedLayerId: layer.id, visiblePassId: null });
  },

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

  // Generate any missing pass types for the selected asset and wait until ready.
  // Passes are cached infrastructure — the user clicks outcomes, not models.
  ensurePassTypes: async (types) => {
    const assetId = get().selectedAssetId;
    if (!assetId) return false;
    const readyTypes = () => new Set(get().passes
      .filter((p) => p.assetId === assetId && p.status === "ready").map((p) => p.type));
    const missing = types.filter((t) => !readyTypes().has(t));
    // subject: canvas click/box selection wins; then the typed prompt; then default
    const prompt = get().subjectPrompt.trim() || "the subject";
    const makeMask = async () => {
      if (get().promptPoints.length || get().promptBox) await get().runSegment();
      else await get().runSegmentText(prompt);
    };
    for (const t of missing) {
      if (t === "mask") await makeMask();
      else if (t === "edge_matte") {
        // derived from a mask — make sure the mask exists first
        if (!readyTypes().has("mask")) {
          await makeMask();
          const dl = Date.now() + 180000;
          while (Date.now() < dl && !readyTypes().has("mask")) {
            await new Promise((r) => setTimeout(r, 1500));
            await get().refresh();
          }
        }
        const mask = get().passes.find((p) => p.assetId === assetId && p.status === "ready" && p.type === "mask");
        if (mask) await get().runEdgeMatte(mask.id);
      }
      else if (t === "optical_flow") await get().runFlow();
      else if (t === "depth" || t === "normals" || t === "body_parts") await get().runSapiens(t);
      else if (t === "face_landmarks") await get().runLandmarks("face");
      else if (t === "pose_landmarks") await get().runLandmarks("pose");
      else if (t === "hand_landmarks") await get().runLandmarks("hands");
      else if (t === "detection") await get().runDetect(prompt, 0.35);
    }
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const have = readyTypes();
      if (types.every((t) => have.has(t))) return true;
      await new Promise((r) => setTimeout(r, 1500));
      await get().refresh();
    }
    return types.every((t) => readyTypes().has(t));
  },

  // One-click effect: surface a model as a finished, tunable layer.
  runEffect: async (eff) => {
    const assetId = get().selectedAssetId;
    if (!assetId || get().effectBusy) return;
    set({ effectBusy: eff.id });
    try {
      const ok = await get().ensurePassTypes(eff.ensure);
      if (!ok) {
        set({ error: `${eff.label}: analysis didn't finish — check the job bar and try again.` });
        return;
      }
      const ready = get().passes.filter((p) => p.assetId === assetId && p.status === "ready");
      const byType = (t: string) => {
        const matches = ready.filter((p) => p.type === t);
        return matches.length ? matches[matches.length - 1].id : null;
      };
      const built: RenderLayer[] = eff.layers.map((bp) => ({
        id: uniqueId(),
        type: bp.type,
        name: bp.name,
        enabled: true,
        sources: Object.fromEntries(Object.entries(bp.sources).map(([k, t]) => [k, byType(t)])),
        params: { ...(defaultParams(layerDef(bp.type)!) ?? {}), ...(bp.params ?? {}) },
        blend: bp.blend ?? { mode: "normal", opacity: 1.0 },
      }));
      get().setLayers([...get().layers(), ...built]);
      set({ selectedLayerId: built[built.length - 1].id });
    } finally {
      set({ effectBusy: null });
    }
  },

  applyPresetAuto: async (preset) => {
    const ok = await get().ensurePassTypes(preset.requiredPassTypes);
    if (!ok) {
      set({ error: `${preset.name}: analysis didn't finish — try again.` });
      return;
    }
    get().applyPreset(preset);
  },

  audioConfig: () => {
    const raw = (get().project?.settings?.audioReactive ?? {}) as Partial<AudioReactiveConfig>;
    return { ...DEFAULT_AUDIO_CONFIG, ...raw };
  },

  setAudioReactive: (patch) => {
    const project = get().project;
    if (!project) return;
    const next: Project = {
      ...project,
      settings: { ...project.settings, audioReactive: { ...get().audioConfig(), ...patch } },
    };
    set({ project: next });
    debouncedSave(next);
  },

  setPlaying: (playing) => set({ playing }),
  setFrame: (currentFrame) => set({ currentFrame }),
  setMuted: (muted) => set({ muted }),
  setBaking: (baking) => set({ baking }),
  setError: (error) => set({ error }),
}));
