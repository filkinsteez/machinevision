"""Vision Pass persistence. One directory per pass under vision-passes/{id}/:

  data.json          normalized pass schema (the only thing render layers read)
  masks/{n:06d}.png  8-bit grayscale mask frames (mask / edge_matte passes)
  flow/{n:06d}.png   RG-packed quantized flow frames (optical_flow passes)

All coordinates in data.json are normalized 0..1 so proxy and source resolution
never misalign.
"""
import hashlib
import json

import cv2
import numpy as np

from .. import storage
from ..config import SCHEMA_VERSION
from ..db import SessionLocal, VisionPass, new_id


def cache_key(asset_id: str, pass_type: str, provider: str, prompt: dict, params: dict) -> str:
    blob = json.dumps({"a": asset_id, "t": pass_type, "p": provider,
                       "prompt": prompt, "params": params}, sort_keys=True)
    return hashlib.sha1(blob.encode()).hexdigest()


class PassWriter:
    def __init__(self, pass_id: str):
        self.pass_id = pass_id
        self.prefix = f"vision-passes/{pass_id}"

    def write_mask_frame(self, idx: int, mask_u8: np.ndarray) -> str:
        key = f"{self.prefix}/masks/{idx:06d}.png"
        ok, buf = cv2.imencode(".png", mask_u8)
        if not ok:
            raise RuntimeError("png encode failed")
        storage.save_bytes(key, buf.tobytes())
        return key

    def write_frame(self, subdir: str, idx: int, img: np.ndarray) -> str:
        """Generic per-frame PNG writer (grayscale or BGR) under {subdir}/."""
        key = f"{self.prefix}/{subdir}/{idx:06d}.png"
        ok, buf = cv2.imencode(".png", img)
        if not ok:
            raise RuntimeError("png encode failed")
        storage.save_bytes(key, buf.tobytes())
        return key

    def write_flow_frame(self, idx: int, flow: np.ndarray) -> tuple[str, float]:
        """flow: HxWx2 float32. Packed as R=u, G=v normalized by per-frame scale."""
        mag = float(np.abs(flow).max())
        scale = max(mag, 1e-6)
        packed = np.zeros((flow.shape[0], flow.shape[1], 3), dtype=np.uint8)
        norm = (flow / scale) * 0.5 + 0.5  # [-scale,scale] -> [0,1]
        packed[..., 2] = np.clip(norm[..., 0] * 255, 0, 255).astype(np.uint8)  # R (bgr order)
        packed[..., 1] = np.clip(norm[..., 1] * 255, 0, 255).astype(np.uint8)  # G
        key = f"{self.prefix}/flow/{idx:06d}.png"
        ok, buf = cv2.imencode(".png", packed)
        storage.save_bytes(key, buf.tobytes())
        return key, scale

    def finalize(self, data: dict) -> str:
        data = {"schemaVersion": SCHEMA_VERSION, "id": self.pass_id, **data}
        key = f"{self.prefix}/data.json"
        storage.save_bytes(key, json.dumps(data).encode())
        return key


def create_pass(project_id: str, asset_id: str, pass_type: str, name: str,
                provider: str, provider_version: str, prompt: dict, params: dict,
                ckey: str | None = None) -> str:
    pid = new_id("pass")
    with SessionLocal() as db:
        vp = VisionPass(
            id=pid, project_id=project_id, asset_id=asset_id, type=pass_type,
            name=name, provider=provider, provider_version=provider_version,
            status="running", prompt=json.dumps(prompt), params=json.dumps(params),
            cache_key=ckey,
        )
        db.add(vp)
        db.commit()
    return pid


def finish_pass(pass_id: str, data_key: str, frame_start: int, frame_end: int,
                summary: dict, provider_version: str | None = None):
    with SessionLocal() as db:
        vp = db.get(VisionPass, pass_id)
        vp.status = "ready"
        vp.data_key = data_key
        vp.frame_start = frame_start
        vp.frame_end = frame_end
        vp.summary = json.dumps(summary)
        if provider_version:
            vp.provider_version = provider_version
        db.commit()


def fail_pass(pass_id: str, error: str):
    with SessionLocal() as db:
        vp = db.get(VisionPass, pass_id)
        if vp:
            vp.status = "failed"
            vp.error = error
            db.commit()


def read_pass_data(pass_id: str) -> dict:
    key = f"vision-passes/{pass_id}/data.json"
    return json.loads(storage.path_for(key).read_text())
