# Machine Vision — Implementation Plan

Companion to [PRD.md](PRD.md) v0.2. This document records the engineering decisions, resolves the PRD's open questions, and lays out a concrete build order optimized for a solo/small-team build where every phase ends with something runnable.

---

## 1. Guiding Strategy

Three principles drive everything below:

**1. Stub-first, GPU-last.** The entire pipeline — upload → pass generation → render layer → preview → export — must run end-to-end on a laptop with zero GPU before any real model is integrated. Cheap CPU providers (OpenCV GrabCut, Farneback flow, MediaPipe) stand in for SAM/Grounding DINO behind the provider interface. This de-risks the architecture (the model-agnostic rule gets tested on day one, not month three) and keeps dev velocity high on a Windows machine without CUDA setup.

**2. Schema-first.** The Vision Pass schemas are the contract between every part of the system (Python workers, FastAPI, React, WebGL renderer, export manifests). They get written first, versioned from v1, and shared via generated types — never hand-duplicated.

**3. Vertical slices over horizontal layers.** Each phase delivers one complete user-visible workflow, not one complete subsystem. Phase exit criteria are demos, not code coverage.

---

## 2. Resolved Open Questions (PRD §38)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Accounts for MVP? | **No.** Single-user, local/session projects. | Auth is pure overhead until there's a deployed beta. Add in Beta Hardening (Phase 7). Keep `owner_id` nullable in the schema now so it's a migration, not a rewrite. |
| 2 | Cloud mandatory for beta? | **No — same code runs locally or cloud.** Workers are Dockerized and storage is S3-API (MinIO locally). Deployment target is a config change, not a code path. | |
| 3 | Max upload duration? | **30s @ 1080p for beta.** Enforced at ingest. | Bounds GPU cost, job time, and mask storage. Raise later. |
| 4/5 | Which segmentation model? | **SAM 2.1 primary** (Apache-2.0, settled deployment story). SAM 3 becomes a second provider behind the same interface when licensing/hosting is clear. | Provider abstraction makes this a config swap. Never name SAM in UI — call it "Segmentation". |
| 6 | Grounding DINO in MVP? | **Yes, but stub-first.** Ship the stub detection provider in Phase 3; integrate real Grounding DINO (HF `grounding-dino-tiny/base`) in Phase 5 when GPU workers exist. | Open-vocab prompting is the product's core magic — it must ship in MVP, but it must not block the render system. |
| 7 | Florence in MVP? | **Phase 2 (post-MVP).** The provider interface accommodates it; nothing in MVP depends on captions/scene metadata. | |
| 8 | Transparent video export? | **PNG sequence is the MVP alpha format.** WebM/VP9-alpha as a bonus if FFmpeg cooperates; ProRes 4444 deferred. | PNG sequence is bulletproof and what AE/Resolve users actually trust. |
| 9 | WebGL2 or WebGPU? | **WebGL2 only for MVP.** Renderer is structured as a layer-pass chain so a WebGPU backend can be added behind the same layer interface later. | WebGPU still has support/driver variance; nothing in MVP needs compute shaders. |
| 10 | Marker tracking? | **Phase 4.** No MVP render layer depends on it. | |
| 11 | Local processing as pro plan? | **Defer the business decision; keep the architecture ready.** Workers already run locally via Docker, so a "local worker" product is packaging, not engineering. | |
| 12 | How opinionated should presets be? | **Very.** 12 curated starter presets (PRD §27.3), restrained defaults, original media legible by default. Presets are the new-user on-ramp. | |
| 13 | Correction marks in final renders? | **Yes, as an opt-in toggle** on Metadata Typography (off by default). Cheap to build, on-brand. | |
| 14 | Confidence as first-class visual source? | **Yes.** Confidence is a standard pass type and a routable source on every layer that can use it. It's the "failure as material" principle made concrete. | |
| 15 | Keyframes everywhere? | **No. MVP keyframes: opacity + one designated "strength" param per layer type**, linear interpolation only. The param schema marks which params are keyframeable so expanding later is additive. | |

---

## 3. Architecture Decisions

