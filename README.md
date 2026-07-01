# Machine Industries

**machine.industries** — a hybrid creative web app for turning computer vision analysis into rendered visual artifacts — semantic datamosh, segmentation effects, face/pose meshes, object-locked overlays, optical-flow smears, ASCII shaders, pixel sorting, and exportable vision passes.

> Machine Industries lets artists render what the machine thinks it sees.

## Documents

- [PRD.md](PRD.md) — full product requirements (v0.2)
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — architecture decisions, resolved open questions, phased build plan

## Running it (local dev mode)

Backend (FastAPI + SQLite + local storage — Python 3.12 via uv):

```powershell
cd apps/api
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
uv pip install --python .venv\Scripts\python.exe --force-reinstall opencv-contrib-python
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

If port 8000 is taken (e.g. by ComfyUI), run the API elsewhere and point the web
dev server at it: `uvicorn app.main:app --port 8010` and set
`VITE_API_TARGET=http://127.0.0.1:8010` before `npm run dev`.

Frontend (Vite + React + WebGL2):

```powershell
cd apps/web
npm install
npm run dev    # http://localhost:5173
```

Smoke test (full vertical slice, no browser needed):

```powershell
cd apps/api
.\.venv\Scripts\python.exe scripts\make_test_clip.py
.\.venv\Scripts\python.exe scripts\smoke_test.py
```

## What works (Phase 1–6 vertical slice, stub providers)

- Upload image/video → PyAV ingest, proxy, thumbnail (no external FFmpeg needed)
- **Real GPU providers when CUDA is available**: SAM 2.1 segmentation with native video
  masklet propagation (click/box/text prompts) and Grounding DINO open-vocabulary
  detection ("bird" finds birds), via HuggingFace transformers. Without CUDA the stub
  roster (GrabCut + CSRT, saliency detector) takes over automatically. MediaPipe
  face/pose/hand landmarks (Tasks API), Farneback optical flow, ByteTrack tracking via
  Supervision, derived edge mattes — all real on CPU.
- **Meta Sapiens** (GPU): human-centric foundation models — 28-class body-part
  segmentation, depth, and surface normals (sapiens-0.3b torchscript). Body parts can
  be colorized/isolated or derived into a mask (hair, torso, clothing…) that feeds the
  datamosh / pixel-sort / edge-decay layers; depth renders as colormap/tint/fog, drives
  a glassy **depth-displacement** relief/parallax layer; normals as RGB or relief lighting.
  Curated Sapiens presets (Depth Relief, Depth Fog, Surface Relief, Body Part Field,
  Isolate Hair).
- **Audio-reactive mode**: the selected video's own audio drives the render — bass shakes
  edges, energy boosts flow/ASCII, beats kick the datamosh, plus a level/beat pulse on the
  final image. Live analyser for preview and a matching offline PCM pass so baked exports
  react identically. Toggle with RX in the transport; tune in the AUDIO panel.
  GPU extras: `uv pip install torch torchvision --index-url
  https://download.pytorch.org/whl/cu126` then `uv pip install transformers`
  (models download from HF Hub on first use, ~1.5 GB)
- WebGL2 preview compositor: matte view, mask edge decay, ASCII shader, CPU pixel sort,
  flow smear, datamosh preview (flow-displaced feedback), object labels, landmark
  overlays, metadata typography
- **Authentic codec datamosh**: server-side MPEG-4 packet surgery (I-frame drops,
  P-frame duplication) composited through the mask — subject / background modes
- Exports: baked MP4 (codec engine), frame-accurate browser bake, datamosh pass,
  clean pass, mask PNG sequence zips, metadata JSON, project JSON
- Starter presets with required-pass gating, custom preset save

Local dev mode = SQLite + threaded jobs + disk storage behind the production
interfaces (Postgres/Celery/S3 swap points per IMPLEMENTATION_PLAN AD-4/AD-11).
