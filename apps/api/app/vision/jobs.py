"""Vision job handlers: providers in, normalized passes out."""
import cv2
import numpy as np

from .. import media, storage
from ..db import Asset, SessionLocal
from ..jobs import handler
from . import adapter, passes, providers, providers_people, providers_real, providers_sapiens


def _get_asset(asset_id: str) -> Asset:
    with SessionLocal() as db:
        asset = db.get(Asset, asset_id)
    if asset is None or asset.status != "ready":
        raise ValueError(f"asset {asset_id} not ready")
    return asset


def _frames(asset: Asset):
    """Yields (idx, bgr) at proxy resolution; single frame for images."""
    if asset.type == "image":
        img = cv2.imread(str(storage.path_for(asset.proxy_key)), cv2.IMREAD_COLOR)
        yield 0, img
    else:
        yield from media.iter_video_frames(storage.path_for(asset.proxy_key))


def _segment_real(ctx, asset, prompt, pass_id, writer):
    """SAM 2.1 segmentation. Text prompts route through Grounding DINO first."""
    size = (asset.proxy_width, asset.proxy_height)
    frames = [img for _, img in _frames(asset)]
    total = len(frames)

    if prompt.get("type") == "text":
        threshold = float(prompt.get("threshold", 0.35))
        ctx.update(0.02, "grounding prompt")
        boxes, scores, labels = providers_real.dino_detect(frames[0], prompt["text"], threshold)
        if len(boxes) == 0:
            raise ValueError(f"nothing matching '{prompt['text']}' found in frame 0")
        order = np.argsort(-scores)[:4]  # up to 4 strongest objects
        sam_prompts = []
        for i in order:
            x1, y1, x2, y2 = (float(v) for v in boxes[i])
            sam_prompts.append({"type": "box",
                                "box": [x1 / size[0], y1 / size[1],
                                        (x2 - x1) / size[0], (y2 - y1) / size[1]]})
        provider_version = f"{providers_real.versions()['sam2']} + grounding-dino"
    else:
        sam_prompts = [prompt]
        provider_version = providers_real.versions()["sam2"]

    frames_meta = []
    prev_mask = None
    if asset.type == "image":
        mask, score = providers_real.sam2_image_mask(frames[0], sam_prompts[0])
        results = [(0, mask, score)]
    else:
        results = providers_real.sam2_video_masks(frames, sam_prompts)

    last = 0
    for idx, mask, _score in results:
        if ctx.cancelled:
            passes.fail_pass(pass_id, "cancelled")
            return None
        writer.write_mask_frame(idx, mask)
        conf = providers.mask_iou(prev_mask, mask) if prev_mask is not None else 0.95
        prev_mask = mask
        bbox = providers.mask_bbox(mask)
        nb = None
        if bbox:
            x, y, w, h = bbox
            nb = [round(x / size[0], 4), round(y / size[1], 4),
                  round(w / size[0], 4), round(h / size[1], 4)]
        frames_meta.append({"frame": idx, "bbox": nb, "confidence": round(conf, 4),
                            "area": round(float((mask > 0).mean()), 4)})
        last = idx
        if idx % 10 == 0:
            ctx.update(0.05 + (idx / total) * 0.9, f"sam2 frame {idx}/{total}")

    mean_conf = float(np.mean([f["confidence"] for f in frames_meta]))
    data_key = writer.finalize({
        "type": "mask", "assetId": asset.id,
        "provider": "segmentation", "providerVersion": provider_version,
        "width": size[0], "height": size[1],
        "prompt": prompt, "frames": frames_meta,
    })
    passes.finish_pass(pass_id, data_key, 0, last,
                       {"meanConfidence": round(mean_conf, 3), "frames": len(frames_meta),
                        "objects": len(sam_prompts)}, provider_version)
    return {"passId": pass_id}