### AD-1: Monorepo layout
Use the PRD §36 structure as-is. Tooling: **npm workspaces** for JS (just `apps/web` + `packages/schemas` consumer), **uv** for Python (`apps/api`, `workers/*` share a uv workspace with a common `machine_vision_core` package for schemas/storage/queue helpers).

### AD-2: Schemas — Pydantic is canonical, TypeScript is generated
- Pydantic v2 models in `packages/schemas/python/` (importable by api + all workers).
- CI/script emits JSON Schema → `packages/schemas/json/` → `json-schema-to-typescript` emits `apps/web/src/types/generated/`.
- Every schema carries `schemaVersion`. Project JSON, preset JSON, and pass metadata embed it.
- Tests: round-trip fixtures for every pass type (the PRD §33.3 normalization tests live here).

### AD-3: Pass data storage formats
The pass *record* (DB row + JSON metadata) is separate from pass *data* (bulk frames in object storage):

| Pass type | Bulk format | Why |
|---|---|---|
| mask / edge_matte | 8-bit grayscale PNG per frame (`{pass}/{frame:06d}.png`), proxy-res for preview + source-res for final | Trivially decodable in browser via `createImageBitmap`, lossless, alpha-ready. RLE is a later optimization, not MVP. |
| detection / tracking / landmarks | Single JSON file per pass (frames array), normalized 0–1 coordinates | Small enough for video at 30s; browser parses in a Web Worker. |
| optical_flow | Per-frame 2-channel data packed into RG of a PNG (quantized, with min/max scale in metadata), proxy-res only for preview | Uploadable as a texture directly. Full-precision `.npy`/EXR only if final-render needs it (server side keeps float anyway). |
| confidence | Per-frame grayscale PNG or scalar series in JSON depending on source | |

All coordinates normalized to [0,1] so proxy/source resolution never causes misalignment (PRD §33.1 frame-accurate alignment).

### AD-4: Job system
**Celery + Redis broker**, but the **`jobs` table in Postgres is the source of truth** — workers write status/progress/error there; Celery is just transport. Frontend polls `GET /jobs` (2s interval, Web Worker); WebSocket push is a later upgrade. Every job is idempotent and chunk-resumable: video jobs process in frame-range chunks (e.g. 150 frames), persist chunk outputs to storage, and on retry skip completed chunks (PRD §30.3, §37.2.5).

### AD-5: Provider abstraction (Python)
```python
class VisionProvider(Protocol):
    name: str
    version: str
    capabilities: set[Capability]   # TEXT_PROMPT_DETECTION, CLICK_SEGMENTATION, VIDEO_TRACKING, ...
    def run_image(self, req: ProviderRequest) -> list[VisionPass]: ...
    def run_video(self, req: ProviderRequest) -> list[VisionPass]: ...
    def estimate_cost(self, req: ProviderRequest) -> CostEstimate: ...
```
- A **registry** maps capability → ordered provider list (primary + fallback). The API asks for capabilities, never provider names. UI shows capability labels ("Segmentation"), provider name only in pass metadata.
- All provider outputs flow through the **Supervision adapter** (`sv.Detections` as the lingua franca for boxes/masks/track-ids) before normalization to pass schemas.
- Every generated pass records `provider`, `providerVersion`, `params`, `prompt`, `seed` — this doubles as the cache key (AD-8).

