# UX Principles — Machine Industries

Distilled from research into TouchDesigner, Resolume, Runway, CapCut, Lightroom,
Photoshop, Figma, Hydra, DaVinci Resolve, MilkDrop/projectM, plus five reference
pieces (Erlingsson, Daws, zackslab, causasui) that define the target output.
Drives the 2026 "effects rail" redesign.

## The reference aesthetic (what the tool must make easy)

All five reference pieces share one recipe: **real footage + ONE bold, legible
machine-perception layer.** Numbered detection labels ("0. face, 1. earring"),
depth map + pose skeleton previs, event-camera point clouds with hit HUDs,
detection boxes + floating typography. The source stays recognizable; the CV
output *is* the graphic design. Even hallucinated detections are kept as charm.
The failure mode to avoid is layered preset soup.

## Principles

1. **Outcome-first naming** (Runway). Users click what they want to see —
   "Gaze", "Pose", "Datamosh" — never model or pipeline nouns. Models are
   invisible implementation.
2. **One click = one bold effect** (CapCut effects browser). Every capability is
   a single row in an EFFECTS rail; clicking runs whatever analysis it needs
   (cached) and lands a finished, tunable layer. No routing step exists on the
   happy path.
3. **Adjustment-stack mental model** (Photoshop). The layer stack with eye
   toggles/opacity/drag-order is the one structural UI. Pass routing survives
   only in the advanced altitude.
4. **Two altitudes, opt-in depth** (Resolve Edit vs Color page). EFFECTS is the
   instrument; LAB (prompt-driven analysis, raw pass management) is the workshop.
   Same engine, never forced.
5. **Instrument, not workshop** (Resolume vs TouchDesigner). Fixed structure:
   Source → Effects stack → Export. Users never assemble pipelines.
6. **Presets are editable recipes, not endpoints** (Lightroom). Demoted to a
   collapsed COMBOS section; applying one decomposes into the same visible,
   editable stack. "Save current stack" makes user-authored combos first-class.
7. **You do something, you see something** (Hydra/Runway). Analysis is cached
   per source; effects with cached analysis apply instantly (● marker); slow
   work happens once and is reused by every effect that needs it.
8. **Surface every model** — if the data exists, it's an effect. Gaze shipped
   this way: the face pass already carried 478 landmarks including both irises;
   gaze is a pure client-side derivation. Audit new passes for latent signals.
9. **Audio-reactivity must self-calibrate** (MilkDrop, contra Resolume's gain
   faders). Per-band auto-gain (divide by ~4s running average) + spectral-flux
   onset detection with a median adaptive threshold. One toggle + one Intensity
   slider; zero per-track tuning; offline analysis is the same pure DSP so
   exports match preview. Verified by `apps/web/scripts/test_audio_dsp.ts`.

## What changed in the redesign

- Left rail: `EFFECTS` (SEE: Objects, Gaze, Face Mesh, Pose, Hands, Depth,
  Body Parts, Surface · STYLE: Cutout, Datamosh, Pixel Sort, ASCII, Motion
  Smear, Depth Warp, Edge Decay · COMBOS collapsed) with `LAB` as the advanced tab.
- New Gaze overlay derived from iris landmarks (rays/reticle, smoothing, angle readout).
- Numbered detection labels ("0. face") as the Objects effect default — the
  reference-piece look.
- Audio engine rewritten on `audioDsp.ts` (MilkDrop AGC + spectral flux, FFT
  2048/hop 512, instant-attack 220 ms-release beat envelope); gain/smoothing
  sliders deleted.