@handler("vision.segment")
def run_segment(ctx):
    p = ctx.params
    asset = _get_asset(p["assetId"])
    prompt = p["prompt"]
    pass_id = p["passId"]
    writer = passes.PassWriter(pass_id)
    try:
        if providers_real.available():
            return _segment_real(ctx, asset, prompt, pass_id, writer)
        if prompt.get("type") == "text":
            raise ValueError("text-prompted segmentation needs the GPU providers "
                             "(CUDA not available) — use click or box prompts")
        frames_meta = []
        tracker = None
        total = asset.frame_count or 1
        size = (asset.proxy_width, asset.proxy_height)
        last = 0
        for idx, frame in _frames(asset):
            if ctx.cancelled:
                passes.fail_pass(pass_id, "cancelled")
                return None
            if idx == 0:
                mask = providers.grabcut_initial_mask(frame, prompt)
                conf = 0.9
                tracker = providers.MaskTracker(frame, mask)
            else:
                mask, conf = tracker.step(frame)
            writer.write_mask_frame(idx, mask)
            bbox = providers.mask_bbox(mask)
            nb = None
            if bbox:
                x, y, w, h = bbox
                nb = [round(x / size[0], 4), round(y / size[1], 4),
                      round(w / size[0], 4), round(h / size[1], 4)]
            frames_meta.append({"frame": idx, "bbox": nb, "confidence": round(conf, 4),
                                "area": round(float((mask > 0).mean()), 4)})
            last = idx
            if idx % 10 == 0:
                ctx.update(idx / total, f"segmenting frame {idx}/{total}")
        mean_conf = float(np.mean([f["confidence"] for f in frames_meta]))
        data_key = writer.finalize({
            "type": "mask", "assetId": asset.id,
            "provider": "segmentation", "providerVersion": providers.GRABCUT_VERSION,
            "width": size[0], "height": size[1],
            "prompt": prompt, "frames": frames_meta,
        })
        passes.finish_pass(pass_id, data_key, 0, last,
                           {"meanConfidence": round(mean_conf, 3), "frames": len(frames_meta)})
        return {"passId": pass_id}
    except Exception as exc:
        passes.fail_pass(pass_id, str(exc))
        raise


@handler("vision.detect")
def run_detect(ctx):
    p = ctx.params
    asset = _get_asset(p["assetId"])
    prompt_text = p.get("prompt", "object")
    threshold = float(p.get("threshold", 0.5))
    seed = int(p.get("seed", 1234))
    det_pass_id = p["passId"]
    track_pass_id = p.get("trackPassId")
    det_writer = passes.PassWriter(det_pass_id)
    try:
        size = (asset.proxy_width, asset.proxy_height)
        total = asset.frame_count or 1
        tracker = adapter.make_tracker() if asset.type == "video" else None
        use_real = providers_real.available()
        det_frames = []
        tracks: dict[str, dict] = {}
        last = 0
        for idx, frame in _frames(asset):
            if ctx.cancelled:
                passes.fail_pass(det_pass_id, "cancelled")
                return None
            if use_real:
                boxes, scores, labels = providers_real.dino_detect(frame, prompt_text, threshold)
                det = adapter.to_detections(boxes, scores, labels)
                det = adapter.filter_detections(det, min_confidence=threshold)
            else:
                det = providers.stub_detect(frame, prompt_text, threshold, seed, idx)
            if tracker is not None:
                det = tracker.update_with_detections(det)
            items = adapter.detections_to_schema(det, idx, size)
            det_frames.append({"frame": idx, "detections": items})
            for d in items:
                tid = d.get("trackId")
                if tid:
                    tracks.setdefault(tid, {"id": tid, "label": d["label"], "frames": []})
                    tracks[tid]["frames"].append({"frame": idx, "bbox": d["bbox"],
                                                  "confidence": d["confidence"]})
            last = idx
            if idx % 15 == 0:
                ctx.update(idx / total, f"detecting frame {idx}/{total}")
        det_key = det_writer.finalize({
            "type": "detection", "assetId": asset.id,
            "provider": "detection",
            "providerVersion": (providers_real.versions()["dino"] if use_real
                                else providers.DETECTOR_VERSION),
            "width": size[0], "height": size[1],
            "prompt": {"text": prompt_text, "threshold": threshold}, "frames": det_frames,
        })
        n_det = sum(len(f["detections"]) for f in det_frames)
        passes.finish_pass(det_pass_id, det_key, 0, last,
                           {"detections": n_det, "frames": len(det_frames)},
                           providers_real.versions()["dino"] if use_real
                           else providers.DETECTOR_VERSION)
        result = {"passId": det_pass_id}
        if track_pass_id and tracks:
            tw = passes.PassWriter(track_pass_id)
            track_key = tw.finalize({
                "type": "tracking", "assetId": asset.id,
                "provider": "tracking", "providerVersion": "supervision-bytetrack",
                "width": size[0], "height": size[1],
                "prompt": {"text": prompt_text}, "tracks": list(tracks.values()),
            })
            passes.finish_pass(track_pass_id, track_key, 0, last, {"tracks": len(tracks)})
            result["trackPassId"] = track_pass_id
        elif track_pass_id:
            passes.fail_pass(track_pass_id, "no tracks produced")
        return result
    except Exception as exc:
        passes.fail_pass(det_pass_id, str(exc))
        if track_pass_id:
            passes.fail_pass(track_pass_id, str(exc))
        raise


