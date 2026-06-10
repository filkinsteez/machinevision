# Machine Vision PRD

Version: 0.2
Status: Draft
Product Type: Hybrid creative web application
Primary Users: Artists, designers, video editors, creative technologists, VJs, motion designers, installation artists
Current Scope: Standalone web app with hybrid cloud/local processing
Deferred Scope: After Effects extension, Premiere integration, Resolve integration, TouchDesigner bridge, native plugins

---

# 1. Product Summary

Machine Vision is a hybrid creative tool for turning computer vision analysis into rendered visual artifacts.

The product allows users to upload images or videos, run vision models over the media, and route the resulting machine perception into creative render layers such as semantic datamosh, segmentation effects, face mesh overlays, pose trails, object labels, optical-flow smears, ASCII shaders, pixel sorting, marker-locked graphics, and metadata-driven visual treatments.

The core idea is:

> Machine Vision lets artists render what the machine thinks it sees.

Machine Vision is not a generic glitch filter tool. It is a vision-pass compositor. Model outputs such as masks, boxes, tracks, landmarks, confidence scores, motion fields, meshes, and metadata become creative material.

The tool should feel like an instrumented visual system: analytical, restrained, tactile, strange, and authored. The aesthetic should come from real computational artifacts, not decorative cyberpunk UI or stock glitch presets.

---

# 2. Product Positioning

Machine Vision sits between:

1. A browser-based creative coding tool
2. A computer vision analysis system
3. A video compositor
4. A shader playground
5. A semantic datamosh engine
6. A pass-export tool for professional workflows

It should be usable by non-engineers, but powerful enough for creative technologists.

The product should not require users to understand model architecture, FFmpeg, segmentation internals, optical flow, or shader code. However, it should expose enough meaningful controls for artists to intentionally shape the result.

---

# 3. Core Product Sentence

Machine Vision is a hybrid creative web tool for turning computer vision analysis into rendered image and video artifacts, including semantic datamosh, segmentation effects, face and pose meshes, object-locked overlays, optical-flow smears, ASCII shaders, pixel sorting, and exportable vision passes.

---

# 4. Problem

Artists and designers increasingly want to use computer vision aesthetics in their work, but current workflows are fragmented.

Typical current workflow:

1. Use one tool for segmentation.
2. Use another tool for object detection.
3. Use Python scripts for tracking.
4. Use After Effects for compositing.
5. Use FFmpeg hacks for datamosh.
6. Use custom shaders for rendering.
7. Manually align masks, frames, labels, and overlays.
8. Lose repeatability and editability.

This makes the workflow inaccessible, brittle, slow, and hard to reproduce.

Existing tools often fall into one of three categories:

1. Technical CV demos that are not artist-friendly.
2. Generic glitch tools that lack meaningful vision data.
3. Professional compositors that require too much manual setup.

Machine Vision solves this by making vision outputs reusable, composable, and exportable.

---

# 5. Product Goals

## 5.1 Primary Goals

1. Let users upload images and videos.
2. Let users generate computer vision passes from media.
3. Let users route those passes into creative render layers.
4. Let users create semantic datamosh effects driven by masks, tracks, and model confidence.
5. Let users create mesh, pose, object, mask, ASCII, pixel-sort, and flow-based visuals.
6. Let users adjust controls visually without code.
7. Let users save looks as reusable presets.
8. Let users export baked results and separate passes.
9. Let users work in a browser while heavy processing happens on the server.
10. Build a model-agnostic architecture that can evolve beyond any single model provider.

## 5.2 Creative Goals

1. Make real machine perception visible.
2. Preserve the texture of model uncertainty and failure.
3. Avoid generic glitch aesthetics.
4. Make effects feel anchored to subjects, objects, surfaces, and motion.
5. Make artifacts repeatable through deterministic seeds and saved project state.
6. Let users choose between clean analytical renderings and destructive perceptual corruption.

## 5.3 Technical Goals

1. Separate analysis from rendering.
2. Separate browser preview from server final render.
3. Support a Vision Graph architecture.
4. Use Supervision as backend CV infrastructure where useful.
5. Use provider abstractions for models.
6. Make render layers consume standardized vision passes.
7. Cache expensive analysis results.
8. Support asynchronous GPU jobs.
9. Support long-running video render jobs.
10. Support project persistence and export reproducibility.

---

# 6. Non-Goals

The following are out of scope for the first major product build:

1. After Effects plugin or extension.
2. Premiere, Resolve, or Blender plugin.
3. TouchDesigner bridge.
4. Native desktop app.
5. Mobile app.
6. Real-time livestream production.
7. Collaborative multiplayer editing.
8. Training custom models.
9. Marketplace for presets.
10. Full node-based compositor.
11. Full non-linear video editor.
12. Audio-reactive engine.
13. Full 3D scene reconstruction.
14. Full browser-only SAM processing.
15. Full browser-native true datamosh.

These can be future phases.

---

# 7. Target Users

## 7.1 Primary User: Visual Artist

Needs:

1. Upload an artwork, image, or video.
2. Add machine-vision overlays, masks, mesh, and glitches.
3. Tune the result aesthetically.
4. Export the final visual.
5. Export separate passes for further editing.

Typical output:

1. Gallery video loop.
2. Still image.
3. Music video asset.
4. Poster or print.
5. Installation visual.

## 7.2 Primary User: Motion Designer

Needs:

1. Process short clips.
2. Generate clean masks and overlays.
3. Create object-specific glitch effects.
4. Export passes for compositing elsewhere.
5. Save reusable looks.

Typical output:

1. Motion test.
2. Title sequence element.
3. Social video.
4. Editorial animation.

## 7.3 Primary User: Creative Technologist

Needs:

1. Use advanced controls.
2. Generate data-driven visual passes.
3. Export metadata.
4. Integrate outputs into custom pipelines.
5. Test model-driven aesthetics quickly.

Typical output:

1. Prototype.
2. Installation asset.
3. Realtime system reference.
4. Dataset-driven visual experiment.

## 7.4 Secondary User: Video Editor

Needs:

1. Upload a clip.
2. Prompt the tool to track an object or subject.
3. Generate semantic datamosh or masks.
4. Export result.
5. Bring result into editing software manually.

Typical output:

1. Music video effect.
2. Experimental cutaway.
3. B-roll treatment.
4. Social teaser.

---

# 8. Product Principles

## 8.1 Real Perception Over Fake UI

The visual output should be based on actual model outputs whenever possible.

Good:

1. Real face topology.
2. Real segmentation masks.
3. Real object IDs.
4. Real confidence values.
5. Real optical flow.
6. Real frame memory.

Bad:

1. Random fake boxes.
2. Fake sci-fi labels.
3. Generic glitch overlays.
4. Decorative HUD clutter.
5. Random RGB split as a default style.

## 8.2 Anchored Effects

Effects should attach to what the machine sees.

Examples:

1. Datamosh only the subject.
2. Pixel-sort only hair.
3. ASCII-render the background.
4. Attach mesh to a face.
5. Attach labels to tracked objects.
6. Corrupt only uncertain mask edges.

## 8.3 Failure As Material

The tool should expose and aestheticize uncertainty.

Examples:

1. Mask holes.
2. Landmark dropout.
3. Tracking drift.
4. Confidence flicker.
5. Edge instability.
6. Occlusion artifacts.

## 8.4 Composable Vision Passes

Every analysis output should become a reusable pass.

Render layers should consume passes instead of directly depending on a specific model.

## 8.5 Export Is Core

Users must be able to export:

1. Baked result.
2. Transparent overlay.
3. Mask pass.
4. Datamosh pass.
5. Metadata JSON.
6. Project JSON.
7. Preset JSON.

---

# 9. Visual Language

Machine Vision should feel analytical, computational, spare, and material.

The aesthetic should be closer to:

1. Computer vision debug views.
2. Scientific imaging.
3. Surveillance annotation.
4. Mesh reconstruction.
5. Motion-vector artifacts.
6. Compression failure.
7. Low-bit imaging.
8. Optical instruments.
9. Edge detection.
10. Structural image analysis.

The aesthetic should avoid:

1. Stock hacker UI.
2. Neon cyberpunk overload.
3. Generic glitch presets.
4. Excessive RGB split.
5. Random fake scanlines.
6. Decorative sci-fi ornaments.
7. Cartoon AI-filter polish.
8. Overdesigned SaaS UI aesthetics.

