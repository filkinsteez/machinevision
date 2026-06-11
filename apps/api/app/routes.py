import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile
from pydantic import BaseModel

from . import jobs, storage
from .config import MAX_UPLOAD_BYTES
from .db import (Asset, ExportRecord, Job, Preset, Project, SessionLocal,
                 VisionPass, new_id, now_iso)
from .vision import passes as pass_store

router = APIRouter(prefix="/api")


def _get_or_404(db, model, obj_id: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {obj_id} not found")
    return obj


# ---------------------------------------------------------------------- projects

class ProjectCreate(BaseModel):
    name: str = "Untitled Machine Vision Project"


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    renderLayers: Optional[list] = None
    timeline: Optional[dict] = None
    settings: Optional[dict] = None


@router.post("/projects")
def create_project(body: ProjectCreate):
    with SessionLocal() as db:
        proj = Project(id=new_id("project"), name=body.name)
        db.add(proj)
        db.commit()
        return proj.to_dict()


@router.get("/projects")
def list_projects():
    with SessionLocal() as db:
        return [p.to_dict() for p in db.query(Project).order_by(Project.created_at.desc())]


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    with SessionLocal() as db:
        return _get_or_404(db, Project, project_id).to_dict()


@router.patch("/projects/{project_id}")
def patch_project(project_id: str, body: ProjectPatch):
    with SessionLocal() as db:
        proj = _get_or_404(db, Project, project_id)
        if body.name is not None:
            proj.name = body.name
        if body.renderLayers is not None:
            proj.render_layers = json.dumps(body.renderLayers)
        if body.timeline is not None:
            proj.timeline = json.dumps(body.timeline)
        if body.settings is not None:
            proj.settings = json.dumps(body.settings)
        proj.updated_at = now_iso()
        db.commit()
        return proj.to_dict()


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    with SessionLocal() as db:
        proj = _get_or_404(db, Project, project_id)
        db.delete(proj)
        db.commit()
    return {"deleted": project_id}


@router.get("/projects/{project_id}/export-json")
def project_json(project_id: str):
    with SessionLocal() as db:
        proj = _get_or_404(db, Project, project_id).to_dict()
        proj["assets"] = [a.to_dict() for a in
                          db.query(Asset).filter(Asset.project_id == project_id)]
        proj["visionPasses"] = [v.to_dict() for v in
                                db.query(VisionPass).filter(VisionPass.project_id == project_id)]
        proj["schemaVersion"] = 1
    return proj


# ------------------------------------------------------------------------ assets

@router.post("/projects/{project_id}/assets")
async def upload_asset(project_id: str, file: UploadFile):
    with SessionLocal() as db:
        _get_or_404(db, Project, project_id)
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large")
    asset_id = new_id("asset")
    safe_name = "".join(c if (c.isalnum() or c in "._-") else "_" for c in (file.filename or "upload"))
    source_key = f"sources/{asset_id}/{safe_name}"
    storage.save_bytes(source_key, data)
    with SessionLocal() as db:
        asset = Asset(id=asset_id, project_id=project_id, type="video",
                      name=safe_name, status="ingesting", source_key=source_key)
        db.add(asset)
        db.commit()
        snapshot = asset.to_dict()
    job = jobs.submit("asset.ingest", {"assetId": asset_id}, project_id, asset_id)
    return {"asset": snapshot, "job": job}


@router.get("/projects/{project_id}/assets")
def list_assets(project_id: str):
    with SessionLocal() as db:
        return [a.to_dict() for a in db.query(Asset)
                .filter(Asset.project_id == project_id).order_by(Asset.created_at)]


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str):
    with SessionLocal() as db:
        return _get_or_404(db, Asset, asset_id).to_dict()


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str):
    with SessionLocal() as db:
        asset = _get_or_404(db, Asset, asset_id)
        pass_ids = [v.id for v in db.query(VisionPass).filter(VisionPass.asset_id == asset_id)]
        db.query(VisionPass).filter(VisionPass.asset_id == asset_id).delete()
        db.delete(asset)
        db.commit()
    storage.delete_prefix(f"sources/{asset_id}")
    storage.delete_prefix(f"proxies/{asset_id}")
    storage.delete_prefix(f"thumbnails/{asset_id}")
    for pid in pass_ids:
        storage.delete_prefix(f"vision-passes/{pid}")
    return {"deleted": asset_id, "deletedPasses": pass_ids}


# ----------------------------------------------------------------- vision passes

class SegmentRequest(BaseModel):
    projectId: str
    assetId: str
    prompt: dict  # {type: "click"|"box", points|box}
    name: Optional[str] = None


class DetectRequest(BaseModel):
    projectId: str
    assetId: str
    prompt: str
    threshold: float = 0.5
    seed: int = 1234


class LandmarksRequest(BaseModel):
    projectId: str
    assetId: str
    kind: str  # face | pose | hands


class FlowRequest(BaseModel):
    projectId: str
    assetId: str


class EdgeMatteRequest(BaseModel):
    projectId: str
    maskPassId: str
    edgeWidth: float = 0.02