@handler("vision.people")
def run_people(ctx):
    """YOLO11-pose: boxes + tracked skeletons for EVERY person, one model, one
    decode. Writes a detection pass and a pose_landmarks pass together."""
    p = ctx.params
    asset = _get_asset(p["assetId"])
    det_pass_id = p["passId"]
    pose_pass_id = p["posePassId"]
    if not providers_people.available():
        passes.fail_pass(det_pass_id, "people detection needs a CUDA GPU")
        passes.fail_pass(pose_pass_id, "people detection needs a CUDA GPU")
        raise ValueError("YOLO people provider requires CUDA")
    det_writer = passes.PassWriter(det_pass_id)
    pose_writer = passes.PassWriter(pose_pass_id)
    try:
        providers_people.reset_tracker()
        total = asset.frame_count or 1
        det_frames = []
        pose_frames = []
        tracks_seen: set[int] = set()
        frames_with = 0
        last = 0
        for idx, frame in _frames(asset):
            if ctx.cancelled:
                passes.fail_pass(det_pass_id, "cancelled")
                passes.fail_pass(pose_pass_id, "cancelled")
                return None
            people = providers_people.track_frame(frame)
            dets = []
            ents = []
            for person in people:
                tid = person["trackId"]
                tracks_seen.add(tid)
                dets.append({
                    "id": f"det_{idx}_{tid}", "label": "person",
                    "bbox": person["bbox"], "confidence": person["confidence"],
                    "trackId": f"track_{tid}",
                })
                ents.append({"id": f"person_{tid}", "points": person["points"]})
            det_frames.append({"frame": idx, "detections": dets})
            pose_frames.append({"frame": idx, "entities": ents})
            if people:
                frames_with += 1
            last = idx
            if idx % 10 == 0:
                ctx.update(idx / total, f"people frame {idx}/{total}")

        ver = providers_people.version()
        det_key = det_writer.finalize({
            "type": "detection", "assetId": asset.id,
            "provider": "people", "providerVersion": ver,
            "width": asset.proxy_width, "height": asset.proxy_height,
            "prompt": {"text": "person"}, "frames": det_frames,
        })
        n_det = sum(len(f["detections"]) for f in det_frames)
        passes.finish_pass(det_pass_id, det_key, 0, last,
                           {"people": len(tracks_seen), "detections": n_det}, ver)
        pose_key = pose_writer.finalize({
            "type": "pose_landmarks", "assetId": asset.id, "kind": "pose",
            "provider": "people", "providerVersion": ver,
            "width": asset.proxy_width, "height": asset.proxy_height,
            "connections": [list(c) for c in providers_people.COCO_CONNECTIONS],
            "frames": pose_frames,
        })
        passes.finish_pass(pose_pass_id, pose_key, 0, last,
                           {"seen in": f"{frames_with}/{len(pose_frames)} frames",
                            "people": len(tracks_seen)}, ver)
        return {"passId": det_pass_id, "posePassId": pose_pass_id}
    except Exception as exc:
        passes.fail_pass(det_pass_id, str(exc))
        passes.fail_pass(pose_pass_id, str(exc))
        raise