### AD-6: Provider roster by phase
| Capability | Stub (Phase 3, CPU) | Real (Phase 5+, GPU) |
|---|---|---|
| Detection (open-vocab) | `StubDetector` — OpenCV saliency/contour boxes labeled with the prompt | Grounding DINO (HF transformers) |
| Segmentation (click/box) | GrabCut from box/click | SAM 2.1 image |
| Video mask tracking | Stub: per-frame GrabCut + IoU linking | SAM 2.1 video propagation (masklets) |
| Box tracking | ByteTrack via Supervision (real from day one — it's CPU) | same |
| Face/pose/hand landmarks | **MediaPipe Tasks (real from day one — CPU-fast)** | same; optional MediaPipe-JS in browser for instant preview later |
| Optical flow | OpenCV Farneback (real, CPU) | RAFT (optional upgrade) |

MediaPipe and Farneback being genuinely usable on CPU means three MVP pass types need no GPU at all.

### AD-7: Browser preview renderer
- **Raw WebGL2** (no Three.js for the 2D compositor — Three's scene graph buys nothing for a fullscreen-quad pass chain; keep Three.js available only if a 3D mesh view is wanted later).
- Architecture: **ping-pong framebuffer chain**. Each render layer = `{ fragmentShader | cpuKernel, uniforms ← params, textures ← routed passes }`. Source frame + pass textures in, composited frame out, in layer order with blend mode + opacity applied in a shared composite step.
- Stateful layers (datamosh preview, flow smear, trails) own persistent feedback FBOs keyed by layer id; seeking non-sequentially resets or fast-forwards them deterministically from the seed (documented preview/final difference, PRD §37.2.9).
- CPU-only effects (true pixel sort) run in a Web Worker on the proxy frame with OffscreenCanvas, uploaded as a texture; draft mode sorts at reduced resolution.
- Video frames come from a `<video>` element at proxy resolution via `texImage2D` (WebCodecs is a later optimization, not MVP).
- Overlay layers (mesh/labels/typography) render to a Canvas2D overlay texture — text and thin lines are miserable in raw GL; Canvas2D composited as a texture keeps them crisp and keeps the layer interface uniform.

### AD-8: Caching
Cache key = hash(assetId, frameRange, provider, providerVersion, prompt, params, seed, resolution). Checked before enqueueing any vision job; pass records store the key. Stored results are immutable — corrections create a new pass version rather than mutating in place (enables undo, PRD §33.2.7).

### AD-9: Datamosh — two engines, one contract
**Preview engine (browser, Phase 4):** flow-displaced feedback buffer. `prev_output` sampled through accumulated optical-flow displacement inside the mask, mixed with current frame by strength/decay; edge leak = feathered mask dilation; block artifacts simulated by quantizing displacement to 16px blocks. Honest label in UI: "preview approximation — final render uses real codec artifacts."

**Final engine (server, PyAV, Phase 5):**
1. Encode source (or frame-range) to MPEG-4/H.264 with controlled GOP (`g=keyframe_distance`, no scene-cut detection, B-frames off).
2. Bitstream surgery on packets: drop I-frames after the first (motion inherits), duplicate P-frames (delta persistence / "bloom"), optionally drop packets — all seeded-random per controls.
3. Decode with error concealment enabled → full-frame moshed render.
4. **Composite**: clean render + moshed render blended through the mask/edge-matte pass (feather/erode/dilate applied with OpenCV) → semantic datamosh (PRD §17.3 strategy, exactly).
5. Both intermediate renders persist to storage → "clean pass" and "datamosh pass" exports come for free.

Risk note: packet-level surgery is codec-finicky. Fallback that still ships the feature: decode→re-encode pipeline that *re-feeds prior decoded frames* as encoder input inside the mask (frame-blending mosh) — less authentic, fully controllable. Build the packet version first, keep the fallback in the back pocket. This is the single highest-risk component; it gets a standalone spike (Phase 0) before anything depends on it.

### AD-10: Final render engine (server)
Final renders must match preview semantics. To avoid maintaining two implementations of every effect: server render = **headless GPU/CPU Python implementations of each layer** (NumPy/OpenCV, moderngl where a shader is genuinely needed). Each layer type has a `LayerSpec` (params schema + required passes + documented preview/final differences) shared by both implementations, and **golden-frame tests** compare browser-rendered and server-rendered frames within tolerance for each layer type. Accept and document divergence where it's inherent (datamosh, feedback effects).

### AD-11: Storage & DB
- Postgres via SQLAlchemy + Alembic from day one (projects, assets, passes, layers, jobs, exports, presets tables mirroring PRD §15).
- Object storage behind a thin `Storage` interface; MinIO in docker-compose locally, S3 in cloud. Signed URLs for all upload/download (PRD §31).
- `infra/docker-compose.yml` runs postgres + redis + minio + api + workers; `docker compose up` is the entire dev environment. Web app runs on the host via Vite for fast HMR.

### AD-12: Determinism
Every stochastic effect takes a `seed`; PRNG is explicit (no global `random`), seeded per layer per frame as `hash(seed, frame)` so scrubbing is order-independent where the effect isn't inherently temporal. Pass generation params + seeds live in project JSON → re-running a project reproduces the export (PRD §5.2.5).

---

## 4. Build Plan

Ordered so every phase ends runnable. Rough effort assumes 1–2 builders; phases are sequential but 4 and 5 can interleave.

### Phase 0 — Spikes (de-risk before scaffolding) · ~1 week
The two things that could invalidate the architecture, proven in throwaway scripts first:
1. **PyAV mosh spike**: take any MP4 → drop I-frames / duplicate P-frames → decode with concealment → write result. Success = recognizable datamosh smear, controllable by GOP length. (Decides AD-9 primary vs fallback.)
2. **WebGL2 feedback spike**: single HTML file — video → ping-pong FBO → flow-displaced feedback masked by a hand-drawn PNG mask. Success = subject-only smear at 30fps on proxy res.
- Also: license check pass on SAM 2.1 / Grounding DINO / MediaPipe / Supervision for commercial hosting (PRD §30.1) — written into `docs/licenses.md`.

### Phase 1 — Repo, schemas, project shell · ~1–2 weeks
- Monorepo scaffold per PRD §36; docker-compose env (AD-11).
- All Pydantic pass/project/layer/job schemas + TS generation pipeline + round-trip tests (AD-2).
- FastAPI: project CRUD, jobs endpoints, signed-URL upload flow.
- React shell: workspace layout (PRD §20.1 panels, empty), project create/open, dark instrument-panel visual language baseline (PRD §9).
- **Exit demo:** create project, upload a file to MinIO via signed URL, see it listed.

### Phase 2 — Media pipeline · ~1–2 weeks
- `workers/video`: ingest job (validate codec/duration limits, extract metadata via PyAV), proxy generation (FFmpeg → 720p H.264), thumbnail, frame-extraction helper.
- Frontend: upload UX with progress/states, preview player on proxy (play/pause/scrub/frame-step/zoom/fit), timeline strip with frame numbers.
- Job status polling UI (bottom panel).
- **Exit demo:** upload 30s MOV → proxy generates → scrub it frame-accurately in the workspace.

### Phase 3 — Vision pass foundation (stub providers) · ~2 weeks
- Provider interface + registry + Supervision adapter (AD-5) with normalization tests.
- Providers live: StubDetector, GrabCut segmentation, MediaPipe face/pose/hands (real), Farneback flow (real), ByteTrack.
- `workers/vision` job handlers for detect/segment/track/landmarks/flow, chunked + cached (AD-4, AD-8).
- Prompt UI (text/click/box, thresholds, examples), Vision Pass panel (PRD §20.2), pass visualization in preview (mask tint, boxes, skeletons — debug-view aesthetic).
- Edge-matte derivation job (mask → edge matte, OpenCV morphology).
- **Exit demo:** upload video → click subject → tracked mask pass appears and overlays the scrubbing preview; face video → real face landmarks render.

### Phase 4 — Render layer stack + preview renderer · ~3 weeks
- WebGL2 pass-chain renderer (AD-7); layer stack UI, pass routing UI, param controls, blend/opacity, reorder/duplicate/disable.
- Layers in order of renderer-feature coverage: **Segmentation Matte View → Mask Edge Decay → ASCII Shader → Object Label Overlay (Canvas2D path) → Metadata Typography → Face/Pose/Hand overlays → Flow Smear (feedback path) → Pixel Sort (worker path) → Confidence View → Datamosh preview (everything combined)**.
- Basic keyframes: opacity + strength, linear (decision #15).
- **Exit demo:** the full Subject Mosh preview workflow on stub masks — PRD §37.3 slice 1 minus final render.

### Phase 5 — Real models + server datamosh + final render · ~3 weeks
- GPU worker image (CUDA base); SAM 2.1 image+video provider, Grounding DINO provider; DINO-boxes→SAM pipeline for Concept workflows; registry flips stubs to fallbacks.
- Mask correction v1: positive/negative click on a frame → re-propagate from that frame; corrections stored on masklet; undo = revert to prior pass version.
- Server datamosh engine per AD-9; server final-render engine per AD-10 (only layers needed for slice 1 first, then the rest).
- Datamosh modes: Subject Mosh, Background Collapse, Edge Rot. (Object Inheritance + Concept Mosh = fast-follow once tracking passes are reliable.)
- **Exit demo:** PRD §37.3 vertical slice 1 end-to-end with real SAM masks and real codec mosh.

### Phase 6 — Export + presets · ~2 weeks
- Export panel + `workers/render` export jobs: baked MP4/PNG, mask PNG sequence, datamosh pass, clean pass, transparent-overlay PNG sequence, metadata JSON, project JSON, bundle zip **with manifest** (PRD §37.2.6).
- Preset save/load/apply with required-pass-type checks and missing-pass UI; ship the 12 starter presets, curated against real footage.
- **Exit demo:** PRD §37.3 slices 2 and 3 end-to-end; export bundle opens correctly in AE/Resolve via PNG sequences.

### Phase 7 — Beta hardening · ~2 weeks
Job retries/resume polish, quotas + ingest limits enforcement, cleanup/GC jobs, auth (if deploying publicly), privacy controls + retention settings, error-message pass, perf pass (preview draft modes, mask decode), QA matrix across common codecs/phones' footage.

**Total: ~14–16 weeks to beta.** MVP demo-able (stub-powered) at end of Phase 4, ~7–8 weeks in.

---

## 5. First Vertical Slice — Concrete Task Breakdown

PRD §37.3 slice 1 ("person" Subject Mosh), as the spine the phases hang on:

1. `POST /projects` + workspace shell (P1)
2. Signed upload → ingest job → proxy job → preview player (P2)
3. Prompt "person" → detect job (stub) → boxes → segment job (GrabCut stub) → mask pass + tracked masklet (P3)
4. Mask pass renders as tinted overlay; edge matte derived (P3)
5. Add Subject Mosh layer; route mask + flow passes; adjust strength/edge-leak/decay/seed; WebGL feedback preview (P4)
6. `POST /render/final` → server datamosh job → composited final in storage (P5)
7. Export baked MP4 + mask PNG sequence + manifest (P6)

Each step is independently demo-able and each later phase only upgrades a step's internals (stub→SAM) without changing its contract.

---

## 6. Testing Strategy

- **Schema round-trip tests** for every pass type and project/preset JSON (Phase 1, run on both Python and generated TS via fixture files).
- **Normalization tests**: known raw model output fixtures → Supervision adapter → expected pass JSON (Phase 3).
- **Golden-frame tests**: per layer type, fixed input frame + passes + seed → compare server render to checked-in reference; browser renderer compared in a Playwright canvas-snapshot test at looser tolerance (Phase 4–5).
- **Export manifest tests**: bundle contents match manifest; frame counts match pass ranges (Phase 6).
- **Job chaos tests**: kill a worker mid-video-job, assert resume from chunk boundary (Phase 7).

---

## 7. Risk Register (ordered, with the engineering response already in the plan)

1. **Authentic mosh fragility** → Phase 0 spike before anything depends on it; fallback engine defined (AD-9).
2. **Preview/final divergence** → shared LayerSpec + golden-frame tests + documented differences (AD-10).
3. **SAM video tracking quality on real footage** → corrections v1 in Phase 5, confidence surfaced as material, stub fallback chain (AD-6).
4. **Browser perf with masks + feedback FBOs** → proxy-res everything, draft mode, Web Workers, PNG masks decoded via `createImageBitmap` (AD-3, AD-7).
5. **Scope creep across 12 MVP layers** → renderer-feature-coverage ordering in Phase 4 means cutting the tail (Confidence View, Hand Overlay) costs nothing structurally.
6. **Licensing surprises** → checked in Phase 0, recorded in `docs/licenses.md`, provider registry makes any swap a config change.
7. **Windows dev friction (GPU, FFmpeg)** → everything heavy runs in Docker; stub providers keep the host requirement at "Node + Docker Desktop".

---

## 8. Immediate Next Steps

1. Run the two Phase 0 spikes (PyAV mosh, WebGL2 feedback) — each is a one-file script, ~a day each.
2. `git init`, scaffold the monorepo per PRD §36, commit docker-compose with postgres/redis/minio.
3. Write the Pydantic schemas for Asset, VisionPass, Masklet, DetectionPass, TrackPass, RenderLayer, Job, Preset, ExportJob + the TS generation script.
4. Project CRUD + signed upload → Phase 1 exit demo.