def _cached_pass(db, ckey: str):
    return (db.query(VisionPass)
            .filter(VisionPass.cache_key == ckey, VisionPass.status == "ready")
            .first())


def _spawn_pass(project_id: str, asset_id: str, pass_type: str, name: str,
                provider: str, prompt: dict, params: dict, job_type: str,
                job_params: dict):
    ckey = pass_store.cache_key(asset_id, pass_type, provider, prompt, params)
    with SessionLocal() as db:
        cached = _cached_pass(db, ckey)
        if cached:
            return {"pass": cached.to_dict(), "cached": True, "job": None}
    pass_id = pass_store.create_pass(project_id, asset_id, pass_type, name,
                                     provider, "", prompt, params, ckey)
    job = jobs.submit(job_type, {**job_params, "passId": pass_id}, project_id, asset_id)
    with SessionLocal() as db:
        return {"pass": db.get(VisionPass, pass_id).to_dict(), "cached": False, "job": job}


@router.post("/vision/segment")
def vision_segment(body: SegmentRequest):
    name = body.name or f"mask:{body.prompt.get('type', 'prompt')}"
    return _spawn_pass(body.projectId, body.assetId, "mask", name, "segmentation",
                       body.prompt, {}, "vision.segment",
                       {"assetId": body.assetId, "prompt": body.prompt})


@router.post("/vision/detect")
def vision_detect(body: DetectRequest):
    prompt = {"text": body.prompt, "threshold": body.threshold, "seed": body.seed}
    with SessionLocal() as db:
        asset = _get_or_404(db, Asset, body.assetId)
        is_video = asset.type == "video"
    ckey = pass_store.cache_key(body.assetId, "detection", "detection", prompt, {})
    with SessionLocal() as db:
        cached = _cached_pass(db, ckey)
        if cached:
            return {"pass": cached.to_dict(), "cached": True, "job": None}
    det_id = pass_store.create_pass(body.projectId, body.assetId, "detection",
                                    f"detect:{body.prompt}", "detection", "", prompt, {}, ckey)
    track_id = None
    if is_video:
        track_id = pass_store.create_pass(body.projectId, body.assetId, "tracking",
                                          f"track:{body.prompt}", "tracking", "", prompt, {})
    job = jobs.submit("vision.detect",
                      {"assetId": body.assetId, "prompt": body.prompt,
                       "threshold": body.threshold, "seed": body.seed,
                       "passId": det_id, "trackPassId": track_id},
                      body.projectId, body.assetId)
    with SessionLocal() as db:
        return {"pass": db.get(VisionPass, det_id).to_dict(),
                "trackPassId": track_id, "cached": False, "job": job}


@router.post("/vision/landmarks")
def vision_landmarks(body: LandmarksRequest):
    if body.kind not in ("face", "pose", "hands"):
        raise HTTPException(400, "kind must be face|pose|hands")
    pass_type = {"face": "face_landmarks", "pose": "pose_landmarks",
                 "hands": "hand_landmarks"}[body.kind]
    return _spawn_pass(body.projectId, body.assetId, pass_type, f"{body.kind} landmarks",
                       "landmarks", {"kind": body.kind}, {}, "vision.landmarks",
                       {"assetId": body.assetId, "kind": body.kind})


@router.post("/vision/optical-flow")
def vision_flow(body: FlowRequest):
    return _spawn_pass(body.projectId, body.assetId, "optical_flow", "optical flow",
                       "motion", {}, {}, "vision.optical_flow", {"assetId": body.assetId})


@router.post("/vision/edge-matte")
def vision_edge_matte(body: EdgeMatteRequest):
    with SessionLocal() as db:
        src = _get_or_404(db, VisionPass, body.maskPassId)
    return _spawn_pass(body.projectId, src.asset_id, "edge_matte",
                       f"edge:{src.name}", "derive", {"source": body.maskPassId},
                       {"edgeWidth": body.edgeWidth}, "vision.edge_matte",
                       {"maskPassId": body.maskPassId, "edgeWidth": body.edgeWidth})


@router.get("/projects/{project_id}/vision-passes")
def list_passes(project_id: str):
    with SessionLocal() as db:
        return [v.to_dict() for v in db.query(VisionPass)
                .filter(VisionPass.project_id == project_id).order_by(VisionPass.created_at)]


@router.get("/vision/passes/{pass_id}")
def get_pass(pass_id: str):
    with SessionLocal() as db:
        return _get_or_404(db, VisionPass, pass_id).to_dict()


@router.delete("/vision/passes/{pass_id}")
def delete_pass(pass_id: str):
    with SessionLocal() as db:
        vp = _get_or_404(db, VisionPass, pass_id)
        db.delete(vp)
        db.commit()
    storage.delete_prefix(f"vision-passes/{pass_id}")
    return {"deleted": pass_id}


# ------------------------------------------------------------------------ render

class DatamoshRequest(BaseModel):
    projectId: str
    assetId: str
    maskPassId: str
    params: dict = {}


