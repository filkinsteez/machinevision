"""Asset ingest: probe, thumbnail, proxy."""
import cv2

from . import media, storage
from .config import MAX_VIDEO_SECONDS, PROXY_MAX_HEIGHT, THUMB_HEIGHT
from .db import Asset, SessionLocal
from .jobs import handler


@handler("asset.ingest")
def run_ingest(ctx):
    asset_id = ctx.params["assetId"]
    with SessionLocal() as db:
        asset = db.get(Asset, asset_id)
        if asset is None:
            raise ValueError("asset not found")
        src = storage.path_for(asset.source_key)

    try:
        meta = media.probe_image(src)
        if meta is None:
            meta = media.probe(src)
        if meta["type"] == "video" and meta["duration"] and meta["duration"] > MAX_VIDEO_SECONDS:
            raise ValueError(
                f"video is {meta['duration']:.0f}s — beta limit is {MAX_VIDEO_SECONDS}s")

        ctx.update(0.1, "probed")
        prefix = f"proxies/{asset_id}"
        thumb_key = f"thumbnails/{asset_id}/thumb.jpg"

        if meta["type"] == "image":
            img = cv2.imread(str(src), cv2.IMREAD_COLOR)
            pw, ph = media.proxy_size(meta["width"], meta["height"], PROXY_MAX_HEIGHT)
            proxy = cv2.resize(img, (pw, ph), interpolation=cv2.INTER_AREA)
            proxy_key = f"{prefix}/proxy.png"
            ok, buf = cv2.imencode(".png", proxy)
            storage.save_bytes(proxy_key, buf.tobytes())
            th = cv2.resize(img, (int(meta["width"] * THUMB_HEIGHT / meta["height"]), THUMB_HEIGHT))
            ok, tbuf = cv2.imencode(".jpg", th, [cv2.IMWRITE_JPEG_QUALITY, 85])
            storage.save_bytes(thumb_key, tbuf.tobytes())
            proxy_info = {"mime": "image/png", "width": pw, "height": ph,
                          "fps": None, "frameCount": 1}
        else:
            mid = (meta["frameCount"] or 2) // 2
            media.make_thumbnail(src, storage.open_for_write(thumb_key), mid, THUMB_HEIGHT)
            ctx.update(0.2, "thumbnail done")
            proxy_dir = storage.open_for_write(f"{prefix}/proxy").parent
            result = media.make_proxy(src, proxy_dir, PROXY_MAX_HEIGHT,
                                      progress=lambda f, s: ctx.update(0.2 + f * 0.75, s))
            proxy_key = f"{prefix}/{result['path'].name}"
            proxy_info = result
            meta["frameCount"] = result["frameCount"]  # trust the actual decode count
            meta["fps"] = result["fps"]

        with SessionLocal() as db:
            asset = db.get(Asset, asset_id)
            asset.type = meta["type"]
            asset.status = "ready"
            asset.width = meta["width"]
            asset.height = meta["height"]
            asset.fps = meta["fps"]
            asset.duration = meta["duration"]
            asset.frame_count = meta["frameCount"]
            asset.proxy_key = proxy_key
            asset.proxy_mime = proxy_info["mime"]
            asset.proxy_width = proxy_info["width"]
            asset.proxy_height = proxy_info["height"]
            asset.thumb_key = thumb_key
            db.commit()
        return {"assetId": asset_id}
    except Exception as exc:
        with SessionLocal() as db:
            asset = db.get(Asset, asset_id)
            if asset:
                asset.status = "failed"
                asset.error = str(exc)
                db.commit()
        raise
