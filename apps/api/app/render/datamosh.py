"""Authentic codec datamosh engine (IMPLEMENTATION_PLAN AD-9).

Pipeline:
  1. Re-encode the source to MPEG-4 ASP in AVI (the classic datamosh substrate:
     P-frame-only friendly, timestamp-lenient, decoders conceal errors gracefully)
     with a controlled GOP and scene-cut keyframes suppressed.
  2. Packet surgery while decoding: drop I-frame packets after the first (motion
     vectors apply to stale content -> the classic melt), duplicate P-frame packets
     (motion applies twice -> bloom), optionally drop P packets (freeze stutter).
  3. Composite per frame: clean * (1-m) + moshed * m through the routed mask /
     edge-matte pass (eroded/dilated/feathered, with edge leak), streaming into
     the output encoder. Clean, moshed, and composited streams are all kept so
     "clean pass" and "datamosh pass" exports come for free.
"""
import json
import random
import tempfile
from pathlib import Path

import av
import cv2
import numpy as np

from .. import media, storage
from ..db import Asset, ExportRecord, SessionLocal, new_id
from ..jobs import handler
from ..vision import passes

ENGINE_VERSION = "codec-mosh/0.1 (mpeg4-avi packet surgery)"


def encode_mosh_substrate(src_path: Path, dst_path: Path, size: tuple[int, int],
                          fps: float, gop: int, bitrate: int = 2_500_000,
                          progress=None, total: int = 1):
    # Low bitrate is load-bearing: weak P-frame residuals can't heal the image
    # after dropped I-frames, so motion-vector corruption persists (the melt).
    writer = media.VideoWriter(
        dst_path, fps, size, codec="mpeg4", bitrate=bitrate,
        codec_options={"g": str(max(gop, 1)), "bf": "0", "sc_threshold": "1000000000"})
    for idx, frame in media.iter_video_frames(src_path, size):
        writer.write(frame)
        if progress and idx % 30 == 0:
            progress(idx / total, "encoding mosh substrate")
    writer.close()


def iter_mosh_frames(substrate_path: Path, drop_iframes: bool, dup_every: int,
                     dup_count: int, drop_every: int, seed: int):
    """Yields one BGR frame or None (= hold last frame) per original frame slot."""
    rng = random.Random(seed)
    container = av.open(str(substrate_path))
    vs = container.streams.video[0]
    dec = av.CodecContext.create(vs.codec_context.name, "r")
    if vs.codec_context.extradata:
        dec.extradata = vs.codec_context.extradata
    first_key_decoded = False
    slot = 0
    try:
        for packet in container.demux(vs):
            if packet.size == 0:
                continue
            if packet.is_keyframe:
                if not first_key_decoded:
                    first_key_decoded = True
                    frames = dec.decode(packet)
                    yield frames[-1].to_ndarray(format="bgr24") if frames else None
                elif drop_iframes:
                    yield None  # the melt: motion keeps applying to stale content
                else:
                    frames = dec.decode(packet)
                    yield frames[-1].to_ndarray(format="bgr24") if frames else None
                slot += 1
                continue
            if drop_every and slot > 0 and slot % drop_every == 0:
                yield None
                slot += 1
                continue
            repeats = 1
            if dup_every and slot > 0 and slot % dup_every == 0:
                repeats += dup_count + rng.randint(0, 1)
            frames = []
            for _ in range(repeats):
                try:
                    frames.extend(dec.decode(packet))
                except av.FFmpegError:
                    pass
            yield frames[-1].to_ndarray(format="bgr24") if frames else None
            slot += 1
    finally:
        container.close()


def build_mask_processor(mask_pass_id: str, mode: str, size: tuple[int, int],
                         feather_frac: float, erode_frac: float, dilate_frac: float,
                         edge_leak: float):
    """Returns fn(frame_idx) -> float32 mask 0..1 at composite size."""
    data = passes.read_pass_data(mask_pass_id)
    if data["type"] not in ("mask", "edge_matte"):
        raise ValueError("datamosh needs a mask or edge_matte pass")
    available = {f["frame"] for f in data["frames"]}
    min_dim = min(size)

    def px(frac):
        return max(int(min_dim * frac), 0)

    feather = px(feather_frac) | 1
    erode_k = px(erode_frac)
    dilate_k = px(dilate_frac)
    leak_k = px(edge_leak * 0.08)
    last = [np.zeros((size[1], size[0]), np.float32)]

    def get(frame_idx: int) -> np.ndarray:
        if frame_idx in available:
            key = f"vision-passes/{mask_pass_id}/masks/{frame_idx:06d}.png"
            m = cv2.imread(str(storage.path_for(key)), cv2.IMREAD_GRAYSCALE)
            if m is not None:
                if (m.shape[1], m.shape[0]) != size:
                    m = cv2.resize(m, size, interpolation=cv2.INTER_LINEAR)
                if erode_k:
                    m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (erode_k, erode_k)))
                if dilate_k:
                    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_k, dilate_k)))
                if leak_k:
                    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (leak_k * 2 + 1,) * 2))
                    m = cv2.GaussianBlur(m, (leak_k * 4 + 1,) * 2, 0)
                if feather > 1:
                    m = cv2.GaussianBlur(m, (feather, feather), 0)
                last[0] = m.astype(np.float32) / 255.0
        m = last[0]
        if mode == "background":
            return 1.0 - m
        return m

    return get