@router.post("/render/datamosh")
def render_datamosh(body: DatamoshRequest):
    export_id = new_id("export")
    with SessionLocal() as db:
        _get_or_404(db, Asset, body.assetId)
        _get_or_404(db, VisionPass, body.maskPassId)
        db.add(ExportRecord(id=export_id, project_id=body.projectId,
                            asset_id=body.assetId, type="baked_video",
                            format="mp4", status="queued"))
        db.commit()
    job = jobs.submit("render.datamosh",
                      {"assetId": body.assetId, "maskPassId": body.maskPassId,
                       "params": body.params, "exportId": export_id},
                      body.projectId, body.assetId)
    with SessionLocal() as db:
        return {"export": db.get(ExportRecord, export_id).to_dict(), "job": job}


# ----------------------------------------------------------------------- exports

class ExportRequest(BaseModel):
    projectId: str
    type: str  # mask_sequence | metadata
    passId: Optional[str] = None


@router.post("/exports")
def create_export(body: ExportRequest):
    export_id = new_id("export")
    if body.type == "mask_sequence":
        if not body.passId:
            raise HTTPException(400, "passId required")
        job_type, params, fmt = ("export.mask_sequence",
                                 {"exportId": export_id, "passId": body.passId}, "zip")
    elif body.type == "metadata":
        job_type, params, fmt = ("export.metadata",
                                 {"exportId": export_id, "projectId": body.projectId}, "json")
    else:
        raise HTTPException(400, f"unknown export type {body.type}")
    with SessionLocal() as db:
        db.add(ExportRecord(id=export_id, project_id=body.projectId,
                            type=body.type, format=fmt, status="queued"))
        db.commit()
    job = jobs.submit(job_type, params, body.projectId)
    with SessionLocal() as db:
        return {"export": db.get(ExportRecord, export_id).to_dict(), "job": job}


@router.get("/projects/{project_id}/exports")
def list_exports(project_id: str):
    with SessionLocal() as db:
        return [e.to_dict() for e in db.query(ExportRecord)
                .filter(ExportRecord.project_id == project_id)
                .order_by(ExportRecord.created_at.desc())]


@router.get("/exports/{export_id}")
def get_export(export_id: str):
    with SessionLocal() as db:
        return _get_or_404(db, ExportRecord, export_id).to_dict()


# ----------------------------------------------------- browser-bake frame sessions

class FinalizeBake(BaseModel):
    projectId: str
    fps: float = 30.0
    kind: str = "video"  # video | image
    assetId: Optional[str] = None  # audio source for the bake


@router.post("/exports/frame-session")
def create_frame_session():
    return {"sessionId": new_id("fsession")}


@router.put("/exports/frame-session/{session_id}/frames/{n}")
async def upload_bake_frame(session_id: str, n: int, request: Request):
    data = await request.body()
    storage.save_bytes(f"frame-sessions/{session_id}/{n:06d}.png", data)
    return {"ok": True, "frame": n}


@router.post("/exports/frame-session/{session_id}/finalize")
def finalize_bake(session_id: str, body: FinalizeBake):
    export_id = new_id("export")
    is_video = body.kind == "video"
    with SessionLocal() as db:
        db.add(ExportRecord(id=export_id, project_id=body.projectId,
                            type="baked_video" if is_video else "baked_image",
                            format="mp4" if is_video else "png", status="queued"))
        db.commit()
    job = jobs.submit("export.bake_frames" if is_video else "export.baked_image",
                      {"exportId": export_id, "sessionId": session_id, "fps": body.fps,
                       "assetId": body.assetId},
                      body.projectId)
    with SessionLocal() as db:
        return {"export": db.get(ExportRecord, export_id).to_dict(), "job": job}


# -------------------------------------------------------------------------- jobs

@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    with SessionLocal() as db:
        return _get_or_404(db, Job, job_id).to_dict()


@router.get("/projects/{project_id}/jobs")
def list_jobs(project_id: str):
    with SessionLocal() as db:
        return [j.to_dict() for j in db.query(Job)
                .filter(Job.project_id == project_id)
                .order_by(Job.created_at.desc()).limit(40)]


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    ok = jobs.cancel(job_id)
    return {"cancelRequested": ok}


# ----------------------------------------------------------------------- presets

class PresetCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "composite"
    requiredPassTypes: list[str] = []
    renderLayers: list[Any] = []


@router.get("/presets")
def list_presets():
    with SessionLocal() as db:
        return [p.to_dict() for p in db.query(Preset).order_by(Preset.builtin.desc(),
                                                               Preset.created_at)]


@router.post("/presets")
def create_preset(body: PresetCreate):
    with SessionLocal() as db:
        preset = Preset(id=new_id("preset"), name=body.name, description=body.description,
                        category=body.category,
                        required_pass_types=json.dumps(body.requiredPassTypes),
                        render_layers=json.dumps(body.renderLayers))
        db.add(preset)
        db.commit()
        return preset.to_dict()


@router.delete("/presets/{preset_id}")
def delete_preset(preset_id: str):
    with SessionLocal() as db:
        preset = _get_or_404(db, Preset, preset_id)
        if preset.builtin:
            raise HTTPException(400, "builtin presets cannot be deleted")
        db.delete(preset)
        db.commit()
    return {"deleted": preset_id}