Recommended default palette:

1. Black.
2. White.
3. Neutral gray.
4. Safety orange.
5. Signal green.
6. Video blue.
7. Thermal red as an accent.
8. Indexed low-bit palettes for certain effects.

Typography:

1. Small monospace labels.
2. Sparse frame metadata.
3. Track IDs.
4. Confidence values.
5. Model pass names.
6. Frame numbers.
7. Prompt labels.
8. Minimal object labels.

---

# 10. Core Concept: Vision Passes

A Vision Pass is any reusable analysis result generated from an image or video.

Examples:

1. Mask pass.
2. Object detection pass.
3. Object tracking pass.
4. Face mesh pass.
5. Pose pass.
6. Hand landmark pass.
7. Optical flow pass.
8. Confidence pass.
9. Depth-like pass.
10. Motion-vector pass.
11. Marker tracking pass.
12. Metadata pass.

Render layers consume Vision Passes.

Example:

Pixel Sort uses:

1. Mask pass as affected region.
2. Optical flow pass as direction.
3. Confidence pass as strength modulation.

Semantic Datamosh uses:

1. Mask pass as region.
2. Tracking pass as identity.
3. Motion pass as corruption driver.
4. Confidence pass as edge instability driver.

ASCII Shader uses:

1. Source image as luminance.
2. Segmentation pass as region selector.
3. Detection pass as glyph source.
4. Motion pass as density driver.

---

# 11. Core Concept: Vision Graph

The Vision Graph is the internal system that connects model providers, intermediate analysis, render layers, and exports.

Model providers do not directly render effects. They produce standardized passes.

Architecture:

```text
Input Media
  ↓
Vision Graph
  ↓
Vision Passes
  ↓
Render Layers
  ↓
Preview
  ↓
Final Render
  ↓
Export Passes
```

Model-specific outputs are normalized into common internal schemas.

Examples:

```text
SAM mask output
  → Mask Pass

Grounding DINO detection output
  → Detection Pass

MediaPipe landmarks
  → Landmark Pass

Optical flow output
  → Motion Pass

Tracker output
  → Tracking Pass
```

The render system only talks to normalized passes.

This prevents the product from becoming locked to a single model.

---

# 12. Computer Vision Architecture

## 12.1 Vision Engine

The Vision Engine contains multiple model layers.

```text
Vision Engine
├── Detection Layer
│   ├── Grounding DINO
│   ├── Florence-style provider
│   ├── YOLO-style provider
│   └── Future detectors
│
├── Segmentation Layer
│   ├── SAM 3 provider
│   ├── SAM 2.1 provider
│   ├── Interactive segmentation provider
│   └── Future segmenters
│
├── Tracking Layer
│   ├── SAM video tracking
│   ├── ByteTrack
│   ├── Optical-flow-assisted tracking
│   └── Future trackers
│
├── Landmark Layer
│   ├── Face landmarks
│   ├── Pose landmarks
│   ├── Hand landmarks
│   └── Future landmark models
│
├── Motion Layer
│   ├── Optical flow
│   ├── Frame difference
│   ├── Motion vectors
│   └── Temporal analysis
│
├── Marker Layer
│   ├── AprilTag-style fiducials
│   ├── ArUco-style markers
│   └── Homography tracking
│
└── Pass Normalization Layer
    └── Vision Graph schemas
```

## 12.2 Model-Agnostic Rule

No render layer should depend directly on SAM, MediaPipe, Grounding DINO, Florence, YOLO, or any single model.

Correct:

```text
Render layer consumes Mask Pass.
```

Incorrect:

```text
Render layer consumes SAM output directly.
```

Correct:

```text
Render layer consumes Landmark Pass.
```

Incorrect:

```text
Render layer consumes MediaPipe raw output directly.
```

---

# 13. Supervision Integration

## 13.1 What Supervision Is For

Supervision should be used as backend infrastructure for computer vision plumbing.

It is not a user-facing product feature.

Supervision responsibilities:

1. Unified detections abstraction.
2. Video frame iteration.
3. Video writing helpers.
4. Detection filtering.
5. Mask handling.
6. Bounding box handling.
7. Tracker integration.
8. Annotation primitives for internal previews.
9. Interoperability between model outputs.
10. Utility functions for CV pipelines.

Supervision should help standardize the backend pipeline across detection, segmentation, and tracking providers.

## 13.2 What Supervision Is Not For

Supervision should not be responsible for:

1. Creative render system.
2. Datamosh engine.
3. Shader rendering.
4. Product UI.
5. Preset system.
6. Export orchestration.
7. Final aesthetic decisions.
8. Timeline editing.
9. Project model.
10. Browser preview rendering.

## 13.3 How Supervision Fits

Backend flow:

```text
Raw model output
  ↓
Supervision utility layer
  ↓
Normalized Machine Vision pass schema
  ↓
Render engine
```

Example:

```text
Grounding DINO output
  ↓
Supervision Detections
  ↓
Machine Vision Detection Pass
```

Example:

```text
SAM masks
  ↓
Supervision mask utilities
  ↓
Machine Vision Mask Pass
```

Example:

```text
Detection Pass
  ↓
Tracker
  ↓
Machine Vision Track Pass
```

## 13.4 Supervision Integration Requirements

The backend should include an adapter layer:

```text
app/vision/adapters/supervision_adapter.py
```

Responsibilities:

1. Convert external model outputs into Supervision objects.
2. Convert Supervision objects into Machine Vision pass schemas.
3. Apply filtering, thresholding, and class selection.
4. Attach track IDs where available.
5. Preserve confidence values.
6. Preserve frame numbers.
7. Preserve mask references.
8. Preserve bounding boxes.
9. Preserve labels.
10. Preserve metadata.

---

# 14. Vision Model Providers

## 14.1 Provider Abstraction

Every model integration should implement a provider interface.

Provider interface:

```text
Provider
├── name
├── version
├── capabilities
├── input requirements
├── output pass types
├── estimate cost
├── run image job
├── run video job
└── normalize output
```

Capabilities may include:

1. Text prompt detection.
2. Box prompt segmentation.
3. Click prompt segmentation.
4. Mask prompt refinement.
5. Image segmentation.
6. Video segmentation.
7. Object tracking.
8. Multi-object tracking.
9. Face landmarks.
10. Pose landmarks.
11. Hand landmarks.
12. Motion estimation.
13. Marker tracking.

## 14.2 SAM Provider

Purpose:

1. Generate high-quality masks.
2. Track prompted objects across video.
3. Refine masks from clicks, boxes, or existing masks.
4. Produce masklets for creative routing.

Prompt types:

1. Text prompt where available.
2. Click prompt.
3. Box prompt.
4. Mask prompt.
5. Exemplar prompt where available.

Outputs:

1. Mask pass.
2. Track pass.
3. Confidence pass.
4. Prompt metadata.
5. Per-frame mask references.

Use cases:

1. Segment person.
2. Segment background.
3. Segment red jacket.
4. Segment all hands.
5. Segment guitar.
6. Segment object selected by click.
7. Track object through video.
8. Generate edge matte from mask.

## 14.3 Grounding DINO Provider

Purpose:

1. Open-vocabulary object detection.
2. Detect objects from natural language prompts.
3. Generate boxes that can be passed into segmentation providers.

Prompt examples:

1. all people
2. all faces
3. all hands
4. all windows
5. all plants
6. all televisions
7. all chairs
8. all text regions
9. the guitar
10. the microphone

Outputs:

1. Detection pass.
2. Bounding boxes.
3. Labels.
4. Confidence values.
5. Candidate regions for segmentation.

Use cases:

1. Detect all instances of a concept.
2. Generate boxes for SAM.
3. Create label overlays.
4. Drive object-specific effects.
5. Generate track seeds.

## 14.4 Florence-Style Provider

Purpose:

1. Higher-level semantic scene understanding.
2. Promptable detection or region understanding.
3. Flexible image understanding workflows.
4. Future caption or description-driven effects.

Outputs may include:

1. Detection pass.
2. Region descriptions.
3. Text region detection.
4. Object labels.
5. Scene metadata.
6. Prompt response metadata.

Use cases:

1. Find all text.
2. Find the dancer.
3. Find the audience.
4. Find the guitar.
5. Find objects described semantically.
6. Generate scene-level metadata for visual overlays.

