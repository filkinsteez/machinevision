"""Supervision adapter (PRD §13). All detection-shaped model output flows through
sv.Detections before normalization to Machine Industries pass schemas — this is the
interoperability seam that keeps providers swappable.
"""
import numpy as np
import supervision as sv


def to_detections(xyxy: np.ndarray, confidence: np.ndarray,
                  labels: list[str]) -> sv.Detections:
    if len(xyxy) == 0:
        return sv.Detections.empty()
    det = sv.Detections(
        xyxy=np.asarray(xyxy, dtype=np.float32),
        confidence=np.asarray(confidence, dtype=np.float32),
        class_id=np.zeros(len(xyxy), dtype=int),
    )
    det.data["label"] = np.asarray(labels)
    return det


def filter_detections(det: sv.Detections, min_confidence: float,
                      nms_threshold: float = 0.5, max_detections: int = 32) -> sv.Detections:
    if len(det) == 0:
        return det
    det = det[det.confidence >= min_confidence]
    if len(det) == 0:
        return det
    det = det.with_nms(threshold=nms_threshold)
    if len(det) > max_detections:
        order = np.argsort(-det.confidence)[:max_detections]
        det = det[order]
    return det


def detections_to_schema(det: sv.Detections, frame_idx: int,
                         frame_size: tuple[int, int]) -> list[dict]:
    """Normalize sv.Detections to the Detection Pass frame schema (0..1 coords)."""
    w, h = frame_size
    out = []
    labels = det.data.get("label", [None] * len(det))
    for i in range(len(det)):
        x1, y1, x2, y2 = det.xyxy[i]
        d = {
            "id": f"det_{frame_idx}_{i}",
            "label": str(labels[i]) if labels[i] is not None else "object",
            "bbox": [round(float(x1) / w, 4), round(float(y1) / h, 4),
                     round(float(x2) / w, 4), round(float(y2) / h, 4)],
            "confidence": round(float(det.confidence[i]), 4) if det.confidence is not None else None,
        }
        if det.tracker_id is not None:
            d["trackId"] = f"track_{int(det.tracker_id[i])}"
        out.append(d)
    return out


def make_tracker() -> sv.ByteTrack:
    return sv.ByteTrack()