@handler("vision.landmarks")
def run_landmarks(ctx):
    p = ctx.params
    asset = _get_asset(p["assetId"])
    kind = p.get("kind", "face")
    pass_id = p["passId"]
    writer = passes.PassWriter(pass_id)
    sol = None
    pose_sol = None
    try:
        # pose goes through YOLO11-pose when the GPU is up — MediaPipe collapses
        # past ~2 people; face/hands stay MediaPipe (it's good at those)
        if kind == "pose" and providers_people.available():
            providers_people.reset_tracker()
            total = asset.frame_count or 1
            frames_meta = []
            frames_with = 0
            people_seen: set[int] = set()
            last = 0
            for idx, frame in _frames(asset):
                if ctx.cancelled:
                    passes.fail_pass(pass_id, "cancelled")
                    return None
                people = providers_people.track_frame(frame)
                ents = [{"id": f"person_{q['trackId']}", "points": q["points"]} for q in people]
                for q in people:
                    people_seen.add(q["trackId"])
                if ents:
                    frames_with += 1
                frames_meta.append({"frame": idx, "entities": ents})
                last = idx
                if idx % 10 == 0:
                    ctx.update(idx / total, f"pose frame {idx}/{total}")
            ver = providers_people.version()
            data_key = writer.finalize({
                "type": "pose_landmarks", "assetId": asset.id, "kind": "pose",
                "provider": "people", "providerVersion": ver,
                "width": asset.proxy_width, "height": asset.proxy_height,
                "connections": [list(c) for c in providers_people.COCO_CONNECTIONS],
                "frames": frames_meta,
            })
            passes.finish_pass(pass_id, data_key, 0, last,
                               {"seen in": f"{frames_with}/{len(frames_meta)} frames",
                                "people": len(people_seen)}, ver)
            return {"passId": pass_id}

        process, connections, sol = providers.get_landmarker(kind)
        total = asset.frame_count or 1
        frames_meta = []
        detected = 0
        last = 0
        frames_with = 0
        # Face mesh hallucinates on textured non-face regions (jackets, knees) in
        # distorted footage. Gate detections against the pose skeleton, which
        # robustly locates the real head — keep a face only if its box contains a
        # pose head keypoint (nose/eyes/ears).
        pose_process = pose_sol = None
        if kind == "face":
            try:
                pose_process, _, pose_sol = providers.get_landmarker("pose")
            except Exception:
                pose_process = None
        for idx, frame in _frames(asset):
            if ctx.cancelled:
                passes.fail_pass(pass_id, "cancelled")
                return None
            entities = process(frame, idx)
            if pose_process is not None and entities:
                head = []
                for pent in pose_process(frame, idx):
                    pts = pent["points"]
                    for hi in (0, 2, 5, 7, 8):  # nose, eyes, ears
                        if hi < len(pts) and (len(pts[hi]) < 4 or pts[hi][3] > 0.3):
                            head.append((pts[hi][0], pts[hi][1]))
                # Only gate when pose actually located a head. A close-up portrait
                # may have no visible body — there we must trust the face as-is
                # rather than reject a real detection.
                if head:
                    kept = []
                    for ent in entities:
                        xs = [pt[0] for pt in ent["points"]]
                        ys = [pt[1] for pt in ent["points"]]
                        pad_x = (max(xs) - min(xs)) * 0.25
                        pad_y = (max(ys) - min(ys)) * 0.25
                        if any(min(xs) - pad_x <= hx <= max(xs) + pad_x and
                               min(ys) - pad_y <= hy <= max(ys) + pad_y for hx, hy in head):
                            kept.append(ent)
                    entities = kept
            detected += len(entities)
            if entities:
                frames_with += 1
            frames_meta.append({"frame": idx, "entities": entities})
            last = idx
            if idx % 15 == 0:
                ctx.update(idx / total, f"{kind} landmarks frame {idx}/{total}")
        pass_type = {"face": "face_landmarks", "pose": "pose_landmarks",
                     "hands": "hand_landmarks"}[kind]
        data_key = writer.finalize({
            "type": pass_type, "assetId": asset.id, "kind": kind,
            "provider": "landmarks", "providerVersion": providers.mediapipe_version(),
            "width": asset.proxy_width, "height": asset.proxy_height,
            "connections": [list(c) for c in connections],
            "frames": frames_meta,
        })
        noun = {"face": "faces", "pose": "poses", "hands": "hands"}[kind]
        passes.finish_pass(pass_id, data_key, 0, last,
                           {"seen in": f"{frames_with}/{len(frames_meta)} frames",
                            noun: detected},
                           providers.mediapipe_version())
        return {"passId": pass_id}
    except Exception as exc:
        passes.fail_pass(pass_id, str(exc))
        raise
    finally:
        if pose_sol is not None:
            try:
                pose_sol.close()
            except Exception:
                pass
        if sol is not None:
            try:
                sol.close()
            except Exception:
                pass