## 14.5 YOLO-Style Provider

Purpose:

1. Fast object detection.
2. Preview object boxes.
3. Lightweight detection where open-vocabulary is unnecessary.
4. Potential browser or server inference.

Outputs:

1. Detection pass.
2. Object labels.
3. Bounding boxes.
4. Confidence values.

Use cases:

1. Quick preview boxes.
2. Common object tracking.
3. Fast label overlays.
4. Real-time-ish browser experiments.

## 14.6 MediaPipe-Style Landmark Providers

Purpose:

1. Face mesh.
2. Body pose.
3. Hand landmarks.
4. Fast browser preview where possible.

Outputs:

1. Face landmark pass.
2. Pose landmark pass.
3. Hand landmark pass.
4. Landmark confidence pass.
5. Derived skeleton or topology pass.

Use cases:

1. Render face mesh.
2. Render body skeleton.
3. Render hand joints.
4. Attach shaders to face, body, or hands.
5. Drive effects from joint velocity.
6. Protect facial features during datamosh.
7. Use fingertips as emitters.

## 14.7 Optical Flow Provider

Purpose:

1. Estimate motion between frames.
2. Generate motion vector fields.
3. Drive flow smear and motion-aware effects.
4. Support datamosh preview.

Outputs:

1. Optical flow pass.
2. Motion magnitude pass.
3. Motion direction pass.
4. Optional visualized vector field.

Use cases:

1. Motion melt.
2. Flow-driven pixel sorting.
3. Subject trail generation.
4. Background drag.
5. Datamosh preview.
6. Motion heatmap.

## 14.8 Marker Tracking Provider

Purpose:

1. Track physical surfaces using fiducial markers.
2. Attach render layers to artwork, posters, walls, screens, or installation surfaces.
3. Generate homography and plane tracking passes.

Outputs:

1. Marker detection pass.
2. Plane transform pass.
3. Corner coordinates.
4. Marker IDs.
5. Tracking confidence.

Use cases:

1. Surface-locked shader.
2. Artwork tracking.
3. Projection mapping prep.
4. Physical canvas augmentation.
5. Plane-stabilized render effects.

---

# 15. Key Internal Data Types

## 15.1 Project

```json
{
  "id": "project_001",
  "version": "0.2",
  "name": "Untitled Machine Vision Project",
  "assets": [],
  "visionPasses": [],
  "renderLayers": [],
  "timeline": {},
  "presets": [],
  "exports": [],
  "settings": {}
}
```

## 15.2 Asset

```json
{
  "id": "asset_001",
  "type": "video",
  "name": "source.mov",
  "width": 1920,
  "height": 1080,
  "fps": 29.97,
  "duration": 18.2,
  "frameCount": 546,
  "sourceUrl": "storage://asset_001/source.mov",
  "proxyUrl": "storage://asset_001/proxy.mp4",
  "createdAt": "2026-06-10T00:00:00Z"
}
```

## 15.3 Vision Pass

```json
{
  "id": "pass_001",
  "assetId": "asset_001",
  "type": "mask",
  "provider": "sam",
  "providerVersion": "provider-version",
  "status": "ready",
  "frameStart": 0,
  "frameEnd": 545,
  "dataUrl": "storage://passes/pass_001",
  "metadata": {}
}
```

Vision pass types:

1. mask
2. detection
3. tracking
4. face_landmarks
5. pose_landmarks
6. hand_landmarks
7. optical_flow
8. confidence
9. depth
10. marker_plane
11. metadata
12. edge_matte
13. motion
14. codec_error

## 15.4 Masklet

A masklet is a tracked mask object over time.

```json
{
  "id": "masklet_001",
  "passId": "pass_001",
  "label": "person",
  "prompt": "person",
  "frames": [
    {
      "frame": 0,
      "maskRef": "storage://masks/masklet_001/000000.rle",
      "bbox": [320, 120, 740, 980],
      "confidence": 0.94
    }
  ],
  "corrections": [
    {
      "frame": 120,
      "type": "positive_click",
      "x": 0.41,
      "y": 0.62
    }
  ]
}
```

## 15.5 Detection Pass

```json
{
  "id": "pass_detection_001",
  "type": "detection",
  "frames": [
    {
      "frame": 0,
      "detections": [
        {
          "id": "det_001",
          "label": "person",
          "bbox": [320, 120, 740, 980],
          "confidence": 0.91
        }
      ]
    }
  ]
}
```

## 15.6 Track Pass

```json
{
  "id": "pass_track_001",
  "type": "tracking",
  "tracks": [
    {
      "id": "track_001",
      "label": "person",
      "frames": [
        {
          "frame": 0,
          "bbox": [320, 120, 740, 980],
          "confidence": 0.91,
          "maskletId": "masklet_001"
        }
      ]
    }
  ]
}
```

## 15.7 Render Layer

```json
{
  "id": "layer_001",
  "type": "semantic_datamosh",
  "name": "Subject Mosh",
  "enabled": true,
  "order": 1,
  "sources": {
    "mask": "pass_001",
    "track": "pass_track_001",
    "motion": "pass_flow_001"
  },
  "params": {
    "strength": 0.72,
    "edgeLeak": 0.34,
    "temporalDecay": 24,
    "seed": 1234
  },
  "blend": {
    "mode": "normal",
    "opacity": 1.0
  }
}
```

## 15.8 Preset

```json
{
  "id": "preset_001",
  "name": "Subject Memory Collapse",
  "renderLayers": [],
  "requiredPassTypes": ["mask", "tracking", "optical_flow"],
  "params": {},
  "thumbnailUrl": "storage://presets/preset_001/thumb.jpg"
}
```

## 15.9 Export Job

```json
{
  "id": "export_001",
  "projectId": "project_001",
  "assetId": "asset_001",
  "type": "baked_video",
  "format": "mp4",
  "resolution": "source",
  "frameStart": 0,
  "frameEnd": 545,
  "status": "queued",
  "outputUrl": null
}
```

---

# 16. Render System

## 16.1 Render Layer Concept

Render layers transform source media and vision passes into visual output.

Render layers should be stackable, reorderable, toggleable, and keyframeable where feasible.

Each render layer has:

1. Type.
2. Name.
3. Enabled state.
4. Source pass routing.
5. Parameters.
6. Blend mode.
7. Opacity.
8. Seed.
9. Export inclusion settings.
10. Preview quality settings.

## 16.2 Required Render Layers for MVP

1. Semantic Datamosh.
2. Face Mesh Overlay.
3. Pose Overlay.
4. Hand Overlay.
5. Object Label Overlay.
6. Mask Edge Decay.
7. ASCII Shader.
8. Pixel Sort.
9. Flow Smear.
10. Metadata Typography.
11. Segmentation Matte View.
12. Confidence View.

## 16.3 Future Render Layers

1. Depth displacement.
2. Surface-locked shader.
3. Fiducial plane shader.
4. Contour map.
5. Thermal confidence map.
6. Object inheritance mosh.
7. Motion-vector typography.
8. Codec error visualization.
9. Multi-pass feedback.
10. Scanline reconstruction.
11. Low-bit palette remap.
12. Scene graph overlay.
13. Model disagreement view.
14. Landmark dropout renderer.
15. Prompt correction renderer.

---

# 17. Semantic Datamosh

## 17.1 Product Definition

Semantic Datamosh is a render layer that uses vision passes to control where and how datamosh artifacts appear.

The user should be able to apply compression-driven or compression-inspired corruption to specific subjects, objects, masks, edges, backgrounds, or tracked semantic concepts.

Examples:

1. Mosh only the person.
2. Mosh everything except the person.
3. Mosh only mask edges.
4. Mosh all faces.
5. Mosh all televisions.
6. Mosh the background while preserving the subject.
7. Make the subject drag the background.
8. Make one object inherit another object's motion.
9. Corrupt low-confidence mask regions.
10. Freeze the face while the body melts.

## 17.2 Two Engine Strategy

Machine Vision should include two datamosh engines.

### 17.2.1 Preview Mosh Engine

Runs in browser or lightweight server preview.

It simulates datamosh-like behavior using:

1. Frame feedback.
2. Optical flow.
3. Mask accumulation.
4. Frame delay.
5. Pixel displacement.
6. Temporal decay.
7. Shader feedback.
8. Motion smear.
9. Edge instability.
10. Mask erosion and dilation.

