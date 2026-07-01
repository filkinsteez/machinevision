"""Starter presets (PRD §27.3 subset, curated for the implemented layer roster).

Layer `sources` values use pass-type placeholders ("$mask", "$optical_flow", ...);
the frontend resolves them to actual pass ids on apply.
"""
import json

from .db import Preset, SessionLocal, new_id

STARTERS = [
    {
        "name": "Subject Memory Collapse",
        "description": "The subject melts into accumulated motion while the scene stays clean.",
        "category": "datamosh",
        "requiredPassTypes": ["mask", "optical_flow"],
        "renderLayers": [
            {"type": "datamosh_preview", "name": "Subject Mosh",
             "sources": {"mask": "$mask", "flow": "$optical_flow"},
             "params": {"mode": "subject", "strength": 0.85, "decay": 0.96,
                        "blockSize": 12, "edgeLeak": 0.3, "seed": 1234},
             "blend": {"mode": "normal", "opacity": 1.0}},
            {"type": "metadata_typography", "name": "Frame Data",
             "sources": {"mask": "$mask"},
             "params": {"fields": ["frame", "pass", "confidence"], "anchor": "bottom-left",
                        "fontSize": 11},
             "blend": {"mode": "normal", "opacity": 0.9}},
        ],
    },
    {
        "name": "Background Collapse",
        "description": "Subject protected, world corrupting around it.",
        "category": "datamosh",
        "requiredPassTypes": ["mask", "optical_flow"],
        "renderLayers": [
            {"type": "datamosh_preview", "name": "Background Mosh",
             "sources": {"mask": "$mask", "flow": "$optical_flow"},
             "params": {"mode": "background", "strength": 0.9, "decay": 0.97,
                        "blockSize": 16, "edgeLeak": 0.15, "seed": 99},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Edge Rot",
        "description": "Only the segmentation boundary decays — uncertainty made visible.",
        "category": "mask_edge",
        "requiredPassTypes": ["mask"],
        "renderLayers": [
            {"type": "mask_edge_decay", "name": "Edge Rot",
             "sources": {"mask": "$mask"},
             "params": {"edgeWidth": 0.035, "jitter": 0.6, "mode": "rot",
                        "color": "#FF5A00", "seed": 7},
             "blend": {"mode": "normal", "opacity": 1.0}},
            {"type": "metadata_typography", "name": "Mask Data",
             "sources": {"mask": "$mask"},
             "params": {"fields": ["frame", "confidence", "area"], "anchor": "top-right",
                        "fontSize": 10},
             "blend": {"mode": "normal", "opacity": 0.8}},
        ],
    },
    {
        "name": "Face Topology Clean",
        "description": "Restrained wireframe over real face landmarks.",
        "category": "mesh",
        "requiredPassTypes": ["face_landmarks"],
        "renderLayers": [
            {"type": "landmark_overlay", "name": "Face Mesh",
             "sources": {"landmarks": "$face_landmarks"},
             "params": {"style": "wireframe", "lineWidth": 0.6, "pointSize": 0,
                        "color": "#EAEAEA", "dropout": 0.0},
             "blend": {"mode": "normal", "opacity": 0.85}},
        ],
    },
    {
        "name": "Landmark Dropout",
        "description": "Face mesh with seeded dropout — perception failing in real time.",
        "category": "mesh",
        "requiredPassTypes": ["face_landmarks"],
        "renderLayers": [
            {"type": "landmark_overlay", "name": "Dropout Mesh",
             "sources": {"landmarks": "$face_landmarks"},
             "params": {"style": "wireframe", "lineWidth": 0.6, "pointSize": 1.5,
                        "color": "#00C853", "dropout": 0.45, "seed": 42},
             "blend": {"mode": "normal", "opacity": 0.9}},
        ],
    },
    {
        "name": "Object Surveillance Sparse",
        "description": "Minimal detection annotation: corner brackets, IDs, confidence.",
        "category": "object_labels",
        "requiredPassTypes": ["detection"],
        "renderLayers": [
            {"type": "object_labels", "name": "Detections",
             "sources": {"detection": "$detection"},
             "params": {"boxStyle": "brackets", "showConfidence": True,
                        "showTrackId": True, "fontSize": 10, "color": "#FF5A00",
                        "threshold": 0.5},
             "blend": {"mode": "normal", "opacity": 1.0}},
            {"type": "metadata_typography", "name": "Frame Data",
             "sources": {"detection": "$detection"},
             "params": {"fields": ["frame", "pass", "count"], "anchor": "bottom-left",
                        "fontSize": 10},
             "blend": {"mode": "normal", "opacity": 0.8}},
        ],
    },
    {
        "name": "Mask ASCII Field",
        "description": "Background dissolves into glyphs; the subject stays photographic.",
        "category": "ascii",
        "requiredPassTypes": ["mask"],
        "renderLayers": [
            {"type": "ascii_shader", "name": "Background ASCII",
             "sources": {"mask": "$mask"},
             "params": {"region": "outside", "cellSize": 10, "colorMode": "mono",
                        "color": "#9BA0A3", "contrast": 1.2, "flicker": 0.05, "seed": 3},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Flow Drag",
        "description": "Motion drags the background; the subject holds still.",
        "category": "flow_smear",
        "requiredPassTypes": ["mask", "optical_flow"],
        "renderLayers": [
            {"type": "flow_smear", "name": "Background Drag",
             "sources": {"mask": "$mask", "flow": "$optical_flow"},
             "params": {"region": "outside", "strength": 3.0, "decay": 0.94},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Semantic Pixel Sort",
        "description": "Pixel sorting confined to the segmented subject.",
        "category": "pixel_sort",
        "requiredPassTypes": ["mask"],
        "renderLayers": [
            {"type": "pixel_sort", "name": "Subject Sort",
             "sources": {"mask": "$mask"},
             "params": {"direction": "vertical", "thresholdMin": 0.25,
                        "thresholdMax": 0.8, "region": "inside", "seed": 11},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Pose Velocity Trails",
        "description": "Skeleton with motion-trailing joints.",
        "category": "mesh",
        "requiredPassTypes": ["pose_landmarks"],
        "renderLayers": [
            {"type": "landmark_overlay", "name": "Pose Trails",
             "sources": {"landmarks": "$pose_landmarks"},
             "params": {"style": "skeleton", "lineWidth": 1.2, "pointSize": 3,
                        "color": "#2962FF", "trail": 12, "dropout": 0.0},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Depth Relief",
        "description": "Warp the image through the Sapiens depth field for a glassy, sculptural relief.",
        "category": "composite",
        "requiredPassTypes": ["depth"],
        "renderLayers": [
            {"type": "depth_displace", "name": "Depth Relief",
             "sources": {"field": "$depth"},
             "params": {"mode": "relief", "strength": 1.4},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Depth Fog",
        "description": "Atmospheric human-centric depth — near stays lit, far falls into dark.",
        "category": "composite",
        "requiredPassTypes": ["depth"],
        "renderLayers": [
            {"type": "sapiens_depth", "name": "Depth Fog",
             "sources": {"field": "$depth"},
             "params": {"mode": "fog", "color": "#2962FF"},
             "blend": {"mode": "normal", "opacity": 1.0}},
            {"type": "metadata_typography", "name": "Frame Data",
             "sources": {},
             "params": {"fields": ["frame"], "anchor": "bottom-left", "fontSize": 11},
             "blend": {"mode": "normal", "opacity": 0.8}},
        ],
    },
    {
        "name": "Surface Relief",
        "description": "Sapiens surface normals as sculptural relief lighting.",
        "category": "composite",
        "requiredPassTypes": ["normals"],
        "renderLayers": [
            {"type": "sapiens_normals", "name": "Relief",
             "sources": {"field": "$normals"},
             "params": {"mode": "relief"},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
    {
        "name": "Body Part Field",
        "description": "Colorized 28-class human parsing — hair, skin, and clothing as flat fields.",
        "category": "composite",
        "requiredPassTypes": ["body_parts"],
        "renderLayers": [
            {"type": "body_parts", "name": "Body Parts",
             "sources": {"field": "$body_parts"},
             "params": {"mode": "colorize", "partId": "3: Hair", "color": "#FF5A00",
                        "saturation": 0.7},
             "blend": {"mode": "normal", "opacity": 0.85}},
        ],
    },
    {
        "name": "Isolate Hair",
        "description": "Light up just the hair from Sapiens parsing.",
        "category": "composite",
        "requiredPassTypes": ["body_parts"],
        "renderLayers": [
            {"type": "body_parts", "name": "Hair",
             "sources": {"field": "$body_parts"},
             "params": {"mode": "isolate", "partId": "3: Hair", "color": "#00C853",
                        "saturation": 0.6},
             "blend": {"mode": "normal", "opacity": 1.0}},
        ],
    },
]


def seed_presets():
    with SessionLocal() as db:
        if db.query(Preset).filter(Preset.builtin == 1).count() >= len(STARTERS):
            return
        existing = {p.name for p in db.query(Preset).filter(Preset.builtin == 1)}
        for s in STARTERS:
            if s["name"] in existing:
                continue
            db.add(Preset(id=new_id("preset"), name=s["name"],
                          description=s["description"], category=s["category"],
                          required_pass_types=json.dumps(s["requiredPassTypes"]),
                          render_layers=json.dumps(s["renderLayers"]), builtin=1))
        db.commit()
