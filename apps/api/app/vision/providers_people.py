"""People provider: YOLO11x-pose — one-stage multi-person boxes + 17-keypoint
COCO skeletons with built-in ByteTrack IDs. Replaces MediaPipe for pose (which
degrades badly past ~2 people). GPU-only; MediaPipe remains the CPU fallback.
"""
import threading

import numpy as np

MODEL_ID = "yolo11x-pose.pt"  # auto-downloads from ultralytics on first use

# COCO-17 keypoint skeleton (indices: 0 nose, 1/2 eyes, 3/4 ears, 5/6 shoulders,
# 7/8 elbows, 9/10 wrists, 11/12 hips, 13/14 knees, 15/16 ankles)
COCO_CONNECTIONS: list[tuple[int, int]] = [
    (0, 1), (0, 2), (1, 3), (2, 4), (0, 5), (0, 6),
    (5, 7), (7, 9), (6, 8), (8, 10), (5, 6),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
]

_lock = threading.RLock()
_state: dict = {}


def available() -> bool:
    if "available" not in _state:
        try:
            import torch
            _state["available"] = bool(torch.cuda.is_available())
        except Exception:
            _state["available"] = False
    return _state["available"]


def version() -> str:
    import ultralytics
    return f"{MODEL_ID} (ultralytics {ultralytics.__version__})"


def _device_index() -> int:
    if "device" not in _state:
        from .providers_real import pick_gpu
        _state["device"] = pick_gpu()
    return _state["device"]


def _get_model():
    with _lock:
        if "model" not in _state:
            from ultralytics import YOLO
            _state["model"] = YOLO(MODEL_ID)
        return _state["model"]


def reset_tracker():
    """Fresh track IDs per job."""
    with _lock:
        model = _state.get("model")
        try:
            if model is not None and getattr(model, "predictor", None) is not None:
                for t in getattr(model.predictor, "trackers", []) or []:
                    t.reset()
        except Exception:
            pass


def track_frame(frame_bgr: np.ndarray, conf: float = 0.35):
    """Detect+track all people in one frame.
    Returns list of {trackId, bbox(norm x1y1x2y2), confidence, points 17x[x,y,0,kconf]}.
    """
    with _lock:
        model = _get_model()
        res = model.track(frame_bgr, persist=True, verbose=False, conf=conf,
                          tracker="bytetrack.yaml", device=_device_index())[0]
        h, w = frame_bgr.shape[:2]
        out = []
        if res.boxes is None or len(res.boxes) == 0:
            return out
        boxes = res.boxes.xyxy.cpu().numpy()
        confs = res.boxes.conf.cpu().numpy()
        ids = res.boxes.id.cpu().numpy().astype(int) if res.boxes.id is not None else None
        kxy = res.keypoints.xyn.cpu().numpy() if res.keypoints is not None else None
        kcf = (res.keypoints.conf.cpu().numpy()
               if res.keypoints is not None and res.keypoints.conf is not None else None)
        for i in range(len(boxes)):
            x1, y1, x2, y2 = boxes[i]
            points = []
            if kxy is not None and i < len(kxy):
                for j in range(kxy.shape[1]):
                    kc = float(kcf[i][j]) if kcf is not None else 1.0
                    points.append([round(float(kxy[i][j][0]), 4),
                                   round(float(kxy[i][j][1]), 4), 0.0, round(kc, 3)])
            out.append({
                "trackId": int(ids[i]) if ids is not None else i,
                "bbox": [round(float(x1) / w, 4), round(float(y1) / h, 4),
                         round(float(x2) / w, 4), round(float(y2) / h, 4)],
                "confidence": round(float(confs[i]), 4),
                "points": points,
            })
        return out