This engine prioritizes speed and interactivity.

### 17.2.2 Authentic Codec Mosh Engine

Runs server-side.

It produces more authentic compression artifacts using video encoding, frame dependencies, GOP manipulation, frame replacement, keyframe control, and FFmpeg/PyAV workflows.

This engine prioritizes visual authenticity and final quality.

## 17.3 Practical Semantic Mosh Strategy

A fully mask-aware codec bitstream editor is complex and fragile.

For MVP, use a compositing strategy:

```text
Clean source render
  +
Full-frame datamosh render
  +
Vision mask or edge matte
  =
Semantic datamosh composite
```

This allows real codec artifacts to be localized using masks.

## 17.4 Semantic Datamosh Modes

### Subject Mosh

Selected subject is corrupted.

Required passes:

1. Mask pass.
2. Optional track pass.
3. Optional motion pass.

Controls:

1. Strength.
2. Temporal decay.
3. Edge leak.
4. GOP length.
5. Keyframe interval.
6. Frame repeat.
7. Frame drop.
8. Mask feather.
9. Mask erosion.
10. Seed.

### Background Collapse

Subject is protected while background corrupts.

Required passes:

1. Mask pass.
2. Inverse mask.
3. Optional optical flow.

Controls:

1. Background strength.
2. Subject protection.
3. Edge contamination.
4. Decay.
5. Scene cut sensitivity.
6. Mask feather.

### Edge Rot

Only segmentation boundaries corrupt.

Required passes:

1. Mask pass.
2. Edge matte pass.
3. Confidence pass optional.

Controls:

1. Edge width.
2. Edge leak.
3. Confidence threshold.
4. Erosion.
5. Dilation.
6. Temporal jitter.
7. Decay.

### Object Inheritance

One tracked object inherits temporal corruption or motion from another tracked object.

Required passes:

1. Track pass.
2. Mask pass.
3. Motion pass optional.

Controls:

1. Source track.
2. Target track.
3. Transfer strength.
4. Lag.
5. Accumulation.
6. Blend mode.
7. Decay.

### Concept Mosh

Open-vocabulary prompt selects a concept and applies mosh to all matched objects.

Required passes:

1. Detection pass.
2. Segmentation pass.
3. Tracking pass.

Example prompts:

1. all faces
2. all televisions
3. all windows
4. all hands
5. all plants
6. all text
7. all people in the background

Controls:

1. Prompt.
2. Detection threshold.
3. Mask threshold.
4. Track persistence.
5. Mosh strength.
6. Edge leak.

## 17.5 Datamosh Controls

Core controls:

1. Mosh Strength.
2. Keyframe Distance.
3. Delta Persistence.
4. Frame Repeat.
5. Frame Drop.
6. Scene Cut Ignore.
7. Motion Inheritance.
8. Temporal Decay.
9. Edge Leak.
10. Mask Feather.
11. Mask Erode.
12. Mask Dilate.
13. Background Contamination.
14. Subject Protection.
15. Seed.
16. Preview Quality.
17. Final Quality.

Advanced controls:

1. GOP Length.
2. B-frame Strategy.
3. I-frame Suppression.
4. P-frame Duplication.
5. Codec Profile.
6. Bitrate.
7. Chroma Handling.
8. Color Space Handling.
9. Motion Vector Bias.
10. Frame Interleave.

---

# 18. Effects Specification

## 18.1 Face Mesh Overlay

Purpose:

Render face topology as visible machine perception.

Required passes:

1. Face landmark pass.
2. Optional confidence pass.

Render styles:

1. Wireframe.
2. Point cloud.
3. Triangulated fill.
4. Landmark indices.
5. Contour lines.
6. Depth tint.
7. Mesh trails.
8. Mesh dropout.
9. Face-locked typography.

Controls:

1. Line width.
2. Point size.
3. Mesh opacity.
4. Fill opacity.
5. Topology density.
6. Smoothing.
7. Jitter.
8. Trail length.
9. Depth exaggeration.
10. Landmark dropout.
11. Confidence threshold.
12. Blend mode.

## 18.2 Pose Overlay

Purpose:

Render body skeleton, motion, and joint metadata.

Required passes:

1. Pose landmark pass.
2. Optional motion pass.

Render styles:

1. Skeleton.
2. Joint points.
3. Limb vectors.
4. Bone labels.
5. Velocity trails.
6. Pose confidence flicker.
7. Body bounding field.
8. Motion heatmap.

Controls:

1. Joint size.
2. Bone width.
3. Trail length.
4. Velocity sensitivity.
5. Label density.
6. Confidence threshold.
7. Smoothing.
8. Dropout amount.
9. Blend mode.
10. Opacity.

## 18.3 Hand Overlay

Purpose:

Render hands as expressive tracking structures.

Required passes:

1. Hand landmark pass.

Render styles:

1. Hand skeleton.
2. Fingertip trails.
3. Palm plane.
4. Joint IDs.
5. Pinch marker.
6. Fingertip emitters.
7. Gesture flashes.

Controls:

1. Line width.
2. Point size.
3. Trail length.
4. Finger isolation.
5. Gesture sensitivity.
6. Label density.
7. Jitter.
8. Opacity.

## 18.4 Object Label Overlay

Purpose:

Render detections as machine-readable metadata.

Required passes:

1. Detection pass.
2. Optional tracking pass.

Render styles:

1. Bounding boxes.
2. Corner brackets.
3. Class labels.
4. Track IDs.
5. Confidence bars.
6. Velocity vectors.
7. Detection history trails.
8. Frame number tags.

Controls:

1. Box style.
2. Label density.
3. Confidence threshold.
4. Track persistence.
5. Trail length.
6. Font size.
7. Metadata fields.
8. Opacity.
9. Blend mode.

## 18.5 ASCII Shader

Purpose:

Convert source media or selected regions into glyph-based rendering.

Required passes:

1. Source media.
2. Optional mask pass.
3. Optional detection pass.
4. Optional confidence pass.
5. Optional motion pass.

Modes:

1. Luma ASCII.
2. Mask-only ASCII.
3. Background ASCII.
4. Object-label ASCII.
5. Confidence ASCII.
6. Motion ASCII.
7. Segmentation ASCII.

Controls:

1. Glyph set.
2. Font.
3. Cell size.
4. Density.
5. Contrast.
6. Mask source.
7. Color source.
8. Glyph source.
9. Flicker.
10. Scanline spacing.
11. Threshold.
12. Temporal stability.

## 18.6 Pixel Sort

Purpose:

Sort pixels according to image data and vision passes.

Required passes:

1. Source media.
2. Optional mask pass.
3. Optional optical flow pass.
4. Optional confidence pass.

Modes:

1. Horizontal sort.
2. Vertical sort.
3. Radial sort.
4. Flow-directed sort.
5. Mask-edge sort.
6. Skeleton-directed sort.
7. Object-region sort.
8. Hair or subject-region sort.

Controls:

1. Sort key: luma, hue, saturation, red, green, blue, alpha, confidence.
2. Sort direction.
3. Threshold min.
4. Threshold max.
5. Segment length.
6. Mask source.
7. Edge width.
8. Flow-follow amount.
9. Seed.
10. Temporal lock.
11. Blend mode.
12. Opacity.

## 18.7 Flow Smear

Purpose:

Use motion to smear, drag, and echo pixels.

Required passes:

1. Optical flow pass.
2. Optional mask pass.

Modes:

1. Subject smear.
2. Background drag.
3. Motion echo.
4. Vector field render.
5. Flow particles.
6. Motion heatmap.
7. Temporal contour.

Controls:

1. Flow strength.
2. Decay.
3. Mask source.
4. Direction bias.
5. Freeze threshold.
6. Particle density.
7. Trail length.
8. Motion threshold.
9. Blend mode.
10. Opacity.

## 18.8 Mask Edge Decay

Purpose:

Turn segmentation boundaries and uncertainty into visual material.

Required passes:

1. Mask pass.
2. Optional confidence pass.

Modes:

1. Edge halo.
2. Edge rot.
3. Erosion flicker.
4. Dilation pulse.
5. Confidence holes.
6. Boundary jitter.
7. Alpha decay.

Controls:

1. Edge width.
2. Erosion.
3. Dilation.
4. Feather.
5. Jitter.
6. Confidence threshold.
7. Hole persistence.
8. Temporal decay.
9. Color source.
10. Blend mode.