@handler("render.datamosh")
def run_datamosh(ctx):
    p = ctx.params
    with SessionLocal() as db:
        asset = db.get(Asset, p["assetId"])
    if asset is None or asset.status != "ready" or asset.type != "video":
        raise ValueError("datamosh requires a ready video asset")

    params = p.get("params", {})
    mode = params.get("mode", "subject")           # subject | background | edge
    strength = float(params.get("strength", 0.85))
    gop = int(params.get("keyframeDistance", 18))
    dup_every = int(params.get("dupEvery", 0))      # 0 = off
    dup_count = int(params.get("dupCount", 2))
    drop_every = int(params.get("dropEvery", 0))
    drop_iframes = bool(params.get("dropIFrames", True))
    seed = int(params.get("seed", 1234))
    feather = float(params.get("maskFeather", 0.01))
    erode = float(params.get("maskErode", 0.0))
    dilate = float(params.get("maskDilate", 0.0))
    edge_leak = float(params.get("edgeLeak", 0.3))
    substrate_bitrate = int(params.get("moshBitrate", 2_500_000))

    size = (asset.proxy_width, asset.proxy_height)
    fps = asset.fps or 30.0
    total = asset.frame_count or 1
    proxy_path = storage.path_for(asset.proxy_key)
    mask_fn = build_mask_processor(p["maskPassId"], mode, size, feather, erode, dilate, edge_leak)

    export_id = p["exportId"]
    codec, ext, mime = media.pick_encoder()
    baked_key = f"renders/{export_id}/baked.{ext}"
    mosh_key = f"renders/{export_id}/datamosh_pass.{ext}"

    with tempfile.TemporaryDirectory() as tmp:
        substrate = Path(tmp) / "substrate.avi"
        encode_mosh_substrate(proxy_path, substrate, size, fps, gop, substrate_bitrate,
                              progress=lambda f, s: ctx.update(f * 0.3, s), total=total)
        if ctx.cancelled:
            return None

        baked = media.VideoWriter(storage.open_for_write(baked_key), fps, size)
        moshpass = media.VideoWriter(storage.open_for_write(mosh_key), fps, size)
        clean_iter = media.iter_video_frames(proxy_path, size)
        mosh_iter = iter_mosh_frames(substrate, drop_iframes, dup_every, dup_count,
                                     drop_every, seed)
        last_mosh = None
        n = 0
        try:
            for (idx, clean), mosh in zip(clean_iter, mosh_iter):
                if ctx.cancelled:
                    return None
                if mosh is not None:
                    last_mosh = mosh
                m = last_mosh if last_mosh is not None else clean
                if m.shape[:2] != clean.shape[:2]:
                    m = cv2.resize(m, size)
                alpha = (mask_fn(idx) * strength)[..., None]
                comp = (clean.astype(np.float32) * (1 - alpha) + m.astype(np.float32) * alpha)
                baked.write(np.clip(comp, 0, 255).astype(np.uint8))
                moshpass.write(m)
                n += 1
                if idx % 20 == 0:
                    ctx.update(0.3 + (idx / total) * 0.65, f"compositing frame {idx}/{total}")
        finally:
            mosh_iter.close()  # release the substrate file before tempdir cleanup
            clean_iter.close()
            baked.close()
            moshpass.close()
        if ctx.cancelled:
            return None

    manifest = {
        "engine": ENGINE_VERSION,
        "assetId": asset.id, "maskPassId": p["maskPassId"],
        "params": params, "seed": seed, "frames": n, "fps": fps,
        "outputs": {"baked": f"/storage/{baked_key}", "datamoshPass": f"/storage/{mosh_key}",
                    "cleanPass": f"/storage/{asset.proxy_key}"},
    }
    storage.save_bytes(f"renders/{export_id}/manifest.json", json.dumps(manifest, indent=2).encode())

    with SessionLocal() as db:
        rec = db.get(ExportRecord, export_id)
        rec.status = "ready"
        rec.output_key = baked_key
        rec.manifest = json.dumps(manifest)
        db.commit()
        # companion record for the separable datamosh pass
        db.add(ExportRecord(id=new_id("export"), project_id=rec.project_id,
                            asset_id=asset.id, type="datamosh_pass", format=ext,
                            status="ready", output_key=mosh_key,
                            manifest=json.dumps({"parentExport": export_id})))
        db.commit()
    return {"exportId": export_id, "outputUrl": f"/storage/{baked_key}"}