@handler("vision.optical_flow")
def run_optical_flow(ctx):
    p = ctx.params
    asset = _get_asset(p["assetId"])
    if asset.type != "video":
        raise ValueError("optical flow requires a video asset")
    pass_id = p["passId"]
    writer = passes.PassWriter(pass_id)
    try:
        total = asset.frame_count or 1
        # half proxy res keeps Farneback fast; coords are normalized anyway
        fw = asset.proxy_width // 4 * 2
        fh = asset.proxy_height // 4 * 2
        prev_gray = None
        frames_meta = []
        mags = []
        last = 0
        for idx, frame in _frames(asset):
            if ctx.cancelled:
                passes.fail_pass(pass_id, "cancelled")
                return None
            gray = cv2.cvtColor(cv2.resize(frame, (fw, fh), interpolation=cv2.INTER_AREA),
                                cv2.COLOR_BGR2GRAY)
            if prev_gray is None:
                frames_meta.append({"frame": idx, "url": None, "scale": 0.0, "meanMag": 0.0})
            else:
                flow = providers.farneback_flow(prev_gray, gray)
                key, scale = writer.write_flow_frame(idx, flow)
                mean_mag = float(np.linalg.norm(flow, axis=2).mean())
                mags.append(mean_mag)
                frames_meta.append({"frame": idx, "url": f"/storage/{key}",
                                    "scale": round(scale, 3), "meanMag": round(mean_mag, 3)})
            prev_gray = gray
            last = idx
            if idx % 15 == 0:
                ctx.update(idx / total, f"optical flow frame {idx}/{total}")
        data_key = writer.finalize({
            "type": "optical_flow", "assetId": asset.id,
            "provider": "motion", "providerVersion": providers.FLOW_VERSION,
            "width": fw, "height": fh, "frames": frames_meta,
        })
        passes.finish_pass(pass_id, data_key, 0, last,
                           {"meanMagnitude": round(float(np.mean(mags)) if mags else 0.0, 3),
                            "frames": len(frames_meta)})
        return {"passId": pass_id}
    except Exception as exc:
        passes.fail_pass(pass_id, str(exc))
        raise


@handler("vision.edge_matte")
def run_edge_matte(ctx):
    p = ctx.params
    src_pass_id = p["maskPassId"]
    pass_id = p["passId"]
    width_frac = float(p.get("edgeWidth", 0.02))
    src = passes.read_pass_data(src_pass_id)
    if src["type"] != "mask":
        raise ValueError("edge matte requires a mask pass")
    writer = passes.PassWriter(pass_id)
    try:
        frames_meta = []
        n = len(src["frames"])
        k = max(int(min(src["width"], src["height"]) * width_frac), 2)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        for i, f in enumerate(src["frames"]):
            if ctx.cancelled:
                passes.fail_pass(pass_id, "cancelled")
                return None
            mask_key = f"vision-passes/{src_pass_id}/masks/{f['frame']:06d}.png"
            mask = cv2.imread(str(storage.path_for(mask_key)), cv2.IMREAD_GRAYSCALE)
            edge = cv2.subtract(cv2.dilate(mask, kernel), cv2.erode(mask, kernel))
            edge = cv2.GaussianBlur(edge, (k | 1, k | 1), 0)
            writer.write_mask_frame(f["frame"], edge)
            frames_meta.append({"frame": f["frame"], "confidence": f.get("confidence")})
            if i % 20 == 0:
                ctx.update(i / n, f"edge matte frame {i}/{n}")
        data_key = writer.finalize({
            "type": "edge_matte", "assetId": src["assetId"],
            "provider": "derive", "providerVersion": "edge-matte/0.1",
            "width": src["width"], "height": src["height"],
            "sourcePassId": src_pass_id, "frames": frames_meta,
        })
        passes.finish_pass(pass_id, data_key, 0,
                           frames_meta[-1]["frame"] if frames_meta else 0,
                           {"frames": len(frames_meta)})
        return {"passId": pass_id}
    except Exception as exc:
        passes.fail_pass(pass_id, str(exc))
        raise