## 18.9 Metadata Typography

Purpose:

Render machine metadata as minimal typography.

Required passes:

1. Detection pass.
2. Tracking pass.
3. Landmark pass.
4. Mask pass.
5. Project metadata.

Metadata fields:

1. Frame number.
2. Track ID.
3. Class label.
4. Confidence.
5. Prompt text.
6. Model provider.
7. Pass name.
8. Landmark count.
9. Motion magnitude.
10. Mask area.
11. Correction count.

Controls:

1. Font size.
2. Label density.
3. Field selection.
4. Anchor point.
5. Offset.
6. Opacity.
7. Jitter.
8. Fade by confidence.
9. Blend mode.

---

# 19. User Workflows

## 19.1 Upload and Generate Subject Mosh

1. User uploads video.
2. System creates proxy.
3. User types prompt: person.
4. Detection/segmentation provider generates person mask.
5. Tracker propagates mask through video.
6. User applies Subject Mosh.
7. User adjusts edge leak, strength, temporal decay, and seed.
8. User previews low-resolution result.
9. User renders final server-side result.
10. User exports baked MP4 and person mask pass.

## 19.2 Open Vocabulary Semantic Effect

1. User uploads video.
2. User types prompt: all televisions.
3. Detection provider finds televisions.
4. Segmentation provider creates masks.
5. Tracking provider assigns track IDs.
6. User applies Concept Mosh.
7. User exports baked video, masks, and metadata JSON.

## 19.3 Face Mesh Artwork Treatment

1. User uploads portrait or video.
2. Face landmark provider generates face mesh.
3. User adds Face Mesh Overlay.
4. User selects wireframe and landmark labels.
5. User adds Mask Edge Decay around face.
6. User exports transparent overlay and baked result.

## 19.4 Pose-Driven Motion Smear

1. User uploads dance video.
2. Pose provider generates skeleton.
3. Optical flow provider generates motion pass.
4. User adds Pose Overlay.
5. User adds Flow Smear driven by joint velocity.
6. User applies pixel sort along limbs.
7. User exports baked video and overlay pass.

## 19.5 Segmentation ASCII

1. User uploads image.
2. User segments subject.
3. User applies ASCII Shader to background only.
4. User keeps subject as original image.
5. User adds object labels.
6. User exports final PNG and mask pass.

## 19.6 Physical Artwork Marker Workflow

1. User records physical artwork with fiducial markers.
2. Marker provider detects tracked plane.
3. User attaches surface shader to plane.
4. User adds mesh or typography layer locked to artwork.
5. User exports baked video.

---

# 20. Information Architecture

Primary app sections:

1. Home.
2. Project Workspace.
3. Media Library.
4. Vision Passes.
5. Render Layers.
6. Timeline.
7. Preview.
8. Export.
9. Presets.
10. Jobs.

## 20.1 Workspace Layout

Recommended layout:

```text
Left Panel
├── Media
├── Vision Passes
├── Render Layers
└── Presets

Center
├── Preview Canvas
├── Before / After Toggle
├── Zoom / Pan
└── Playback Controls

Right Panel
├── Selected Layer Controls
├── Source Pass Routing
├── Parameters
├── Blend Settings
└── Export Inclusion

Bottom
├── Timeline
├── Keyframes
├── Job Status
└── Render Queue
```

## 20.2 Vision Pass Panel

Each pass should show:

1. Pass name.
2. Type.
3. Provider.
4. Status.
5. Prompt.
6. Frame range.
7. Confidence summary.
8. Thumbnail preview.
9. Visibility toggle.
10. Delete button.
11. Re-run button.
12. Export button.

## 20.3 Render Layer Panel

Each render layer should show:

1. Layer name.
2. Layer type.
3. Enabled toggle.
4. Pass sources.
5. Opacity.
6. Blend mode.
7. Preview status.
8. Export inclusion.
9. Duplicate.
10. Delete.

---

# 21. UI Requirements

## 21.1 Upload

The upload UI must support:

1. Drag and drop image.
2. Drag and drop video.
3. File picker.
4. Upload progress.
5. Error state.
6. Proxy generation state.
7. Media metadata display.

Supported MVP inputs:

1. PNG.
2. JPEG.
3. WebP.
4. MP4.
5. MOV.
6. WebM where feasible.

## 21.2 Prompting

Prompt UI must support:

1. Text prompt.
2. Click prompt.
3. Box prompt.
4. Optional negative click.
5. Prompt history.
6. Provider selection.
7. Threshold controls.
8. Generate pass button.

Prompt examples should be visible:

1. person.
2. hands.
3. face.
4. red jacket.
5. all windows.
6. all televisions.
7. background.
8. subject.
9. text.
10. guitar.

## 21.3 Mask Correction

MVP correction tools:

1. Positive click.
2. Negative click.
3. Box refinement.
4. Frame-specific correction.
5. Re-propagate from correction frame.
6. Undo correction.
7. View correction markers.

Future correction tools:

1. Brush add.
2. Brush subtract.
3. Track split.
4. Track merge.
5. Object identity correction.

## 21.4 Preview

Preview must support:

1. Play.
2. Pause.
3. Scrub.
4. Frame step.
5. Zoom.
6. Pan.
7. Fit to view.
8. Before and after.
9. Show original.
10. Show selected pass.
11. Show final composite.
12. Preview quality selection.

Preview quality options:

1. Draft.
2. Medium.
3. High.
4. Final render only.

## 21.5 Layer Controls

Every effect layer should expose:

1. Enabled.
2. Name.
3. Source pass routing.
4. Opacity.
5. Blend mode.
6. Parameters.
7. Seed.
8. Keyframe controls where supported.
9. Export inclusion.
10. Reset to default.

## 21.6 Export UI

Export types:

1. Baked video.
2. Baked image.
3. Transparent overlay.
4. Mask pass.
5. Edge matte pass.
6. Datamosh pass.
7. Clean pass.
8. Metadata JSON.
9. Project JSON.
10. Preset JSON.

Export settings:

1. Format.
2. Resolution.
3. Frame range.
4. FPS.
5. Quality.
6. Include alpha where supported.
7. Include metadata.
8. Include project file.
9. Render engine: preview or final.
10. Destination.

---

# 22. Backend Architecture

## 22.1 Recommended Stack

Frontend:

1. Vite.
2. React.
3. TypeScript.
4. Zustand or Jotai.
5. Three.js.
6. WebGL2.
7. WebGPU later.
8. Web Workers.
9. OffscreenCanvas where useful.
10. WebCodecs where useful.

Backend:

1. FastAPI.
2. Python.
3. PostgreSQL.
4. Redis.
5. Object storage using S3-compatible storage.
6. Celery, RQ, or equivalent job queue.
7. Dockerized workers.
8. GPU worker pool.
9. FFmpeg.
10. PyAV.
11. OpenCV.
12. Supervision.
13. PyTorch model providers.

Infrastructure:

1. API service.
2. Worker service.
3. GPU worker service.
4. Redis.
5. PostgreSQL.
6. Object storage.
7. Optional local development MinIO.
8. Job status WebSocket or polling.
9. Signed upload URLs.
10. Signed download URLs.

## 22.2 Services

```text
apps/web
  Browser UI and preview renderer

apps/api
  Project API, asset API, job API, auth, storage coordination

workers/vision
  Detection, segmentation, tracking, landmarks, motion analysis

workers/render
  Shader baking, datamosh, pass compositing, final export

workers/video
  Proxy generation, transcode, frame extraction, encode

storage
  Source media, proxies, passes, renders, metadata
```

## 22.3 Job Types

Required job types:

1. asset.ingest
2. asset.proxy
3. vision.detect
4. vision.segment
5. vision.track
6. vision.landmarks
7. vision.optical_flow
8. render.preview
9. render.final
10. render.datamosh
11. export.baked_video
12. export.image
13. export.pass
14. export.metadata

## 22.4 Job Lifecycle

```text
created
  ↓
queued
  ↓
running
  ↓
postprocessing
  ↓
ready
```

Failure states:

```text
failed
cancelled
expired
```

Job object:

```json
{
  "id": "job_001",
  "type": "vision.segment",
  "status": "running",
  "progress": 0.42,
  "projectId": "project_001",
  "assetId": "asset_001",
  "params": {},
  "result": null,
  "error": null,
  "createdAt": "2026-06-10T00:00:00Z",
  "updatedAt": "2026-06-10T00:01:00Z"
}
```

