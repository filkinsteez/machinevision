"""Export jobs: mask PNG sequences, metadata JSON, browser-baked frame encoding.

Browser bake flow (export settings "render engine: preview"): the web app renders
each composited frame through the WebGL preview engine, uploads PNGs to a frame
session, and this module encodes them server-side — frame-accurate, no MediaRecorder.
"""
import json
import zipfile

import cv2
import numpy as np

from . import media, storage
from .db import ExportRecord, SessionLocal, VisionPass
from .jobs import handler
from .vision import passes


@handler("export.mask_sequence")
def run_mask_sequence(ctx):
    p = ctx.params
    export_id = p["exportId"]
    pass_id = p["passId"]
    data = passes.read_pass_data(pass_id)
    if data["type"] not in ("mask", "edge_matte"):
        raise ValueError("mask sequence export needs a mask/edge_matte pass")
    label = (data.get("prompt", {}).get("text")
             or data.get("prompt", {}).get("type") or data["type"])
    label = "".join(c if c.isalnum() else "_" for c in str(label))[:32] or "mask"
    out_key = f"exports/{export_id}/{label}_masks.zip"
    out_path = storage.open_for_write(out_key)
    frames = data["frames"]
    manifest = {"passId": pass_id, "type": data["type"], "label": label,
                "frameCount": len(frames), "width": data["width"], "height": data["height"]}
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_STORED) as zf:
        for i, f in enumerate(frames):
            src = storage.path_for(f"vision-passes/{pass_id}/masks/{f['frame']:06d}.png")
            if src.exists():
                zf.write(src, f"masks/{label}_{f['frame']:06d}.png")
            if i % 50 == 0:
                ctx.update(i / max(len(frames), 1), f"zipping {i}/{len(frames)}")
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
    _finish_export(export_id, out_key, manifest)
    return {"exportId": export_id}


@handler("export.metadata")
def run_metadata(ctx):
    p = ctx.params
    export_id = p["exportId"]
    with SessionLocal() as db:
        rows = (db.query(VisionPass)
                .filter(VisionPass.project_id == p["projectId"],
                        VisionPass.status == "ready").all())
    bundle = {"schemaVersion": 1, "projectId": p["projectId"], "passes": []}
    for i, row in enumerate(rows):
        entry = row.to_dict()
        data = passes.read_pass_data(row.id)
        # masks/flow stay as file refs; structured data is inlined
        if data["type"] in ("detection", "tracking", "face_landmarks",
                            "pose_landmarks", "hand_landmarks"):
            entry["data"] = data
        bundle["passes"].append(entry)
        ctx.update(i / max(len(rows), 1), f"bundling pass {i + 1}/{len(rows)}")
    out_key = f"exports/{export_id}/metadata.json"
    storage.save_bytes(out_key, json.dumps(bundle, indent=2).encode())
    _finish_export(export_id, out_key, {"passes": len(rows)})
    return {"exportId": export_id}


@handler("export.bake_frames")
def run_bake_frames(ctx):
    """Encode a browser-rendered PNG frame sequence into a video."""
    p = ctx.params
    export_id = p["exportId"]
    session_prefix = f"frame-sessions/{p['sessionId']}"
    fps = float(p.get("fps", 30.0))
    session_dir = storage.path_for(session_prefix)
    frames = sorted(session_dir.glob("*.png"))
    if not frames:
        raise ValueError("no frames uploaded to bake session")
    first = cv2.imread(str(frames[0]), cv2.IMREAD_COLOR)
    h, w = first.shape[:2]
    size = (w // 2 * 2, h // 2 * 2)
    codec, ext, mime = media.pick_encoder()
    out_key = f"exports/{export_id}/baked.{ext}"
    writer = media.VideoWriter(storage.open_for_write(out_key), fps, size)
    for i, fp in enumerate(frames):
        if ctx.cancelled:
            writer.close()
            return None
        img = cv2.imread(str(fp), cv2.IMREAD_COLOR)
        if img is None:
            continue
        if (img.shape[1], img.shape[0]) != size:
            img = cv2.resize(img, size)
        writer.write(img)
        if i % 30 == 0:
            ctx.update(i / len(frames), f"encoding frame {i}/{len(frames)}")
    writer.close()
    storage.delete_prefix(session_prefix)
    manifest = {"engine": "preview-bake/0.1", "frames": len(frames), "fps": fps,
                "note": "baked through the browser preview engine (preview-quality render)"}
    _finish_export(export_id, out_key, manifest)
    return {"exportId": export_id}


@handler("export.baked_image")
def run_baked_image(ctx):
    """Single browser-rendered frame saved as the baked image export."""
    p = ctx.params
    export_id = p["exportId"]
    src = storage.path_for(f"frame-sessions/{p['sessionId']}/000000.png")
    img = cv2.imread(str(src), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("no frame uploaded")
    out_key = f"exports/{export_id}/baked.png"
    ok, buf = cv2.imencode(".png", img)
    storage.save_bytes(out_key, buf.tobytes())
    storage.delete_prefix(f"frame-sessions/{p['sessionId']}")
    _finish_export(export_id, out_key, {"engine": "preview-bake/0.1"})
    return {"exportId": export_id}


def _finish_export(export_id: str, out_key: str, manifest: dict):
    with SessionLocal() as db:
        rec = db.get(ExportRecord, export_id)
        rec.status = "ready"
        rec.output_key = out_key
        rec.manifest = json.dumps(manifest)
        db.commit()