@handler("vision.sapiens")
def run_sapiens(ctx):
    """Meta Sapiens human-centric analysis: body_parts | depth | normals."""
    p = ctx.params
    asset = _get_asset(p["assetId"])
    task = p["task"]
    pass_id = p["passId"]
    if not providers_sapiens.available():
        passes.fail_pass(pass_id, "Sapiens needs a CUDA GPU on the server")
        raise ValueError("Sapiens requires CUDA")
    writer = passes.PassWriter(pass_id)
    size = (asset.proxy_width, asset.proxy_height)
    total = asset.frame_count or 1
    try:
        frames_meta = []
        present_classes: set[int] = set()
        last = 0
        for idx, frame in _frames(asset):
            if ctx.cancelled:
                passes.fail_pass(pass_id, "cancelled")
                return None

            if task == "body_parts":
                ids = providers_sapiens.infer_body_parts(frame)
                ids_full = cv2.resize(ids, size, interpolation=cv2.INTER_NEAREST)
                writer.write_frame("frames", idx, ids_full)  # class id per pixel
                present = np.unique(ids_full)
                present_classes.update(int(c) for c in present)
                frames_meta.append({"frame": idx,
                                    "area": round(float((ids_full > 0).mean()), 4)})

            elif task == "depth":
                d = providers_sapiens.infer_depth(frame)
                d = cv2.resize(d, size, interpolation=cv2.INTER_LINEAR)
                lo, hi = np.percentile(d, [2, 98])
                norm = np.clip((d - lo) / (hi - lo + 1e-6), 0, 1)
                # near = bright: invert so closer surfaces read hotter downstream
                writer.write_frame("frames", idx, ((1 - norm) * 255).astype(np.uint8))
                frames_meta.append({"frame": idx, "min": round(float(lo), 3),
                                    "max": round(float(hi), 3)})

            elif task == "normals":
                n = providers_sapiens.infer_normals(frame)
                n = cv2.resize(n, size, interpolation=cv2.INTER_LINEAR)
                enc = ((n * 0.5 + 0.5) * 255).astype(np.uint8)  # xyz -> RGB
                writer.write_frame("frames", idx, cv2.cvtColor(enc, cv2.COLOR_RGB2BGR))
                frames_meta.append({"frame": idx})
            else:
                raise ValueError(f"unknown sapiens task {task}")

            last = idx
            if idx % 5 == 0:
                ctx.update(idx / total, f"sapiens {task} frame {idx}/{total}")

        pass_type = {"body_parts": "body_parts", "depth": "depth",
                     "normals": "normals"}[task]
        meta = {
            "type": pass_type, "assetId": asset.id,
            "provider": "sapiens", "providerVersion": providers_sapiens.version(task),
            "width": size[0], "height": size[1], "frames": frames_meta,
        }
        if task == "body_parts":
            meta["classNames"] = providers_sapiens.GOLIATH_CLASSES
            meta["presentClasses"] = sorted(present_classes)
        data_key = writer.finalize(meta)
        summary = {"frames": len(frames_meta)}
        if task == "body_parts":
            summary["parts"] = len([c for c in present_classes if c != 0])
        passes.finish_pass(pass_id, data_key, 0, last, summary,
                           providers_sapiens.version(task))
        return {"passId": pass_id}
    except Exception as exc:
        passes.fail_pass(pass_id, str(exc))
        raise


@handler("vision.body_part_mask")
def run_body_part_mask(ctx):
    """Derive a binary mask pass from selected Sapiens body-part class ids.
    Reuses all mask-consuming render layers (datamosh, pixel sort, edge decay)."""
    p = ctx.params
    src_pass_id = p["bodyPartsPassId"]
    part_ids = set(int(i) for i in p["partIds"])
    pass_id = p["passId"]
    src = passes.read_pass_data(src_pass_id)
    if src["type"] != "body_parts":
        raise ValueError("body part mask requires a body_parts pass")
    writer = passes.PassWriter(pass_id)
    names = src.get("classNames", [])
    label = "+".join(names[i] for i in sorted(part_ids) if i < len(names)) or "parts"
    try:
        frames_meta = []
        n = len(src["frames"])
        for i, f in enumerate(src["frames"]):
            if ctx.cancelled:
                passes.fail_pass(pass_id, "cancelled")
                return None
            key = f"vision-passes/{src_pass_id}/frames/{f['frame']:06d}.png"
            ids = cv2.imread(str(storage.path_for(key)), cv2.IMREAD_GRAYSCALE)
            mask = np.isin(ids, list(part_ids)).astype(np.uint8) * 255
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
            writer.write_mask_frame(f["frame"], mask)
            frames_meta.append({"frame": f["frame"], "confidence": 1.0,
                                "area": round(float((mask > 0).mean()), 4)})
            if i % 20 == 0:
                ctx.update(i / n, f"body-part mask {i}/{n}")
        data_key = writer.finalize({
            "type": "mask", "assetId": src["assetId"],
            "provider": "sapiens-derive", "providerVersion": "body-part-mask/0.1",
            "width": src["width"], "height": src["height"],
            "prompt": {"type": "body_parts", "parts": label}, "frames": frames_meta,
        })
        passes.finish_pass(pass_id, data_key, 0,
                           frames_meta[-1]["frame"] if frames_meta else 0,
                           {"frames": len(frames_meta), "parts": label},
                           "body-part-mask/0.1")
        return {"passId": pass_id}
    except Exception as exc:
        passes.fail_pass(pass_id, str(exc))
        raise