---

# 23. API Requirements

## 23.1 Projects

Create project:

```text
POST /projects
```

Get project:

```text
GET /projects/{projectId}
```

Update project:

```text
PATCH /projects/{projectId}
```

Delete project:

```text
DELETE /projects/{projectId}
```

## 23.2 Assets

Create upload:

```text
POST /assets/upload-url
```

Complete upload:

```text
POST /assets/{assetId}/complete
```

Get asset:

```text
GET /assets/{assetId}
```

List project assets:

```text
GET /projects/{projectId}/assets
```

Delete asset:

```text
DELETE /assets/{assetId}
```

## 23.3 Vision Passes

Create detection pass:

```text
POST /vision/detect
```

Create segmentation pass:

```text
POST /vision/segment
```

Create tracking pass:

```text
POST /vision/track
```

Create landmark pass:

```text
POST /vision/landmarks
```

Create optical flow pass:

```text
POST /vision/optical-flow
```

Get pass:

```text
GET /vision/passes/{passId}
```

List project passes:

```text
GET /projects/{projectId}/vision-passes
```

Delete pass:

```text
DELETE /vision/passes/{passId}
```

## 23.4 Render Layers

Create render layer:

```text
POST /projects/{projectId}/render-layers
```

Update render layer:

```text
PATCH /render-layers/{layerId}
```

Delete render layer:

```text
DELETE /render-layers/{layerId}
```

Preview render:

```text
POST /render/preview
```

Final render:

```text
POST /render/final
```

## 23.5 Exports

Create export:

```text
POST /exports
```

Get export:

```text
GET /exports/{exportId}
```

List exports:

```text
GET /projects/{projectId}/exports
```

Download export:

```text
GET /exports/{exportId}/download-url
```

## 23.6 Jobs

Get job:

```text
GET /jobs/{jobId}
```

Cancel job:

```text
POST /jobs/{jobId}/cancel
```

List project jobs:

```text
GET /projects/{projectId}/jobs
```

---

# 24. Storage Requirements

## 24.1 Storage Buckets

Recommended buckets or prefixes:

```text
sources/
proxies/
frames/
vision-passes/
masks/
tracks/
renders/
exports/
thumbnails/
project-json/
presets/
logs/
```

## 24.2 File Retention

MVP retention policy:

1. Source uploads persist until user deletes project.
2. Proxies persist with project.
3. Vision passes persist with project.
4. Preview renders may be garbage-collected.
5. Final exports persist until user deletes them.
6. Failed temporary files are deleted automatically.
7. Deleted projects trigger async cleanup.

## 24.3 Cache Strategy

Cache:

1. Extracted frames.
2. Proxies.
3. Model outputs.
4. Masklets.
5. Optical flow passes.
6. Intermediate datamosh renders.
7. Thumbnails.
8. Preview renders.

Cache keys should include:

1. Asset ID.
2. Frame range.
3. Provider name.
4. Provider version.
5. Prompt.
6. Parameters.
7. Seed.
8. Resolution.
9. Model settings.

---

# 25. Frontend Architecture

## 25.1 App State

State domains:

1. Project state.
2. Asset state.
3. Timeline state.
4. Vision pass state.
5. Render layer state.
6. Preview state.
7. Job state.
8. Export state.
9. UI state.
10. Preset state.

## 25.2 Preview Renderer

The browser preview renderer should support:

1. Source image/video drawing.
2. Render layer stack.
3. Vision pass visualization.
4. Mask compositing.
5. Shader previews.
6. Mesh overlays.
7. ASCII rendering.
8. Pixel sorting preview.
9. Flow smear preview.
10. Datamosh simulation preview.

## 25.3 Worker Usage

Use Web Workers for:

1. Image decoding where possible.
2. Lightweight frame processing.
3. Preview shader preparation.
4. Pixel sorting preview.
5. ASCII rendering preparation.
6. Job polling.
7. Large JSON parsing.
8. Mask decoding.

## 25.4 Timeline

MVP timeline features:

1. Scrub.
2. Play/pause.
3. Frame step.
4. Current time display.
5. Frame number display.
6. Layer visibility.
7. Frame range selection.
8. Basic keyframes for selected parameters.

Future timeline features:

1. Multiple clips.
2. Audio waveform.
3. Nested timelines.
4. Advanced keyframe curves.
5. Clip trimming.
6. Multi-track editing.

---

# 26. Export Requirements

## 26.1 MVP Export Formats

Images:

1. PNG.
2. JPEG.
3. WebP.

Video:

1. MP4.
2. WebM where feasible.
3. MOV where server support is available.

Passes:

1. PNG sequence.
2. JSON metadata.
3. Project JSON.
4. Preset JSON.

## 26.2 Pro Export Formats

Future:

1. ProRes 4444 MOV.
2. ProRes 422 HQ.
3. DNxHR.
4. EXR sequence.
5. TIFF sequence.
6. 16-bit PNG.
7. Alpha video.
8. Separate clean pass.
9. Separate datamosh pass.
10. Separate edge matte.
11. Separate object matte.

## 26.3 Export Bundles

Users should be able to export a bundle:

```text
MachineVision_Export/
├── baked.mp4
├── clean.mp4
├── datamosh_pass.mp4
├── overlay_alpha.mov
├── masks/
│   ├── person_000000.png
│   └── person_000001.png
├── edge_mattes/
│   ├── edge_000000.png
│   └── edge_000001.png
├── metadata/
│   ├── tracks.json
│   ├── detections.json
│   └── project.machinevision.json
└── preset.machinevision-preset.json
```

---

# 27. Preset System

## 27.1 Preset Types

Preset categories:

1. Datamosh.
2. Mesh.
3. Object labels.
4. ASCII.
5. Pixel sort.
6. Flow smear.
7. Mask edge.
8. Composite.
9. Full look.

## 27.2 Preset Requirements

Presets must save:

1. Render layer stack.
2. Layer parameters.
3. Required pass types.
4. Default pass routing.
5. Blend modes.
6. Seeds.
7. Keyframe defaults.
8. Preview thumbnail.
9. Description.
10. Version.

Presets must not require a specific asset.

## 27.3 Starter Presets

Initial starter presets:

1. Subject Memory Collapse.
2. Background Collapse.
3. Edge Rot.
4. Face Topology Clean.
5. Landmark Dropout.
6. Object Surveillance Sparse.
7. Confidence Ghost.
8. Mask ASCII Field.
9. Flow Drag.
10. Semantic Pixel Sort.
11. Hands Emit.
12. Pose Velocity Trails.

---

# 28. MVP Scope

## 28.1 MVP Vision Passes

Required:

1. Upload media.
2. Proxy generation.
3. SAM-style segmentation provider.
4. Open-vocabulary detection provider.
5. Supervision adapter.
6. Mask pass.
7. Detection pass.
8. Tracking pass basic.
9. Face landmark pass.
10. Pose landmark pass.
11. Hand landmark pass.
12. Optical flow pass basic.

## 28.2 MVP Render Layers

Required:

1. Semantic Datamosh.
2. Mask Edge Decay.
3. Face Mesh Overlay.
4. Pose Overlay.
5. Hand Overlay.
6. Object Label Overlay.
7. ASCII Shader.
8. Pixel Sort.
9. Flow Smear.
10. Metadata Typography.

## 28.3 MVP Export

Required:

1. Baked image.
2. Baked video.
3. Mask PNG sequence.
4. Transparent overlay where feasible.
5. Datamosh pass.
6. Metadata JSON.
7. Project JSON.
8. Preset JSON.

## 28.4 MVP UI

Required:

1. Project creation.
2. Media upload.
3. Vision pass generation.
4. Prompt interface.
5. Preview canvas.
6. Layer stack.
7. Effect controls.
8. Basic timeline.
9. Job status.
10. Export panel.

## 28.5 MVP Backend

Required:

1. FastAPI app.
2. PostgreSQL.
3. Redis.
4. Object storage.
5. Job queue.
6. Vision worker.
7. Render worker.
8. FFmpeg/PyAV pipeline.
9. Supervision adapter.
10. Model provider abstraction.

---

# 29. Future Roadmap

## 29.1 Phase 1: Web MVP

Focus:

1. Upload image/video.
2. Generate vision passes.
3. Use segmentation, detection, face, pose, hands, and basic flow.
4. Render mesh, labels, ASCII, pixel sort, mask edge, and datamosh preview.
5. Export baked result and basic passes.

## 29.2 Phase 2: Semantic Datamosh Alpha

Focus:

1. Server-side authentic datamosh.
2. Subject mosh.
3. Background collapse.
4. Edge rot.
5. Concept mosh.
6. Mask-composited datamosh pass.
7. Final render jobs.

## 29.3 Phase 3: Pro Render and Presets

Focus:

1. Longer videos.
2. Render queue.
3. Preset saving.
4. Project saving.
5. Batch exports.
6. Higher-quality formats.
7. Metadata exports.
8. Better mask correction.

## 29.4 Phase 4: Advanced Vision Graph

Focus:

1. Additional model providers.
2. Depth pass.
3. Scene understanding pass.
4. Marker tracking.
5. Better multi-object tracking.
6. Better optical flow.
7. Model disagreement effects.
8. Promptable region workflows.

## 29.5 Phase 5: Host Integrations

Deferred:

1. After Effects extension.
2. Premiere workflow.
3. Resolve workflow.
4. TouchDesigner bridge.
5. Blender bridge.
6. Native plugin experiments.
7. Local daemon.
8. Pro desktop companion.

---

# 30. Blockers and Risks

## 30.1 SAM and Model Licensing

Risk:

Model licenses may affect commercial use, distribution, or cloud hosting.

Mitigation:

1. Keep model providers modular.
2. Avoid hard dependency on one provider.
3. Review licenses before public launch.
4. Document provider-specific usage restrictions.
5. Allow users to configure provider choices where appropriate.

## 30.2 GPU Cost

Risk:

Video segmentation, tracking, optical flow, and datamosh rendering can be expensive.

Mitigation:

1. Use proxies.
2. Limit MVP duration.
3. Use job queues.
4. Cache model outputs.
5. Offer draft and final modes.
6. Add user quotas.
7. Use lower-resolution preview passes.
8. Charge for high-resolution final renders.

## 30.3 Long Video Reliability

Risk:

Long video jobs can fail due to memory, timeout, storage, or queue issues.

Mitigation:

1. Chunk videos by frame range.
2. Store intermediate outputs.
3. Resume failed jobs.
4. Use durable queues.
5. Validate codecs at ingest.
6. Provide clear progress feedback.

## 30.4 Datamosh Authenticity

Risk:

Browser simulation may look fake. True datamosh can be unpredictable and codec-dependent.

Mitigation:

1. Separate preview simulation from final codec mosh.
2. Use server FFmpeg/PyAV for final output.
3. Provide deterministic seeds where possible.
4. Expose controls carefully.
5. Save intermediate datamosh pass.
6. Let users export clean and mosh passes separately.

## 30.5 Mask Quality

Risk:

Masks may fail on occlusion, motion blur, low contrast, or complex scenes.

Mitigation:

1. Add correction tools.
2. Store confidence.
3. Make uncertainty visible.
4. Allow prompt refinement.
5. Allow frame-specific corrections.
6. Provide edge-matte controls.
7. Use model fallback providers.

## 30.6 Browser Performance

Risk:

Shader previews, video decoding, and large masks can strain browsers.

Mitigation:

1. Use proxy previews.
2. Use Web Workers.
3. Use WebGL2 first.
4. Add WebGPU later.
5. Use draft preview mode.
6. Avoid full-resolution preview by default.
7. Decode masks efficiently.

## 30.7 Aesthetic Genericness

Risk:

The tool could become another generic glitch preset product.

Mitigation:

1. Base effects on real vision passes.
2. Use restrained defaults.
3. Avoid fake UI artifacts.
4. Make model uncertainty visible.
5. Provide effect routing to masks, tracks, and motion.
6. Curate presets heavily.
7. Keep the original artwork legible by default.

## 30.8 Data Privacy

Risk:

Users may upload unreleased or sensitive creative work.

Mitigation:

1. Explicit upload consent.
2. Clear deletion controls.
3. Private projects by default.
4. Encrypted storage where feasible.
5. No training on user uploads by default.
6. Retention policy visible to users.
7. Future local-worker option.

## 30.9 Provider Instability

Risk:

Model APIs, weights, dependencies, and performance may change.

Mitigation:

1. Provider abstraction.
2. Versioned model configs.
3. Store provider version in pass metadata.
4. Use normalized pass schemas.
5. Avoid provider-specific render logic.
6. Allow fallback providers.

---

# 31. Privacy and Security Requirements

## 31.1 User Data

User uploads must be treated as private by default.

Requirements:

1. Private projects by default.
2. Signed upload URLs.
3. Signed download URLs.
4. Access control on all assets.
5. Project-level ownership.
6. Delete project function.
7. Delete asset function.
8. Delete export function.
9. No public sharing without explicit user action.

## 31.2 Processing Disclosure

The product should clearly disclose:

1. Uploaded media may be processed by GPU workers.
2. Cloud processing is required for some features.
3. Some models may run server-side.
4. Final renders may take time depending on media length.
5. User media is not used for training by default.

## 31.3 Data Retention

The product should expose retention settings:

1. Keep project files.
2. Delete source after export.
3. Delete intermediate files.
4. Delete all project data.
5. Auto-delete old previews.

## 31.4 Security Basics

Requirements:

1. Validate uploaded files.
2. Scan or reject suspicious files where possible.
3. Limit file size by plan.
4. Limit duration by plan.
5. Rate-limit API endpoints.
6. Restrict signed URL lifetime.
7. Store secrets outside code.
8. Log job failures without exposing private media.
9. Sanitize metadata.
10. Use isolated worker environments.

---

# 32. Performance Requirements

## 32.1 MVP Limits

Initial limits:

1. Image max resolution: configurable.
2. Video max duration: 30 to 60 seconds for early beta.
3. Video max resolution: 1080p for early beta.
4. Preview resolution: proxy by default.
5. Final render: source resolution where feasible.
6. Concurrent jobs per user: limited.
7. File size: limited by plan.

## 32.2 Preview Performance

Target:

1. Image preview should feel immediate after analysis completes.
2. Video preview should scrub reasonably at proxy resolution.
3. Layer control changes should update without full server render where possible.
4. Heavy changes should trigger preview render jobs.
5. Final quality render should be asynchronous.

## 32.3 Job Performance

The system should provide:

1. Progress percentage.
2. Current job stage.
3. Estimated frame count completed.
4. Cancel button.
5. Retry on failure.
6. Clear error messages.

---

# 33. Quality Requirements

## 33.1 Visual Quality

The tool should support:

1. High-quality final render.
2. Clean alpha where possible.
3. Frame-accurate pass alignment.
4. Deterministic seeds.
5. Minimal compression surprises unless desired.
6. Accurate mask timing.
7. Stable track identity where possible.

## 33.2 UX Quality

The product should:

1. Explain what each pass does.
2. Make pass routing understandable.
3. Avoid overwhelming first-time users.
4. Offer strong presets.
5. Keep advanced controls accessible but not mandatory.
6. Provide meaningful loading states.
7. Allow undo for key actions.
8. Avoid destructive edits.

## 33.3 Engineering Quality

The codebase should:

1. Use TypeScript on frontend.
2. Use typed backend schemas.
3. Version pass schemas.
4. Version project files.
5. Version presets.
6. Keep providers isolated.
7. Keep render layers isolated.
8. Include tests for pass normalization.
9. Include tests for export manifests.
10. Include job retry logic.

---

# 34. Acceptance Criteria

## 34.1 Upload

Acceptance:

1. User can upload an image.
2. User can upload a video.
3. System extracts metadata.
4. System generates thumbnail.
5. System generates proxy for video.
6. Failed upload gives clear error.

## 34.2 Vision Pass Generation

Acceptance:

1. User can generate a segmentation mask from prompt.
2. User can generate detection boxes from prompt.
3. User can generate face landmarks.
4. User can generate pose landmarks.
5. User can generate hand landmarks.
6. User can generate optical flow for a video range.
7. Each pass appears in Vision Pass panel.
8. Each pass has preview visibility.
9. Each pass can be deleted.

## 34.3 Render Layers

Acceptance:

