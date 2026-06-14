"""Vision model providers (local-dev roster, IMPLEMENTATION_PLAN AD-6).

Render layers never see these — they consume normalized passes only.
- GrabCutSegmenter: stub for SAM 2.1 (click/box prompts, CSRT-propagated video masks)
- StubDetector:     stub for Grounding DINO (saliency boxes labeled with the prompt)
- MediaPipe landmarks (real, CPU)
- Farneback optical flow (real, CPU)
"""
import cv2
import numpy as np

from . import adapter

GRABCUT_VERSION = "grabcut-csrt/0.1 (stub for sam2.1)"
DETECTOR_VERSION = "stub-saliency/0.1 (stub for grounding-dino)"
FLOW_VERSION = "farneback/opencv"


def _make_box_tracker():
    for name in ("TrackerCSRT_create", "TrackerKCF_create"):
        fn = getattr(cv2, name, None)
        if fn is None and hasattr(cv2, "legacy"):
            fn = getattr(cv2.legacy, name, None)
        if fn:
            return fn()
    return None


# ---------------------------------------------------------------- segmentation

def grabcut_initial_mask(frame: np.ndarray, prompt: dict) -> np.ndarray:
    """Run GrabCut from a click/box prompt. Returns binary u8 mask (0/255)."""
    h, w = frame.shape[:2]
    gc_mask = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)

    if prompt.get("type") == "box":
        x, y, bw, bh = prompt["box"]
        rect = (int(x * w), int(y * h), max(int(bw * w), 8), max(int(bh * h), 8))
        gc_mask[:] = cv2.GC_BGD
        cv2.grabCut(frame, gc_mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    else:
        points = prompt.get("points", [])
        pos = [(int(p["x"] * w), int(p["y"] * h)) for p in points if p.get("positive", True)]
        neg = [(int(p["x"] * w), int(p["y"] * h)) for p in points if not p.get("positive", True)]
        if not pos:
            raise ValueError("click prompt needs at least one positive point")
        r = int(min(w, h) * 0.22)
        for (px, py) in pos:
            cv2.rectangle(gc_mask, (max(px - r, 0), max(py - r, 0)),
                          (min(px + r, w - 1), min(py + r, h - 1)), int(cv2.GC_PR_FGD), -1)
        seed = max(int(min(w, h) * 0.02), 3)
        for (px, py) in pos:
            cv2.circle(gc_mask, (px, py), seed, int(cv2.GC_FGD), -1)
        for (px, py) in neg:
            cv2.circle(gc_mask, (px, py), seed * 2, int(cv2.GC_BGD), -1)
        cv2.grabCut(frame, gc_mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)

    binary = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    return _clean_mask(binary)


def grabcut_propagate(frame: np.ndarray, prev_mask: np.ndarray,
                      bbox: tuple | None) -> np.ndarray:
    """Propagate previous mask to the current frame using it as a GrabCut prior."""
    h, w = frame.shape[:2]
    k = max(int(min(w, h) * 0.02), 3)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    sure_fg = cv2.erode(prev_mask, kernel, iterations=2)
    maybe = cv2.dilate(prev_mask, kernel, iterations=3)
    gc_mask = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
    gc_mask[maybe > 0] = cv2.GC_PR_FGD
    gc_mask[sure_fg > 0] = cv2.GC_FGD
    if bbox is not None:
        x, y, bw, bh = [int(v) for v in bbox]
        pad = k * 4
        region = np.full((h, w), False)
        region[max(y - pad, 0):min(y + bh + pad, h), max(x - pad, 0):min(x + bw + pad, w)] = True
        gc_mask[~region & (gc_mask != cv2.GC_BGD)] = cv2.GC_PR_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(frame, gc_mask, None, bgd, fgd, 2, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return prev_mask.copy()
    binary = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    binary = _clean_mask(binary)
    if binary.sum() == 0:  # lost the subject — freeze rather than vanish
        return prev_mask.copy()
    return binary


def _clean_mask(mask: np.ndarray) -> np.ndarray:
    """Keep dominant connected component plus anything at least 20% of its size."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 1:
        return mask
    areas = stats[1:, cv2.CC_STAT_AREA]
    biggest = areas.max()
    keep = np.zeros_like(mask)
    for i, area in enumerate(areas, start=1):
        if area >= biggest * 0.2:
            keep[labels == i] = 255
    return keep


def mask_bbox(mask: np.ndarray) -> tuple | None:
    pts = cv2.findNonZero(mask)
    if pts is None:
        return None
    return cv2.boundingRect(pts)


def mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a > 0, b > 0).sum()
    union = np.logical_or(a > 0, b > 0).sum()
    return float(inter / union) if union else 0.0


class MaskTracker:
    """CSRT box tracking + GrabCut mask refinement per frame."""

    def __init__(self, first_frame: np.ndarray, first_mask: np.ndarray):
        self.mask = first_mask
        self.tracker = None
        bbox = mask_bbox(first_mask)
        if bbox:
            self.tracker = _make_box_tracker()
            if self.tracker is not None:
                try:
                    self.tracker.init(first_frame, bbox)
                except Exception:
                    self.tracker = None

    def step(self, frame: np.ndarray) -> tuple[np.ndarray, float]:
        bbox = None
        if self.tracker is not None:
            ok, b = self.tracker.update(frame)
            if ok:
                bbox = b
        new_mask = grabcut_propagate(frame, self.mask, bbox)
        confidence = mask_iou(self.mask, new_mask)  # temporal stability as stub confidence
        self.mask = new_mask
        return new_mask, confidence


# ------------------------------------------------------------------- detection

def stub_detect(frame: np.ndarray, prompt_text: str, threshold: float,
                seed: int, frame_idx: int):
    """Saliency-driven fake open-vocab detection. Honest stub: boxes are real
    salient regions, but the label is just the prompt echoed back."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    sal = None
    try:
        saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
        ok, sal_map = saliency.computeSaliency(gray)
        if ok:
            sal = (sal_map * 255).astype(np.uint8)
    except Exception:
        pass
    if sal is None:
        sal = cv2.Laplacian(gray, cv2.CV_8U, ksize=5)
    sal = cv2.GaussianBlur(sal, (21, 21), 0)
    _, binary = cv2.threshold(sal, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = frame.shape[:2]
    min_area = (w * h) * 0.005
    rng = np.random.default_rng(seed * 100003 + frame_idx)
    boxes, scores, labels = [], [], []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        sal_mean = float(sal[y:y + bh, x:x + bw].mean()) / 255.0
        conf = min(0.45 + sal_mean * 0.5 + float(rng.normal(0, 0.03)), 0.99)
        boxes.append([x, y, x + bw, y + bh])
        scores.append(max(conf, 0.01))
        labels.append(prompt_text or "object")
    det = adapter.to_detections(np.array(boxes), np.array(scores), labels)
    return adapter.filter_detections(det, min_confidence=threshold)


# ------------------------------------------------------------------- landmarks
# MediaPipe Tasks API (the legacy mp.solutions API was removed in 0.10.3x).
# Model files download from Google's model garden on first use.

_LANDMARK_MODELS = {
    "face": ("face_landmarker.task",
             "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
             "face_landmarker/float16/latest/face_landmarker.task"),
    "pose": ("pose_landmarker_full.task",
             "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
             "pose_landmarker_full/float16/latest/pose_landmarker_full.task"),
    "hands": ("hand_landmarker.task",
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
              "hand_landmarker/float16/latest/hand_landmarker.task"),
}


def _landmark_model_path(kind: str) -> str:
    import urllib.request
    from ..config import DATA_DIR
    name, url = _LANDMARK_MODELS[kind]
    path = DATA_DIR / "models" / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    return str(path)


def get_landmarker(kind: str):
    """Returns (process_fn(frame_bgr, frame_idx) -> list[entity], connections, closer)."""
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision as mpv

    base = BaseOptions(model_asset_path=_landmark_model_path(kind))
    mode = mpv.RunningMode.VIDEO

    def ts(idx: int) -> int:
        return idx * 33  # monotonic ms timestamps; exact fps doesn't matter here

    def to_image(frame):
        return mp.Image(image_format=mp.ImageFormat.SRGB,
                        data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

    if kind == "face":
        lm = mpv.FaceLandmarker.create_from_options(mpv.FaceLandmarkerOptions(
            base_options=base, running_mode=mode, num_faces=4,
            min_face_detection_confidence=0.4, min_tracking_confidence=0.4))
        connections = sorted({(c.start, c.end) for c in
                              mpv.FaceLandmarksConnections.FACE_LANDMARKS_TESSELATION})

        def process(frame, idx):
            res = lm.detect_for_video(to_image(frame), ts(idx))
            return [{"id": f"face_{i}",
                     "points": [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in lms]}
                    for i, lms in enumerate(res.face_landmarks)]
        return process, connections, lm

    if kind == "pose":
        lm = mpv.PoseLandmarker.create_from_options(mpv.PoseLandmarkerOptions(
            base_options=base, running_mode=mode, num_poses=2,
            min_pose_detection_confidence=0.4, min_tracking_confidence=0.4))
        connections = sorted({(c.start, c.end) for c in
                              mpv.PoseLandmarksConnections.POSE_LANDMARKS})

        def process(frame, idx):
            res = lm.detect_for_video(to_image(frame), ts(idx))
            return [{"id": f"pose_{i}",
                     "points": [[round(p.x, 4), round(p.y, 4), round(p.z, 4),
                                 round(p.visibility or 0.0, 3)] for p in lms]}
                    for i, lms in enumerate(res.pose_landmarks)]
        return process, connections, lm

    if kind == "hands":
        lm = mpv.HandLandmarker.create_from_options(mpv.HandLandmarkerOptions(
            base_options=base, running_mode=mode, num_hands=4,
            min_hand_detection_confidence=0.4, min_tracking_confidence=0.4))
        connections = sorted({(c.start, c.end) for c in
                              mpv.HandLandmarksConnections.HAND_CONNECTIONS})

        def process(frame, idx):
            res = lm.detect_for_video(to_image(frame), ts(idx))
            out = []
            for i, lms in enumerate(res.hand_landmarks):
                handed = None
                if res.handedness and i < len(res.handedness) and res.handedness[i]:
                    handed = res.handedness[i][0].category_name.lower()
                out.append({"id": f"hand_{i}", "handedness": handed,
                            "points": [[round(p.x, 4), round(p.y, 4), round(p.z, 4)]
                                       for p in lms]})
            return out
        return process, connections, lm

    raise ValueError(f"unknown landmark kind {kind}")


def mediapipe_version() -> str:
    import mediapipe as mp
    return f"mediapipe-tasks/{mp.__version__}"


# ---------------------------------------------------------------- optical flow

def farneback_flow(prev_gray: np.ndarray, gray: np.ndarray) -> np.ndarray:
    return cv2.calcOpticalFlowFarneback(
        prev_gray, gray, None,
        pyr_scale=0.5, levels=3, winsize=21, iterations=2,
        poly_n=5, poly_sigma=1.1, flags=0)
