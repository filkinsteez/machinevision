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
  selectedLayerIds: string[];
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
  notice: string | null;
  setNotice: (n: string | null) => void;

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
  /** layers belonging to the selected asset (legacy unstamped layers included) */
  assetLayers: () => RenderLayer[];
  /** record=false skips undo history (migrations, prunes, undo/redo itself) */
  setLayers: (layers: RenderLayer[], record?: boolean) => void;
  updateLayer: (id: string, patch: Partial<RenderLayer>) => void;
  selectLayer: (id: string | null) => void;
  toggleLayerSelection: (id: string) => void;
  setLayerSelection: (ids: string[], primary: string | null) => void;
  undo: () => void;
  redo: () => void;
  copyLayers: () => void;
  pasteLayers: () => Promise<void>;
  deleteSelectedLayers: () => void;
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

// undo history: snapshots of the whole layer stack. Bursts within 800ms
// coalesce into one step so a slider drag is a single undo, not hundreds.
const undoStack: RenderLayer[][] = [];
const redoStack: RenderLayer[][] = [];
let lastRecordAt = 0;
// layer clipboard (in-app, survives clip switches; not the OS clipboard)
let layerClipboard: RenderLayer[] = [];

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
  selectedLayerIds: [],
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
  notice: null,
  setNotice: (notice) => set({ notice }),
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
    // migration: stamp legacy layers with the asset that owns their routed passes
    const passOwner = new Map(passes.map((p) => [p.id, p.assetId]));
    let changed = false;
    const stamped = get().layers().map((l) => {
      if (l.assetId) return l;
      const owner = Object.values(l.sources).map((v) => v && passOwner.get(v)).find(Boolean);
      if (owner) { changed = true; return { ...l, assetId: owner }; }
      return l;
    });
    if (changed) get().setLayers(stamped, false);
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
    if (changed) get().setLayers(next, false);
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
    layer.assetId = pass.assetId;
    for (const src of def.sources) {
      if (src.passTypes.includes(pass.type)) layer.sources[src.key] = pass.id;
    }
    get().setLayers([...get().layers(), layer]);
    set({ selectedLayerId: layer.id, selectedLayerIds: [layer.id], visiblePassId: null });
  },

  layers: () => get().project?.renderLayers ?? [],

  assetLayers: () => {
    const sel = get().selectedAssetId;
    return get().layers().filter((l) => !l.assetId || l.assetId === sel);
  },

  setLayers: (layers, record = true) => {
    const project = get().project;
    if (!project) return;
    if (record) {
      const now = Date.now();
      if (now - lastRecordAt > 800) {
        undoStack.push(project.renderLayers);
        if (undoStack.length > 60) undoStack.shift();
        redoStack.length = 0;
      }
      lastRecordAt = now;
    }
    const next = { ...project, renderLayers: layers };
    set({ project: next });
    debouncedSave(next);
  },

  updateLayer: (id, patch) => {
    const layers = get().layers().map((l) => (l.id === id ? { ...l, ...patch } : l));
    get().setLayers(layers);
  },

  selectLayer: (selectedLayerId) =>
    set({ selectedLayerId, selectedLayerIds: selectedLayerId ? [selectedLayerId] : [] }),

  toggleLayerSelection: (id) => set((s) => {
    const has = s.selectedLayerIds.includes(id);
    const ids = has ? s.selectedLayerIds.filter((x) => x !== id) : [...s.selectedLayerIds, id];
    return { selectedLayerIds: ids, selectedLayerId: has ? (ids[ids.length - 1] ?? null) : id };
  }),

  setLayerSelection: (ids, primary) => set({ selectedLayerIds: ids, selectedLayerId: primary }),

  undo: () => {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(get().layers());
    get().setLayers(prev, false);
    lastRecordAt = 0;
    const alive = new Set(prev.map((l) => l.id));
    set((s) => ({
      selectedLayerIds: s.selectedLayerIds.filter((i) => alive.has(i)),
      selectedLayerId: s.selectedLayerId && alive.has(s.selectedLayerId) ? s.selectedLayerId : null,
    }));
  },

  redo: () => {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(get().layers());
    get().setLayers(next, false);
    lastRecordAt = 0;
    const alive = new Set(next.map((l) => l.id));
    set((s) => ({
      selectedLayerIds: s.selectedLayerIds.filter((i) => alive.has(i)),
      selectedLayerId: s.selectedLayerId && alive.has(s.selectedLayerId) ? s.selectedLayerId : null,
    }));
  },

  copyLayers: () => {
    const sel = new Set(get().selectedLayerIds);
    if (!sel.size) return;
    layerClipboard = get().layers().filter((l) => sel.has(l.id))
      .map((l) => JSON.parse(JSON.stringify(l)) as RenderLayer);
    const n = layerClipboard.length;
    set({ notice: `Copied ${n} layer${n > 1 ? "s" : ""} — select a clip and Ctrl+V` });
  },

  // Paste means "this look, on THIS clip": every input re-targets to the
  // current clip's own analysis (generated on the fly if missing) — never
  // the clip the layers came from. Ghost layers are the one exception: a
  // ghost_blend exists to show ANOTHER clip's pixels, so cross-clip pastes
  // drop it (run Ghost on this clip to haunt on purpose).
  pasteLayers: async () => {
    if (!layerClipboard.length || get().effectBusy) return;
    const assetId = get().selectedAssetId;
    if (!assetId) return;
    set({ effectBusy: "paste" });
    try {
      const incoming = layerClipboard.filter((c) =>
        c.type !== "ghost_blend" || !c.assetId || c.assetId === assetId);
      const skipped = layerClipboard.length - incoming.length;
      if (!incoming.length) {
        set({ notice: "Clipboard only holds ghost layers — run Ghost on this clip instead." });
        return;
      }
      const passTypeOf = new Map(get().passes.map((p) => [p.id, p.type]));
      // a source can rewire to the same type as its original pass, or any
      // type the layer def accepts for that input (e.g. edge decay takes a
      // plain mask when there's no edge outline)
      const allowedFor = (layerType: string, key: string, orig: string | null) => {
        const t = orig ? passTypeOf.get(orig) : null;
        const defTypes = layerDef(layerType)?.sources.find((sd) => sd.key === key)?.passTypes ?? [];
        return [...new Set([...(t ? [t] : []), ...defTypes])];
      };
      const readyTypes = () => new Set(get().passes
        .filter((p) => p.assetId === assetId && p.status === "ready").map((p) => p.type));
      // run whatever analysis this clip is missing for the pasted look
      // (only types ensurePassTypes knows how to generate — e.g. "tracking"
      // comes from the Track effect, not from here)
      const generatable = new Set<string>(["mask", "edge_matte", "optical_flow", "depth",
        "normals", "body_parts", "face_landmarks", "pose_landmarks", "hand_landmarks", "detection"]);
      const needed = new Set<PassType>();
      for (const c of incoming) {
        if (!c.assetId || c.assetId === assetId) continue;
        for (const [k, v] of Object.entries(c.sources)) {
          if (!v) continue;
          const allowed = allowedFor(c.type, k, v);
          const orig = passTypeOf.get(v);
          if (!allowed.some((a) => readyTypes().has(a)) && orig && generatable.has(orig)) {
            needed.add(orig as PassType);
          }
        }
      }
      if (needed.size) {
        set({ notice: `Analyzing this clip for the pasted look: ${[...needed].join(", ")}…` });
        await get().ensurePassTypes([...needed]);
      }
      const ready = get().passes.filter((p) => p.assetId === assetId && p.status === "ready");
      const latestOf = (types: string[]) => {
        for (const t of types) {
          const m = ready.filter((p) => p.type === t);
          if (m.length) return m[m.length - 1].id;
        }
        return null;
      };
      const built = incoming.map((c) => {
        const l = JSON.parse(JSON.stringify(c)) as RenderLayer;
        const from = l.assetId;
        l.id = uniqueId();
        l.assetId = assetId;
        if (from && from !== assetId && l.type !== "ghost_blend") {
          // null (inert ⚠) when this clip truly lacks an input —
          // never a silent bleed from the old clip
          l.sources = Object.fromEntries(Object.entries(l.sources).map(([k, v]) =>
            [k, v ? latestOf(allowedFor(l.type, k, v)) : v]));
        }
        return l;
      });
      get().setLayers([...get().layers(), ...built]);
      const name = get().assets.find((a) => a.id === assetId)?.name?.replace(/\.[^.]+$/, "") ?? "clip";
      set({
        selectedLayerId: built[built.length - 1].id,
        selectedLayerIds: built.map((b) => b.id),
        notice: `Pasted ${built.length} layer${built.length > 1 ? "s" : ""} onto ${name.slice(0, 24)}` +
          (skipped ? ` · skipped ${skipped} ghost layer${skipped > 1 ? "s" : ""}` : ""),
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ effectBusy: null });
    }
  },

  deleteSelectedLayers: () => {
    const sel = new Set(get().selectedLayerIds);
    if (!sel.size) return;
    get().setLayers(get().layers().filter((l) => !sel.has(l.id)));
    set({ selectedLayerId: null, selectedLayerIds: [] });
  },

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
      assetId: selectedAssetId,
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
      if (eff.special === "people") {
        const project = get().project;
        if (!project) return;
        const r = await api.people(project.id, assetId);
        if (r.job) {
          const deadline = Date.now() + 240000;
          while (Date.now() < deadline) {
            await new Promise((res) => setTimeout(res, 1500));
            await get().refresh();
            const det = get().passes.find((p) => p.id === r.pass.id);
            if (det?.status === "ready") break;
            if (det?.status === "failed") {
              set({ error: `People: ${det.error ?? "analysis failed"}` });
              return;
            }
          }
        }
        const built: RenderLayer[] = eff.layers.map((bp) => ({
          id: uniqueId(),
          type: bp.type,
          name: bp.name,
          enabled: true,
          assetId,
          sources: Object.fromEntries(Object.entries(bp.sources).map(([k, t]) =>
            [k, t === "detection" ? r.pass.id : r.posePassId])),
          params: { ...(defaultParams(layerDef(bp.type)!) ?? {}), ...(bp.params ?? {}) },
          blend: bp.blend ?? { mode: "normal", opacity: 1.0 },
        }));
        get().setLayers([...get().layers(), ...built]);
        set({ selectedLayerId: built[built.length - 1].id, selectedLayerIds: built.map((b) => b.id) });
        return;
      }
      if (eff.special === "ghost") {
        // haunt the current clip with ANOTHER clip's analysis — the good part
        // of the old cross-clip contamination bug, on purpose this time
        const donors = get().passes.filter((p) => p.assetId !== assetId && p.status === "ready");
        if (!donors.length) {
          set({ error: "Ghost needs a second clip with analysis — run some effects on another clip first." });
          return;
        }
        const donorAsset = donors[donors.length - 1].assetId; // most recent donor
        const donorName = get().assets.find((a) => a.id === donorAsset)?.name?.replace(/\.[^.]+$/, "") ?? "other clip";
        const dp = (t: string) => {
          const m = donors.filter((p) => p.assetId === donorAsset && p.type === t);
          return m.length ? m[m.length - 1].id : null;
        };
        const mk = (type: string, name: string, sources: Record<string, string | null>,
                    params: RenderLayer["params"], blend?: RenderLayer["blend"]): RenderLayer => ({
          id: uniqueId(), type, name: `${name} ⟵ ${donorName.slice(0, 18)}`, enabled: true,
          assetId,
          sources,
          params: { ...(defaultParams(layerDef(type)!) ?? {}), ...params },
          blend: blend ?? { mode: "normal", opacity: 1.0 },
        });
        const built: RenderLayer[] = [];
        const gMask = dp("mask");
        const gFlow = dp("optical_flow");
        // 1. the core of the original glitch: the donor's ACTUAL pixels
        //    blended through this clip (donorAssetId drives a hidden synced video)
        built.push(mk("ghost_blend", "Blend-Through", gMask ? { mask: gMask } : {},
          { mode: "screen", amount: 0.65, key: 0.35, donorAssetId: donorAsset }));
        // 2. the donor's FORMS as fields — this is what read as "the other video
        //    showing through" in the accident: its people rendered as depth heat
        //    and body-part color inside this clip
        const gDepth = dp("depth");
        if (gDepth) {
          built.push(mk("sapiens_depth", "Ghost Depth", { field: gDepth },
            { mode: "colormap", color: "#2962FF" }, { mode: "screen", opacity: 0.5 }));
        }
        const gParts = dp("body_parts");
        if (gParts) {
          built.push(mk("body_parts", "Ghost Parts", { field: gParts },
            { mode: "colorize", partId: "3: Hair", color: "#FF5A00", saturation: 0.7 },
            { mode: "screen", opacity: 0.45 }));
        }
        // 3. motion contamination + phantom skeletons
        if (gMask && gFlow) {
          built.push(mk("datamosh_preview", "Ghost Mosh", { mask: gMask, flow: gFlow },
            { mode: "subject", strength: 0.9, decay: 0.97, blockSize: 14, edgeLeak: 0.45, seed: 66 }));
        } else if (gFlow) {
          built.push(mk("flow_smear", "Ghost Drag", { flow: gFlow },
            { strength: 4, decay: 0.95, region: "all" }));
        }
        const gPose = dp("pose_landmarks");
        const gFace = dp("face_landmarks");
        if (gPose) {
          built.push(mk("landmark_overlay", "Ghost Pose", { landmarks: gPose },
            { style: "skeleton", lineWidth: 1.4, pointSize: 2.5, color: "#2962FF",
              dropout: 0.15, trail: 10, seed: 9 }));
        } else if (gFace) {
          built.push(mk("landmark_overlay", "Ghost Mesh", { landmarks: gFace },
            { style: "wireframe", lineWidth: 0.6, pointSize: 0, color: "#2962FF",
              dropout: 0.2, trail: 0, seed: 9 }));
        }
        if (!built.length) {
          set({ error: `Ghost: "${donorName}" has no usable analysis (mask, motion, pose, or face).` });
          return;
        }
        get().setLayers([...get().layers(), ...built]);
        set({ selectedLayerId: built[built.length - 1].id, selectedLayerIds: built.map((b) => b.id) });
        return;
      }
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
        assetId,
        sources: Object.fromEntries(Object.entries(bp.sources).map(([k, t]) => [k, byType(t)])),
        params: { ...(defaultParams(layerDef(bp.type)!) ?? {}), ...(bp.params ?? {}) },
        blend: bp.blend ?? { mode: "normal", opacity: 1.0 },
      }));
      get().setLayers([...get().layers(), ...built]);
      set({ selectedLayerId: built[built.length - 1].id, selectedLayerIds: built.map((b) => b.id) });
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