1. User can add render layer.
2. User can route a pass into render layer.
3. User can adjust layer controls.
4. Preview updates.
5. User can reorder layers.
6. User can disable layers.
7. User can duplicate layers.
8. User can delete layers.

## 34.4 Semantic Datamosh

Acceptance:

1. User can select a mask source.
2. User can apply Subject Mosh.
3. User can apply Background Collapse.
4. User can adjust strength.
5. User can adjust edge leak.
6. User can adjust temporal decay.
7. User can render preview.
8. User can export final baked video.
9. User can export datamosh pass separately.

## 34.5 Export

Acceptance:

1. User can export baked PNG for image.
2. User can export baked MP4 for video.
3. User can export mask sequence.
4. User can export metadata JSON.
5. User can export project JSON.
6. Export job status is visible.
7. User can download completed export.

## 34.6 Presets

Acceptance:

1. User can save current layer stack as preset.
2. User can apply preset to another project.
3. Missing required pass types are shown.
4. Preset stores seed and parameters.
5. Preset can be renamed and deleted.

---

# 35. Development Milestones

## 35.1 Milestone 1: Repo and Project Shell

Deliverables:

1. Frontend app shell.
2. Backend API shell.
3. Database schema.
4. Object storage integration.
5. Upload flow.
6. Project CRUD.
7. Basic workspace UI.

## 35.2 Milestone 2: Media Pipeline

Deliverables:

1. Image upload.
2. Video upload.
3. Metadata extraction.
4. Proxy generation.
5. Thumbnail generation.
6. Preview player.
7. Frame range handling.

## 35.3 Milestone 3: Vision Pass Foundation

Deliverables:

1. Vision pass schema.
2. Provider abstraction.
3. Supervision adapter.
4. Detection provider integration.
5. Segmentation provider integration.
6. Basic tracking.
7. Pass preview UI.

## 35.4 Milestone 4: Render Layer Stack

Deliverables:

1. Layer stack UI.
2. Pass routing UI.
3. Effect parameter controls.
4. Browser preview renderer.
5. ASCII shader.
6. Pixel sort.
7. Object labels.
8. Face mesh overlay.
9. Pose and hand overlay.

## 35.5 Milestone 5: Semantic Datamosh

Deliverables:

1. Preview mosh engine.
2. Server datamosh engine.
3. Subject Mosh.
4. Background Collapse.
5. Edge Rot.
6. Datamosh pass export.
7. Baked export.

## 35.6 Milestone 6: Export and Presets

Deliverables:

1. Export panel.
2. Baked image export.
3. Baked video export.
4. Mask pass export.
5. Metadata export.
6. Project JSON export.
7. Preset save and load.

## 35.7 Milestone 7: Beta Hardening

Deliverables:

1. Job retries.
2. Better errors.
3. Quotas.
4. Cleanup jobs.
5. User auth if needed.
6. Privacy controls.
7. Visual preset curation.
8. Performance optimization.
9. QA on common media types.

---

# 36. Suggested Repository Structure

```text
machine-vision/
├── README.md
├── PRD.md
├── docs/
│   ├── architecture.md
│   ├── visual-language.md
│   ├── vision-graph.md
│   ├── render-layers.md
│   ├── datamosh.md
│   ├── export-system.md
│   ├── security-privacy.md
│   └── roadmap.md
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── media/
│   │   │   │   ├── vision-passes/
│   │   │   │   ├── render-layers/
│   │   │   │   ├── timeline/
│   │   │   │   ├── preview/
│   │   │   │   ├── export/
│   │   │   │   └── presets/
│   │   │   ├── render/
│   │   │   ├── shaders/
│   │   │   ├── workers/
│   │   │   ├── state/
│   │   │   ├── api/
│   │   │   └── types/
│   │   └── package.json
│   │
│   └── api/
│       ├── app/
│       │   ├── main.py
│       │   ├── api/
│       │   ├── core/
│       │   ├── db/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── storage/
│       │   ├── jobs/
│       │   ├── vision/
│       │   │   ├── providers/
│       │   │   ├── adapters/
│       │   │   ├── schemas/
│       │   │   └── graph/
│       │   ├── render/
│       │   └── export/
│       └── pyproject.toml
│
├── workers/
│   ├── vision/
│   ├── render/
│   └── video/
│
├── packages/
│   ├── schemas/
│   └── presets/
│
├── infra/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── migrations/
│
└── prompts/
    ├── 00_master_prompt.md
    ├── 01_bootstrap_repo.md
    ├── 02_media_pipeline.md
    ├── 03_vision_graph.md
    ├── 04_supervision_adapter.md
    ├── 05_render_layers.md
    ├── 06_datamosh.md
    ├── 07_export_system.md
    └── 08_beta_hardening.md
```

---

# 37. Cursor Implementation Guidance

## 37.1 Build Order

Cursor should implement in this order:

1. Define shared schemas.
2. Build project and asset API.
3. Build upload flow.
4. Build media proxy generation.
5. Build frontend workspace.
6. Build Vision Pass schema and UI.
7. Build provider abstraction.
8. Build Supervision adapter.
9. Add first detection provider stub.
10. Add first segmentation provider stub.
11. Add render layer stack.
12. Add preview renderer.
13. Add ASCII and pixel sort.
14. Add mask edge layer.
15. Add datamosh preview.
16. Add server datamosh worker.
17. Add export pipeline.
18. Add presets.

## 37.2 Engineering Constraints

1. Do not hardcode SAM into render layers.
2. Do not hardcode any provider into the UI.
3. All model outputs must normalize to Vision Pass schemas.
4. All render layers must declare required pass types.
5. All jobs must be resumable or safely retryable.
6. All export outputs must include a manifest.
7. All generated passes must include provider version and parameters.
8. All random effects must support seed values.
9. Preview and final render may differ, but differences must be documented.
10. Avoid fake visual artifacts unless explicitly selected.

## 37.3 First Vertical Slice

The first complete vertical slice should be:

```text
Upload video
  ↓
Generate proxy
  ↓
Prompt "person"
  ↓
Generate mask pass
  ↓
Add Subject Mosh layer
  ↓
Preview result
  ↓
Render final
  ↓
Export baked MP4 and mask sequence
```

Second vertical slice:

```text
Upload video
  ↓
Prompt "all televisions"
  ↓
Generate detection pass
  ↓
Generate segmentation masks from detections
  ↓
Add Concept Mosh layer
  ↓
Export baked result and metadata JSON
```

Third vertical slice:

```text
Upload portrait video
  ↓
Generate face landmark pass
  ↓
Add Face Mesh Overlay
  ↓
Add Metadata Typography
  ↓
Export transparent overlay and baked video
```

---

# 38. Open Questions

1. Should users need accounts for MVP, or can early prototype be local/session-based?
2. Should cloud processing be mandatory for beta?
3. What maximum upload duration should beta allow?
4. Which model providers are available and legally acceptable for commercial use?
5. Should SAM 3 be primary, or should the provider abstraction make SAM 2.1 primary until SAM 3 licensing and deployment are settled?
6. Should Grounding DINO be included in MVP, or stubbed behind provider interface first?
7. Should Florence-style scene understanding be MVP or phase 2?
8. Should transparent video export be included in MVP, or should PNG sequence be the reliable first alpha format?
9. Should WebGPU be used early, or should WebGL2 ship first?
10. Should marker tracking ship in MVP or phase 2?
11. Should local processing be part of paid/pro plan later?
12. How opinionated should starter presets be?
13. Should generated correction marks be optionally visible in final renders?
14. Should model confidence be exposed to users as a first-class visual source?
15. Should every effect support keyframes in MVP, or only opacity and strength?

---

# 39. Final Product Definition

Machine Vision is a standalone hybrid creative web app that lets users upload image or video assets, generate reusable computer vision passes through a model-agnostic Vision Graph, and route those passes into expressive render layers.

The product combines:

1. Semantic segmentation.
2. Open-vocabulary detection.
3. Object tracking.
4. Face, pose, and hand landmarks.
5. Optical flow.
6. Marker and surface tracking.
7. Semantic datamosh.
8. Mesh rendering.
9. ASCII rendering.
10. Pixel sorting.
11. Mask edge decay.
12. Metadata typography.
13. Pass-based export.

The product's main creative promise is:

> Select what the machine sees, decide how that perception should affect the image, and export the result as artwork or reusable production passes.

Machine Vision should feel like a visual instrument for computational perception, not a preset glitch app.
